'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{spawn}=require('node:child_process');

const MAX_AUDIO_PACKET=192000,MAX_HELPER_OUTPUT=1024*1024;
class AudioPacketReader{
  constructor(onPacket){this.onPacket=onPacket;this.pending=Buffer.alloc(0);this.failed=false;}
  push(bytes){
    if(this.failed)return;
    try{
      this.pending=Buffer.concat([this.pending,bytes]);
      while(this.pending.length>=5){
        const type=this.pending[0],length=this.pending.readUInt32BE(1);
        if(type>2||length<1||length>MAX_AUDIO_PACKET)throw Error('Invalid PC audio packet.');
        if(this.pending.length<length+5)break;
        const data=this.pending.subarray(5,length+5);this.pending=this.pending.subarray(length+5);this.onPacket(type,data);
      }
      if(this.pending.length>MAX_AUDIO_PACKET+5)throw Error('PC audio buffer exceeded its limit.');
    }catch(error){this.failed=true;this.pending=Buffer.alloc(0);throw error;}
  }
  end(){if(this.pending.length)throw Error('PC audio ended with an incomplete packet.');}
}
function validFormat(value){return value&&value.type==='format'&&value.encoding==='f32le'&&value.source==='system-output'&&Number.isInteger(value.sampleRate)&&value.sampleRate>=8000&&value.sampleRate<=192000&&Number.isInteger(value.channels)&&value.channels>=1&&value.channels<=2;}
function createNativeFeatures({root,spawnImpl=spawn,platform=process.platform,fsImpl=fs,now=Date.now}={}){
  if(typeof root!=='string')throw TypeError('Native feature root is required.');
  const appTokens=new Map(),audioSessions=new Set(),phoneSessions=new Set();let closed=false;
  function helper(argument){
    if(closed)throw Error('PC services are stopping.');
    if(platform!=='win32')throw Error('This feature requires the Windows host.');
    const exe=path.join(root,'RemoteAgent','bin','RemoteAgent.exe'),dll=path.join(root,'RemoteAgent','bin','RemoteAgent.dll');
    if(!fsImpl.existsSync(exe)&&!fsImpl.existsSync(dll))throw Error('Restart with start.bat to build the Windows helper.');
    return spawnImpl(fsImpl.existsSync(exe)?exe:'dotnet',fsImpl.existsSync(exe)?[argument]:[dll,argument],{cwd:root,windowsHide:true,stdio:['pipe','pipe','pipe']});
  }
  function request(argument,input){return new Promise((resolve,reject)=>{
    let child;try{child=helper(argument);}catch(error){reject(error);return;}
    let output='',done=false;
    const timer=setTimeout(()=>{finish(Error('The Windows helper timed out. Try again.'));child.kill();},5000);timer.unref?.();
    function finish(error,value){if(done)return;done=true;clearTimeout(timer);if(error)reject(error);else resolve(value);}
    child.stdin.on('error',()=>{});child.stderr.resume();child.stdout.setEncoding('utf8');
    child.stdout.on('data',chunk=>{output+=chunk;if(Buffer.byteLength(output)>MAX_HELPER_OUTPUT){finish(Error('The Windows helper response is too large.'));child.kill();}});
    child.on('error',()=>finish(Error('The Windows helper could not start.')));
    child.on('close',()=>{if(done)return;try{const value=JSON.parse(output);if(value?.ok!==true)throw Error(value?.error||'This Windows action is unavailable.');finish(null,value);}catch(error){finish(error);}});
    child.stdin.end(input?JSON.stringify(input):'','utf8');
  });}
  function prune(){for(const [key,value]of appTokens)if(value.until<=now())appTokens.delete(key);}
  async function listApps(){
    const result=await request('--apps-list');prune();
    if(!Array.isArray(result.apps)||result.apps.length>256)throw Error('Invalid Windows app list.');
    const apps=[];
    for(const app of result.apps){
      if(!app||typeof app.handle!=='string'||!/^[a-f0-9]{1,16}$/i.test(app.handle)||!Number.isInteger(app.pid)||app.pid<=0||typeof app.startTicks!=='string'||!/^\d{1,20}$/.test(app.startTicks)||typeof app.title!=='string'||app.title.length>1024||typeof app.processName!=='string'||app.processName.length>256)continue;
      const id=crypto.randomBytes(18).toString('base64url');appTokens.set(id,{handle:app.handle,pid:app.pid,startTicks:app.startTicks,until:now()+120000});
      apps.push({id,title:app.title,processName:app.processName,minimized:!!app.minimized,active:!!app.active});
    }
    while(appTokens.size>2048)appTokens.delete(appTokens.keys().next().value);
    return {ok:true,apps};
  }
  async function focusApp(id){
    prune();if(typeof id!=='string'||!/^[A-Za-z0-9_-]{24}$/.test(id)||!appTokens.has(id)){const error=Error('This app selection expired. Refresh the app list.');error.status=400;throw error;}
    const {handle,pid,startTicks}=appTokens.get(id);await request('--app-focus',{handle,pid,startTicks});return {ok:true};
  }
  function presentationApp(id){
    prune();if(typeof id!=='string'||!/^[A-Za-z0-9_-]{24}$/.test(id)||!appTokens.has(id)){const error=Error('This window selection expired. Choose the window again.');error.status=400;throw error;}
    const entry=appTokens.get(id);entry.until=now()+6*60*60*1000;const {handle,pid,startTicks}=entry;return {handle,pid,startTicks};
  }
  function openAudio({onMetadata=()=>{},onPcm=()=>{},onError=()=>{},onClose=()=>{}}={}){
    let child,format=null,stopped=false,ended=false,failed=false;
    const timer=setTimeout(()=>fail(Error('PC audio did not start. Check the PC output device.')),10000);timer.unref?.();
    let killTimer;
    const session={stop};audioSessions.add(session);
    function finish(){if(ended)return;ended=true;clearTimeout(timer);clearTimeout(killTimer);audioSessions.delete(session);onClose();}
    function stop(){if(stopped)return;stopped=true;clearTimeout(timer);if(!child){finish();return;}try{child.stdin.end('stop\n');}catch{}killTimer=setTimeout(()=>{try{child.kill();}catch{}finish();},750);killTimer.unref?.();}
    function fail(error){if(failed||stopped)return;failed=true;try{onError(error);}finally{stop();}}
    const reader=new AudioPacketReader((type,data)=>{
      if(stopped)return;
      if(type===1){if(format)throw Error('PC audio format unexpectedly changed.');const value=JSON.parse(data.toString('utf8'));if(!validFormat(value))throw Error('Unsupported PC audio format.');format=value;clearTimeout(timer);onMetadata(value);}
      else if(type===2){const value=JSON.parse(data.toString('utf8'));fail(Error(typeof value.error==='string'?value.error:'PC audio stopped.'));}
      else {if(!format||data.length%(format.channels*4))throw Error('Invalid PC audio samples.');onPcm(data);}
    });
    try{
      child=helper('--audio');child.stdin.on('error',()=>{});child.stderr.resume();
      child.stdout.on('data',bytes=>{try{reader.push(bytes);}catch(error){fail(error);}});
      child.on('error',()=>fail(Error('The PC audio helper could not start.')));
      child.on('close',()=>{if(!stopped){try{reader.end();fail(Error('PC audio disconnected. Tap Start to reconnect.'));}catch(error){fail(error);}}finish();});
    }catch(error){queueMicrotask(()=>fail(error));}
    return session;
  }
  function openAudioOutput({sampleRate,channels,encoding='s16le',volume=.6,output:outputDevice='speakers',onReady=()=>{},onError=()=>{},onClose=()=>{}}={}){
    if(!['speakers','virtual-mic'].includes(outputDevice))throw Error('Choose PC speakers or the Windows microphone.');
    if(!['s16le','opus'].includes(encoding)||encoding==='opus'&&sampleRate!==48000)throw Error('Invalid phone audio encoding.');
    if(!Number.isInteger(sampleRate)||sampleRate<8000||sampleRate>48000||![1,2].includes(channels)||!Number.isFinite(volume)||volume<0||volume>1)throw Error('Invalid phone audio format.');
    const child=helper('--audio-playback');let stopped=false,ended=false,ready=false,output='';const capacity=Math.max(16384,Math.ceil(sampleRate*channels*2*.2));let killTimer;
    const timer=setTimeout(()=>fail(Error('The PC output did not start.')),8000);timer.unref?.();
    function packet(type,bytes=Buffer.alloc(0)){const header=Buffer.alloc(5);header[0]=type;header.writeUInt32BE(bytes.length,1);return Buffer.concat([header,bytes]);}
    function finish(){if(ended)return;ended=true;clearTimeout(timer);clearTimeout(killTimer);audioSessions.delete(session);onClose();}
    function stop(){if(stopped)return;stopped=true;clearTimeout(timer);try{child.stdin.end(packet(2));}catch{}killTimer=setTimeout(()=>{try{child.kill();}catch{}finish();},750);killTimer.unref?.();}
    function fail(error){if(stopped)return;onError(error);stop();}
    const session={stop,sendPcm(bytes){if(stopped||!ready||!child.stdin.writable)return false;if(!Buffer.isBuffer(bytes)||bytes.length>65536||bytes.length%(channels*2)!==0)throw Error('Invalid PCM block');if(child.stdin.writableLength>capacity)return false;return child.stdin.write(packet(0,bytes));},sendOpus(bytes){if(stopped||!ready||!child.stdin.writable)return false;if(!Buffer.isBuffer(bytes)||bytes.length<1||bytes.length>4096)throw Error('Invalid Opus packet');if(child.stdin.writableLength>capacity)return false;return child.stdin.write(packet(3,bytes));},setVolume(value){if(!stopped&&Number.isFinite(value)&&value>=0&&value<=1&&child.stdin.writableLength<=capacity)child.stdin.write(packet(1,Buffer.from(JSON.stringify({volume:value}))));}};audioSessions.add(session);
    child.stdin.on('error',()=>fail(Error('PC audio output disconnected.')));child.stderr.resume();child.stdout.setEncoding('utf8');
    child.stdout.on('data',text=>{if(stopped)return;output+=text;if(output.length>8192){fail(Error('Invalid PC audio output response.'));return;}let newline;while((newline=output.indexOf('\n'))>=0){const line=output.slice(0,newline);output=output.slice(newline+1);try{const value=JSON.parse(line);if(value.type==='started'&&!ready){ready=true;clearTimeout(timer);onReady();}else if(value.type==='error')fail(Error('PC audio output is unavailable.'));else throw Error('Unexpected output message');}catch{fail(Error('PC audio output is unavailable.'));}}});
    child.on('error',()=>fail(Error('The Windows output helper could not start.')));child.on('close',()=>{if(!stopped)fail(Error('The Windows output helper stopped.'));finish();});
    child.stdin.write(JSON.stringify({sampleRate,channels,volume,...outputDevice==='virtual-mic'&&{output:outputDevice},...encoding==='opus'&&{encoding}})+'\n');return session;
  }
  function openPhoneInput({side='right',width,height,sensitivity=1,onEvent=()=>{},onError=()=>{},onClose=()=>{}}={}){
    function config(value){if(!['left','right','top','bottom'].includes(value.side)||!Number.isInteger(value.width)||!Number.isInteger(value.height)||value.width<2||value.height<2||value.width>16384||value.height>16384||!Number.isFinite(value.sensitivity)||value.sensitivity<.3||value.sensitivity>3)throw Error('Choose a valid phone arrangement.');return {side:value.side,width:value.width,height:value.height,sensitivity:value.sensitivity};}
    const initial=config({side,width,height,sensitivity}),child=helper('--phone-handoff');let stopped=false,ended=false,pending='',killTimer;
    function finish(){if(ended)return;ended=true;clearInterval(heartbeat);clearTimeout(killTimer);phoneSessions.delete(session);onClose();}
    function write(value){if(stopped||!child.stdin.writable||child.stdin.writableLength>8192)return false;return child.stdin.write(JSON.stringify(value)+'\n');}
    function stop(){if(stopped)return;stopped=true;clearInterval(heartbeat);try{child.stdin.end('{"type":"stop"}\n');}catch{}killTimer=setTimeout(()=>{try{child.kill();}catch{}finish();},1500);killTimer.unref?.();}
    function fail(){if(stopped)return;try{onError(Error('Windows mouse handoff stopped. Your PC mouse has been released.'));}finally{stop();}}
    const session={stop,release:()=>write({type:'release'}),update:value=>write({type:'config',...config(value)})};phoneSessions.add(session);
    const heartbeat=setInterval(()=>{if(!write({type:'heartbeat'}))fail();},1000);heartbeat.unref?.();
    child.stdin.on('error',fail);child.stderr.resume();child.stdout.setEncoding('utf8');
    child.stdout.on('data',text=>{if(stopped)return;pending+=text;if(pending.length>16384){fail();return;}let newline;while((newline=pending.indexOf('\n'))>=0){const line=pending.slice(0,newline);pending=pending.slice(newline+1);try{const value=JSON.parse(line);if(!['state','pointer','drag','down','up','longpress','wheel','key','text'].includes(value.kind))throw Error();if(value.kind==='state'){if(!['armed','active'].includes(value.state))throw Error();}else if(value.kind==='text'){if(typeof value.text!=='string'||!value.text||value.text.length>256||value.text.includes('\0'))throw Error();}else if(value.kind==='key'){if(typeof value.key!=='string'||value.key.length>24||!Number.isInteger(value.modifiers)||value.modifiers<0||value.modifiers>7)throw Error();}else if(!Number.isFinite(value.x)||!Number.isFinite(value.y)||value.x<0||value.x>1||value.y<0||value.y>1)throw Error();onEvent(value);}catch{fail();return;}}});
    child.on('error',fail);child.on('close',()=>{if(!stopped)fail();finish();});write(initial);return session;
  }
  function close(){closed=true;appTokens.clear();for(const session of audioSessions)session.stop();for(const session of phoneSessions)session.stop();}
  async function sendMedia(action){
    if(!['volup','voldown','mute','playpause','next','prev'].includes(action))throw Error('Invalid media command.');
    return request('--media',{action});
  }
  async function openLink(value){
    if(typeof value!=='string'||value.length>4096||/[\u0000-\u0020\u007f]/.test(value))throw Error('Use a valid http or https link.');
    let url;try{url=new URL(value);}catch{throw Error('Use a valid http or https link.');}
    if(!['http:','https:'].includes(url.protocol)||url.username||url.password)throw Error('Use a valid http or https link.');
    return request('--open-link',{url:url.href});
  }
  let currentAppPending=null,currentAppValue=null,currentAppAt=0;
  async function currentApp(){if(currentAppValue&&now()-currentAppAt<1500)return currentAppValue;if(currentAppPending)return currentAppPending;currentAppPending=request('--app-current').then(value=>{currentAppValue=value;currentAppAt=now();return value;}).finally(()=>currentAppPending=null);return currentAppPending;}
  return {openPhoneInput,fileLocations:()=>request('--file-locations'),fileThumbnail:file=>request('--file-thumbnail',{path:file}),listApps,currentApp,focusApp,presentationApp,sendMedia,openLink,openAudio,openAudioOutput,audioDevices:()=>request('--audio-devices'),close};
}
module.exports={createNativeFeatures,AudioPacketReader,validFormat};
