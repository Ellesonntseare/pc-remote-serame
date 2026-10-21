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
  const appTokens=new Map(),audioSessions=new Set();let closed=false;
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
    const timer=setTimeout(()=>{finish(Error('The app list timed out. Try again.'));child.kill();},5000);timer.unref?.();
    function finish(error,value){if(done)return;done=true;clearTimeout(timer);if(error)reject(error);else resolve(value);}
    child.stdin.on('error',()=>{});child.stderr.resume();child.stdout.setEncoding('utf8');
    child.stdout.on('data',chunk=>{output+=chunk;if(Buffer.byteLength(output)>MAX_HELPER_OUTPUT){finish(Error('The app list is too large.'));child.kill();}});
    child.on('error',()=>finish(Error('The Windows app helper could not start.')));
    child.on('close',()=>{if(done)return;try{const value=JSON.parse(output);if(value?.ok!==true)throw Error(value?.error||'Windows apps are unavailable.');finish(null,value);}catch(error){finish(error);}});
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
  function close(){closed=true;appTokens.clear();for(const session of audioSessions)session.stop();}
  return {listApps,focusApp,openAudio,close};
}
module.exports={createNativeFeatures,AudioPacketReader,validFormat};
