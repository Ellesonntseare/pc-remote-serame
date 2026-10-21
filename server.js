'use strict';
// Visible, LAN-only Windows PC Remote service. Runs only while user keeps the host console open.
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn, execFile } = require('node:child_process');
const { WebSocketServer, WebSocket } = require('ws');
const ScreenPacketReader = require('./public/screen-packets');
const {createFileTransfers}=require('./file-transfers');
const nativeClipboard=require('./native-clipboard');
const {createNativeFeatures}=require('./native-features');
const {createSmartQuality}=require('./smart-quality');
const {createGuestRequests}=require('./guest-requests');
const {can}=require('./guest-permissions');
const {createGuestScreen}=require('./guest-screen');
const {createWebRtcVideo,iceServers}=require('./webrtc-video');
const wakeOnLan=require('./wake-on-lan');
const {createHandoffs}=require('./handoffs');
const {createCollaboration}=require('./collaboration');
const {png,imageTool}=require('./image-tools');
const scrypt=require('node:util').promisify(crypto.scrypt);
const ROOT = __dirname;
const PRESETS = { low: [35, 0.40, 12], med: [50, 0.60, 20], high: [70, 0.85, 24], hd: [85, 1.0, 30], auto: [85,1.0,24] };
const commands = new Set(['shutdown','restart','logoff','sleep','lock','volup','voldown','mute','playpause','next','prev','cancel']);
const COOKIE_NAME = 'pc_remote_session';
const SESSION_TIME = 2 * 60 * 60 * 1000;
const MAX_PACKET = 8 * 1024 * 1024;
// Node timers overflow above about 24.8 days; remembered sessions last 30 days.
function sessionExpiry(until,expire){
  let timer,stopped=false;
  function check(){if(stopped)return;const remaining=until-Date.now();if(remaining<=0){expire();return;}timer=setTimeout(check,Math.min(remaining,2147483647));timer.unref();}
  check();return()=>{stopped=true;clearTimeout(timer);};
}
// Explicit public asset map: no arbitrary filesystem paths or paired data.
const PWA_ASSETS = new Map([
  ['/screen-packets.js', ['screen-packets.js', 'text/javascript; charset=utf-8']],
  ['/screen-renderer.js', ['screen-renderer.js', 'text/javascript; charset=utf-8']],
  ['/remote-cursor.js', ['remote-cursor.js', 'text/javascript; charset=utf-8']],
  ['/file-transfers.js', ['file-transfers.js', 'text/javascript; charset=utf-8']],
  ['/file-transfers.css', ['file-transfers.css', 'text/css; charset=utf-8']],
  ['/brand.svg', ['brand.svg', 'image/svg+xml']],
  ['/app-refinements.css', ['app-refinements.css', 'text/css; charset=utf-8']],
  ...['audio-worklet.js','pc-audio.js','app-switcher.js','precision-lens.js','guest-access.js','guest-screen.js'].map(name=>['/'+name,[name,'text/javascript; charset=utf-8']]),
  ...['native-features.css','precision-lens.css','pointer-settings.css','guest-access.css','guest-screen.css'].map(name=>['/'+name,[name,'text/css; charset=utf-8']]),
  ['/input-transport.js', ['input-transport.js', 'text/javascript; charset=utf-8']],
  ['/pwa.js', ['pwa.js', 'text/javascript; charset=utf-8']],
  ['/pwa.css', ['pwa.css', 'text/css; charset=utf-8']],
  ['/screen-tools.js', ['screen-tools.js', 'text/javascript; charset=utf-8']],
  ['/touch-gestures.js', ['touch-gestures.js', 'text/javascript; charset=utf-8']],
  ['/webrtc-video.js', ['webrtc-video.js', 'text/javascript; charset=utf-8']],
  ['/webrtc-video.css', ['webrtc-video.css', 'text/css; charset=utf-8']],
  ['/session-features.js', ['session-features.js', 'text/javascript; charset=utf-8']],
  ['/session-features.css', ['session-features.css', 'text/css; charset=utf-8']],
  ['/collaboration.js', ['collaboration.js', 'text/javascript; charset=utf-8']],
  ['/collaboration.css', ['collaboration.css', 'text/css; charset=utf-8']],
  ['/image-tools.js', ['image-tools.js', 'text/javascript; charset=utf-8']],
  ['/image-tools.css', ['image-tools.css', 'text/css; charset=utf-8']],
  ['/screen-tools.css', ['screen-tools.css', 'text/css; charset=utf-8']],
  ['/desktop-controls.js', ['desktop-controls.js', 'text/javascript; charset=utf-8']],
  ['/desktop-controls.css', ['desktop-controls.css', 'text/css; charset=utf-8']],
  ['/sw.js', ['sw.js', 'text/javascript; charset=utf-8']],
  ['/icons/icon-192.png', ['icon-192.png', 'image/png']],
  ['/icons/icon-512.png', ['icon-512.png', 'image/png']],
  ['/icons/icon-maskable-512.png', ['icon-maskable-512.png', 'image/png']],
  ['/icons/apple-touch-icon.png', ['apple-touch-icon.png', 'image/png']],
]);
function addresses() {
  const a = [];
  for (const nics of Object.values(os.networkInterfaces())) for (const n of nics || [])
    if (n.family === 'IPv4' && !n.internal) a.push(n.address);
  return a;
}
function privateIP(ip) {
  ip = (ip || '').replace(/^::ffff:/, '');
  if (ip === '::1') return true;
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some(n => !Number.isInteger(n) || n < 0 || n > 255)) return false;
  return parts[0] === 127 || parts[0] === 10 ||
    (parts[0] === 192 && parts[1] === 168) ||
    (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31);
}
function loopbackIP(ip) {
  return ['127.0.0.1','::1','::ffff:127.0.0.1'].includes(ip);
}
function tunnelHost(value) {
  if (value === undefined || value === '') return '';
  if (typeof value !== 'string' || value.length > 253 || !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(value))
    throw new Error('tunnelHostname must be an exact DNS hostname, without scheme, port or path');
  return value.toLowerCase();
}
function sameHost(hostHeader, allowed) {
  if (!hostHeader) return false;
  const host = hostHeader.toLowerCase().replace(/:\d+$/, '');
  return allowed.has(host);
}
const respond = (res, status, payload, headers={}) => {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers });
  res.end(JSON.stringify(payload));
};
async function jsonBody(req, max=4096) {
  let size=0, parts=[];
  for await (const b of req) { size += b.length; if(size > max) throw new Error('Request too large'); parts.push(b); }
  try { return JSON.parse(Buffer.concat(parts).toString('utf8') || '{}'); } catch { throw new Error('Invalid JSON'); }
}
function validInput(c) {
  if(typeof c !== 'string' || c.length > 90000) return false;
  const [verb, ...rest] = c.split(' '), v=rest.join(' ');
  if (['mv','abs'].includes(verb)) return /^-?\d{1,6} -?\d{1,6}$/.test(v);
  if (verb === 'wheel') return /^-?\d{1,5}$/.test(v);
  if (['click','down','up'].includes(verb)) return /^[lrm]$/.test(v);
  if (verb === 'dbl') return v === '';
  if (['key','keydown','keyup'].includes(verb)) return /^\d{1,3}$/.test(v) && Number(v)<=255;
  if (verb === 'combo') return /^\d{1,3}(,\d{1,3}){1,3}$/.test(v) && v.split(',').every(x => Number(x)<=255);
  if (verb === 'text' || verb === 'paste' || verb === 'edit') {
    const limit = verb === 'text' ? 600 : 65536;
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(v) || v.length % 4 !== 0 || v.length > Math.ceil(limit / 3) * 4) return false;
    const bytes=Buffer.from(v,'base64');
    if(bytes.length < 1 || bytes.length > limit || bytes.toString('base64') !== v) return false;
    try {
      const decoded = new TextDecoder('utf-8',{fatal:true}).decode(bytes);
      if (verb !== 'edit') return true;
      const edit = JSON.parse(decoded);
      if (!edit || Array.isArray(edit) || typeof edit !== 'object' ||
          Object.keys(edit).sort().join(',') !== 'remove,text' ||
          !Number.isInteger(edit.remove) || edit.remove < 0 || edit.remove > 16000 ||
          typeof edit.text !== 'string' || edit.text.length > 16000 || edit.text.includes('\0')) return false;
      // JSON can escape isolated UTF-16 surrogates even when its bytes are valid UTF-8.
      for (let i=0; i<edit.text.length; i++) {
        const unit=edit.text.charCodeAt(i);
        if (unit>=0xd800 && unit<=0xdbff) {
          const next=edit.text.charCodeAt(++i);
          if (!(next>=0xdc00 && next<=0xdfff)) return false;
        } else if (unit>=0xdc00 && unit<=0xdfff) return false;
      }
      return true;
    } catch { return false; }
  }
  return false;
}
function createApp(options={}) {
  const rtcServers=iceServers(options.webRtcIceServers);
  const tunnelHostname = tunnelHost(options.tunnelHostname);
  const requirePin = options.requirePin ?? !!options.pin;
  const requirePassword=typeof options.password==='string'&&options.password.length>0;
  const passwordSalt=crypto.randomBytes(16),passwordHash=requirePassword?crypto.scryptSync(options.password,passwordSalt,32):null;
  const guestHash=requirePassword?crypto.scryptSync('guest',passwordSalt,32):null;
  const guestRequests=createGuestRequests();
  const handoffs=createHandoffs();
  const pin = options.pin || String(crypto.randomInt(10000000,99999999));
  const port = options.port ?? Number(process.env.PORT || 7666);
  const enabled = options.screen ?? true;
  const hostname = options.deviceName||os.hostname();
  const interfaces = addresses();
  const hostnames = new Set(['localhost','127.0.0.1',os.hostname().toLowerCase(),...interfaces]);
  const sessions = new Map(), strikes = new Map(), activity=[];
  const nativeFeatures=options.nativeFeatures||createNativeFeatures({root:ROOT});
  const audioSockets=new Set();
  const accountContext=requirePassword?crypto.createHash('sha256').update('pc-remote-owner-v1\0'+options.password).digest('hex'):undefined;
  const smart=createSmartQuality();
  const fileTransfers=createFileTransfers({directory:options.transferDirectory||path.join(os.homedir(),'Downloads','PC Remote Transfers'),maxBytes:options.maxFileBytes});
  const sessionKey=token=>crypto.createHash('sha256').update(token).digest('hex');
  if(options.sessionFile)try{
    for(const [key,session] of JSON.parse(fs.readFileSync(options.sessionFile,'utf8')))if(/^[a-f0-9]{64}$/.test(key)&&session.persistent===true&&session.until>Date.now())sessions.set(key,session);
  }catch(e){if(e.code!=='ENOENT')console.error('Remembered logins could not be loaded. Please sign in again.');}
  function saveSessions(){
    if(!options.sessionFile)return;
    const data=Array.from(sessions).filter(([,s])=>s.persistent&&s.until>Date.now());
    fs.writeFileSync(options.sessionFile+'.tmp',JSON.stringify(data),{mode:0o600});fs.renameSync(options.sessionFile+'.tmp',options.sessionFile);
  }
  const viewers = new Set();
  let videoSequence=0,captureDemand=false,captureRequested=false,baseQuality=50,currentQuality=50,lastQualityChange=0;
  let regionMode=false,regionBase=null,refreshPending=false;
  const inputSockets = new Set();
  const inputHeld = new WeakMap();
  const pendingInput = new Map();
  function failPending(message) {
    for(const item of pendingInput.values()){clearTimeout(item.timer);item.reject(new Error(message));}
    pendingInput.clear();
  }
  let agent=null, agentPreset=null, agentMeta=null, agentBuffer=new ScreenPacketReader(MAX_PACKET), agentReady=false;
  const record=(ip,text,preview)=>{activity.unshift({t:Date.now(),ip,text,...typeof preview==='string'&&{preview:preview.slice(0,2000)}});activity.length=Math.min(20,activity.length);};
  const cookie=(req,name=COOKIE_NAME)=>{
    const raw=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(name+'='));
    return raw?raw.slice(name.length+1):'';
  };
  const auth=(req)=>{
    const token=sessionKey(cookie(req)), s=sessions.get(token);
    if(!s || (!s.persistent&&s.ip!==req.socket.remoteAddress) || s.until<Date.now()) {sessions.delete(token);return null;}
    return token;
  };
  const requiresHeader=(req)=>req.headers['x-pcr']==='1';
  const permits=(token,key)=>can(sessions.get(token),key);
  const accessInfo=token=>({role:sessions.get(token).role||'owner',until:sessions.get(token).until,...(sessions.get(token).role==='guest'?{permissions:sessions.get(token).permissions||{},guestId:sessions.get(token).guestId}:{})});
  const isTunnelRequest=req=>!!tunnelHostname&&loopbackIP(req.socket.remoteAddress)&&sameHost(req.headers.host,new Set([tunnelHostname]));
  const allowedRequest=req=>tunnelHostname?isTunnelRequest(req):privateIP(req.socket.remoteAddress)&&sameHost(req.headers.host,hostnames);
  function videoPacket(type,value){
    const payload=Buffer.from(JSON.stringify(value)),header=Buffer.alloc(5);
    header[0]=type;header.writeUInt32BE(payload.length,1);return Buffer.concat([header,payload]);
  }
  function viewerMetadata(viewer){return videoPacket(1,{...JSON.parse(agentMeta.subarray(5).toString('utf8')),streamId:viewer.streamId});}
  function requestVideoFrame(){
    if(!captureDemand||captureRequested||!agent?.stdin.writable)return;
    if(!Array.from(viewers).some(v=>v.res.writable&&!v.busy&&v.inFlight.size<2))return;
    if(regionMode&&!refreshPending&&Array.from(viewers).some(v=>v.regions&&v.regionBase!==regionBase&&v.res.writable&&!v.busy&&v.inFlight.size<2)){
      refreshPending=true;agent.stdin.write('refresh\n');
    }
    captureRequested=true;agent.stdin.write('frame\n');
  }
  function updateVideoDemand(){
    const nextRegions=viewers.size>0&&Array.from(viewers).every(v=>v.regions);
    if(nextRegions!==regionMode){
      regionMode=nextRegions;regionBase=null;refreshPending=false;
      for(const v of viewers)v.regionBase=null;
      if(agent?.stdin.writable)agent.stdin.write('regions '+(regionMode?1:0)+'\n');
    }
    const next=viewers.size>0&&Array.from(viewers).every(v=>v.feedbackSocket?.readyState===WebSocket.OPEN);
    if(next!==captureDemand){captureDemand=next;captureRequested=false;if(agent?.stdin.writable)agent.stdin.write('flow '+(next?1:0)+'\n');}
    requestVideoFrame();
  }
  function acknowledgeVideo(viewer,id){
    if(!Number.isSafeInteger(id)||!viewer.inFlight.has(id))return;
    const elapsed=Math.max(1,Date.now()-viewer.inFlight.get(id));
    for(const old of viewer.inFlight.keys())if(old<=id)viewer.inFlight.delete(old);
    viewer.deliveryMs=viewer.deliveryMs?viewer.deliveryMs*.75+elapsed*.25:elapsed;
    if(agentPreset==='auto'){
      smart.sample({deliveryMs:Math.max(...Array.from(viewers,v=>v.deliveryMs||0))});applySmartQuality();requestVideoFrame();return;
    }
    const delivery=Math.max(...Array.from(viewers,v=>v.feedbackSocket?v.deliveryMs||0:0)),now=Date.now();
    let next=currentQuality;
    if(delivery>240&&now-lastQualityChange>1500)next=Math.max(Math.min(baseQuality,40),currentQuality-10);
    else if(delivery>0&&delivery<110&&now-lastQualityChange>5000)next=Math.min(baseQuality,currentQuality+5);
    if(next!==currentQuality&&agent?.stdin.writable){currentQuality=next;lastQualityChange=now;agent.stdin.write('quality '+next+'\n');}
    requestVideoFrame();
  }
  function disconnectInput(ws,code=1008,message='Session ended') {
    if(ws.readyState>=WebSocket.CLOSING)return;
    ws.close(code,message);
    const timer=setTimeout(()=>ws.terminate(),250);timer.unref();
    ws.once('close',()=>clearTimeout(timer));
  }
  function closeInputSockets(token) {
    for(const entry of inputSockets)if(!token||entry.token===token)disconnectInput(entry.ws,1001,'Screen session ended');
  }
  function closeAudioSockets(token){for(const entry of audioSockets)if(!token||entry.token===token){entry.capture?.stop();disconnectInput(entry.ws,1001,'Session ended');}}
  function applySmartQuality(){
    if(agentPreset!=='auto'||!agent?.stdin.writable||!viewers.size)return;
    const settings=smart.tick();if(settings){agent.stdin.write(`stream ${Math.round(settings.scale*100)} ${settings.fps} ${settings.quality}\n`);currentQuality=settings.quality;}
  }
  const smartClock=setInterval(applySmartQuality,250);smartClock.unref();
  function endAgent() {
    captureDemand=false;captureRequested=false;
    regionMode=false;regionBase=null;refreshPending=false;
    smart.reset();
    for(const v of viewers){v.regionBase=null;v.inFlight.clear();}
    failPending('Desktop agent disconnected');
    const p=agent;agent=null;agentPreset=null;agentMeta=null;agentBuffer=new ScreenPacketReader(MAX_PACKET);agentReady=false;
    if(p) {
      // EOF lets the desktop agent release remotely held keys/buttons before exit.
      // Keep a bounded fallback for a stalled capture/input process.
      const killTimer=setTimeout(()=>{try{p.kill();}catch{}},1000);
      killTimer.unref();
      p.once('close',()=>clearTimeout(killTimer));
      try {p.stdin.end();} catch {}
    }
  }
  function endViewers() {
    closeInputSockets();
    for(const v of viewers) {try {v.res.end();} catch{}}
    viewers.clear();endAgent();
  }
  function startAgent(preset) {
    if (agent && agentPreset===preset) return true;
    endAgent();
    if ((process.platform!=='win32' && !options.agentFactory) || options.disableAgent) return false;
    const exe=path.join(ROOT,'RemoteAgent','bin','RemoteAgent.exe');
    const dll=path.join(ROOT,'RemoteAgent','bin','RemoteAgent.dll');
    if(!options.agentFactory && !fs.existsSync(exe) && !fs.existsSync(dll))return false;
    const [quality,scale,fps]=PRESETS[preset];
    baseQuality=currentQuality=quality;lastQualityChange=Date.now();
    smart.reset();
    let bin,args;
    if(fs.existsSync(exe)) {bin=exe;args=[String(fps),String(quality),String(scale)];}
    else {bin='dotnet';args=[dll,String(fps),String(quality),String(scale)];}
    const p=options.agentFactory ? options.agentFactory(preset) : spawn(bin,args,{cwd:ROOT,windowsHide:false,stdio:['pipe','pipe','pipe']});
    agent=p;agentPreset=preset;agentBuffer=new ScreenPacketReader(MAX_PACKET);agentReady=false;
    p.stdin.on('error',()=>{});
    p.stderr.on('data',d=>console.error('[Desktop agent]',String(d).trim()));
    p.on('error',e=>{console.error('Desktop agent failed:',e.message);for(const v of viewers)try{v.res.end();}catch{};viewers.clear();endAgent();});
    p.stdout.on('data',data=>{
      if(agent!==p)return;
      try{agentBuffer.feed(data,(type,payload)=>{
        if(agent!==p)return;
        const len=payload.length,header=Buffer.alloc(5);header[0]=type;header.writeUInt32BE(len,1);
        const pkt=Buffer.concat([header,Buffer.from(payload.buffer,payload.byteOffset,len)]);
        if(pkt[0]===1){agentMeta=Buffer.from(pkt);agentReady=true;}
        else if(pkt[0]===2){
          // Per-command acknowledgement from the desktop agent: never forward
          // acknowledgements to screen viewers or mix them into JPEG frames.
          try {
            const ack=JSON.parse(pkt.subarray(5).toString('utf8'));
            const waiter=pendingInput.get(ack.id);
            if(waiter){
              pendingInput.delete(ack.id);clearTimeout(waiter.timer);
              ack.ok===true?waiter.resolve():waiter.reject(new Error(ack.error||'Desktop input rejected'));
            }
          } catch(e){console.error('Invalid desktop input acknowledgement:',e.message);}
          return;
        } else if(pkt[0]===4){captureRequested=false;requestVideoFrame();return;}
        else if(pkt[0]===6){
          for(const v of viewers)if(v.regions&&v.res.writable&&!v.busy)v.busy=!v.res.write(pkt);
          return;
        }else if(pkt[0]!==0&&pkt[0]!==5) return;
        if(pkt[0]===1){for(const v of viewers)if(v.res.writable)v.res.write(viewerMetadata(v));return;}
        captureRequested=false;
        let frameBase=null,keyframe=true;
        if(pkt[0]===5){
          if(len<=21||pkt[5]>1){console.error('Invalid desktop region');endViewers();return;}
          keyframe=pkt[5]===1;frameBase=pkt.readUInt32BE(6);
          if(keyframe){regionBase=frameBase;refreshPending=false;}
        }
        const id=++videoSequence,marker=videoPacket(3,{id});
        for(const v of viewers)if(v.res.writable&&!v.busy){
          if(v.feedbackSocket&&v.inFlight.size>=2)continue;
          if(pkt[0]===5){
            if(!v.regions||(!keyframe&&v.regionBase!==frameBase))continue;
            if(keyframe)v.regionBase=frameBase;
          }else v.regionBase=null;
          if(v.feedbackSocket)v.inFlight.set(id,Date.now());
          v.busy=!v.res.write(v.feedbackSocket?Buffer.concat([marker,pkt]):pkt);
        }
        requestVideoFrame();
      });}catch(e){console.error('Invalid desktop packet:',e.message);endViewers();}
    });
    p.on('close',code=>{
      if(agent!==p)return;
      console.log('Desktop agent exited:',code);
      for(const v of viewers)try{v.res.end();}catch{}
      viewers.clear();endAgent();
    });
    return true;
  }
  function trackInput(owner,cmds) {
    if(!owner)return;
    let held=inputHeld.get(owner);
    if(!held||held.agent!==agent){held={agent,buttons:new Set(),keys:new Set()};inputHeld.set(owner,held);}
    for(const command of cmds){
      const [kind,value]=command.split(' ');
      if(kind==='down')held.buttons.add(value);
      else if(kind==='up'||kind==='click')held.buttons.delete(value);
      else if(kind==='dbl')held.buttons.delete('l');
      else if(kind==='keydown')held.keys.add(value);
      else if(kind==='keyup'||kind==='key')held.keys.delete(value);
    }
  }
  function releaseInput(owner) {
    const held=inputHeld.get(owner);inputHeld.delete(owner);
    if(!held||held.agent!==agent||!agent?.stdin.writable)return;
    const commands=[...Array.from(held.buttons,button=>'up '+button),...Array.from(held.keys,key=>'keyup '+key)];
    if(commands.length)try{agent.stdin.write(commands.join('\n')+'\n');}catch{}
  }
  async function processInput(token,b,owner=null) {
    const result=(status,payload)=>({status,...payload});
    if(!permits(token,'control'))return result(403,{error:'Mouse and keyboard access was not approved.'});
    if(!enabled)return result(403,{error:'Remote input disabled'});
    if(!agent||!agentReady||!Array.from(viewers).some(v=>v.token===token))return result(409,{error:'No active screen session'});
    if(!b||typeof b!=='object'||Array.isArray(b)||!Array.isArray(b.cmds))return result(400,{error:'Invalid commands'});
    if(b.wait!==undefined&&typeof b.wait!=='boolean')return result(400,{error:'Invalid acknowledgement setting'});
    if(b.cmds.length>50||!b.cmds.every(validInput))return result(400,{error:'Invalid input'});
    if(!permits(token,'clipboard')&&b.cmds.some(c=>c.startsWith('paste ')))return result(403,{error:'Clipboard access was not approved. Use live typing instead.'});
    if(agentPreset==='auto'){smart.input(b.cmds);applySmartQuality();}
    if(!agent.stdin.writable)return result(503,{error:'Desktop agent disconnected'});
    if(agent.stdin.writableLength>262144||pendingInput.size>512)return result(429,{error:'PC input queue is busy'});
    if(b.wait===true){
      if(b.cmds.length<1||b.cmds.length>25||!b.cmds.every(c=>/^(text|paste|edit|key|combo) /.test(c)))
        return result(400,{error:'Invalid typing request'});
      const tagged=[],ids=[];
      const completion=b.cmds.map(c=>new Promise((resolve,reject)=>{
        const id=crypto.randomBytes(8).toString('hex');ids.push(id);
        const timer=setTimeout(()=>{pendingInput.delete(id);reject(new Error('Windows input acknowledgement timed out'));},15000);
        timer.unref();pendingInput.set(id,{resolve,reject,timer,owner});tagged.push(`ack ${id} ${c}`);
      }));
      try{
        agent.stdin.write(tagged.join('\n')+'\n');
        await Promise.all(completion);
        return result(200,{ok:true,delivered:true});
      }catch(e){return result(503,{error:e.message});}
      finally{
        for(const id of ids){const pending=pendingInput.get(id);if(pending){clearTimeout(pending.timer);pendingInput.delete(id);}}
      }
    }
    try{if(b.cmds.length){agent.stdin.write(b.cmds.join('\n')+'\n');trackInput(owner,b.cmds);}}
    catch(e){return result(503,{error:e.message});}
    return result(200,{ok:true});
  }
  function act(action, callback) {
    if (options.disableActions) return callback(new Error('Disabled in tests'));
    if (process.platform!=='win32')return callback(new Error('Requires Windows'));
    const delay=Math.max(0,Math.min(300,Number(options.delaySeconds ?? 10)||0));
    const cmd = {
      shutdown:['shutdown',['/s','/t',String(delay)]], restart:['shutdown',['/r','/t',String(delay)]],
      logoff:['shutdown',['/l']],sleep:['rundll32.exe',['powrprof.dll,SetSuspendState','0,1,0']],
      lock:['rundll32.exe',['user32.dll,LockWorkStation']],cancel:['shutdown',['/a']],
    };
    if(cmd[action])return execFile(cmd[action][0],cmd[action][1],callback);
    // Media keys are sent by standard Windows WScript Shell (no screen/keyboard injection scripts).
    const mapping={volup:175,voldown:174,mute:173,playpause:179,next:176,prev:177};
    const code=mapping[action], times=['volup','voldown'].includes(action)?5:1;
    const script=`$w=New-Object -ComObject WScript.Shell;1..${times}|ForEach-Object{$w.SendKeys([char]${code})}`;
    return execFile('powershell.exe',['-NoProfile','-Command',script],callback);
  }
  let prevCpu=os.cpus(),cpu=0;
  const cpuClock=setInterval(()=>{const now=os.cpus();let total=0,idle=0;now.forEach((c,i)=>{for(const k in c.times)total+=c.times[k]-(prevCpu[i]?.times[k]||0);idle+=c.times.idle-(prevCpu[i]?.times.idle||0);});cpu=total?Math.max(0,Math.round(100*(1-idle/total))):0;prevCpu=now;},3000);
  cpuClock.unref();
  const server=http.createServer(async(req,res)=>{
    const ip=req.socket.remoteAddress;
    // Tunnel mode accepts only the local connector and explicitly named host.
    // Never use X-Forwarded-For / CF-Connecting-IP as proof of authorization.
    const viaTunnel = isTunnelRequest(req);
    const allowed = allowedRequest(req);
    if(!allowed)return respond(res,403,{error:tunnelHostname?'Tunnel host only':'Local network only. For remote.teamtrader.co.za, run start-cloudflare.bat on the Windows host and restart Cloudflare Tunnel.'});
    if(req.headers.origin){try{const origin=new URL(req.headers.origin);if(origin.host!==req.headers.host)return respond(res,403,{error:'Cross-origin request rejected'});}catch{return respond(res,403,{error:'Invalid origin'});}}
    let pathname;
    try{pathname=new URL(req.url,'http://localhost').pathname;}catch{return respond(res,400,{error:'Bad URL'});}
    try{
      if(req.method==='GET'&&(pathname==='/'||pathname==='/index.html')){
        const page=fs.readFileSync(path.join(ROOT,'index.html'));
        res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Content-Security-Policy':`default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; connect-src 'self' ws://${req.headers.host} wss://${req.headers.host}; worker-src 'self'; media-src 'self' blob:; manifest-src 'self'; object-src 'none'; base-uri 'none'`,'X-Content-Type-Options':'nosniff'});
        return res.end(page);
      }
      if(req.method==='GET'&&(pathname==='/manifest.json'||pathname==='/manifest.webmanifest'))return respond(res,200,{
        id:'/',name:'PC Remote',short_name:'PC Remote',description:'Control your own Windows PC from your phone.',
        start_url:'/',scope:'/',display:'standalone',theme_color:'#07090f',background_color:'#07090f',
        icons:[
          {src:'/icons/icon-192.png',sizes:'192x192',type:'image/png',purpose:'any'},
          {src:'/icons/icon-512.png',sizes:'512x512',type:'image/png',purpose:'any'},
          {src:'/icons/icon-maskable-512.png',sizes:'512x512',type:'image/png',purpose:'maskable'},
        ]
      },{'Content-Type':'application/manifest+json; charset=utf-8'});
      if(req.method==='GET'&&PWA_ASSETS.has(pathname)){
        const [filename,type]=PWA_ASSETS.get(pathname);
        let asset;
        try{asset=fs.readFileSync(path.join(ROOT,'public',filename));}
        catch(e){if(e.code==='ENOENT')return respond(res,404,{error:'App file missing. Extract the complete update and restart the Windows host.'});throw e;}
        res.writeHead(200,{'Content-Type':type,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...(pathname==='/sw.js'?{'Service-Worker-Allowed':'/'}:{})});
        return res.end(asset);
      }
      if(req.method==='GET'&&pathname==='/api/ping'){
        const token=auth(req),paired=!!token;
        return respond(res,200,{ok:true,paired,requirePin,requirePassword,guestEnabled:requirePassword,...(paired?{name:sessions.get(token).role==='guest'?'Shared PC':hostname,...accessInfo(token),screen:enabled&&process.platform==='win32'&&permits(token,'screen')}:{})});
      }
      if(req.method==='POST'&&(pathname==='/api/guest/poll'||pathname==='/api/guest/cancel')){
        if(!requiresHeader(req))return respond(res,403,{error:'Request header missing'});
        const secret=cookie(req,'pc_remote_guest_request');
        const clearCookie=`pc_remote_guest_request=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${viaTunnel?'; Secure':''}`;
        if(pathname.endsWith('/cancel')){guestRequests.cancel(secret,ip);return respond(res,200,{ok:true},{'Set-Cookie':clearCookie});}
        if(auth(req))return respond(res,200,{ok:true,state:'signed-in'});
        const request=guestRequests.find(secret,ip);
        if(!request)return respond(res,200,{ok:true,state:'expired'},{'Set-Cookie':clearCookie});
        if(request.state!=='approved')return respond(res,200,{ok:true,state:request.state,until:request.until});
        const approved=guestRequests.consume(secret,ip);
        const raw=crypto.randomBytes(32).toString('hex'),key=sessionKey(raw);
        sessions.set(key,{ip,until:Date.now()+approved.durationMinutes*60000,persistent:false,role:'guest',guestId:approved.id,device:approved.device,permissions:approved.permissions});record(ip,'Guest signed in');
        return respond(res,200,{ok:true,state:'approved'}, {'Set-Cookie':[`${COOKIE_NAME}=${raw}; Path=/; HttpOnly; SameSite=Strict${viaTunnel?'; Secure':''}`,clearCookie]});
      }
      if(req.method==='POST'&&pathname==='/api/pair'){
        if(!requiresHeader(req))return respond(res,403,{error:'Request header missing'});
        const attempt=strikes.get(ip)||{count:0,until:0};
        if(attempt.until>Date.now())return respond(res,429,{error:'Too many attempts. Try again later.'});
        const b=await jsonBody(req);
        // Fixed time compare even for incorrect length.
        const got=Buffer.from(String(b.pin||''));const good=Buffer.from(pin);
        let valid=got.length===good.length&&crypto.timingSafeEqual(got,good);
        if(requirePassword){
          const supplied=typeof b.password==='string'&&b.password.length<=256?b.password:'';
          const suppliedHash=await scrypt(supplied,passwordSalt,32);
          valid=crypto.timingSafeEqual(suppliedHash,passwordHash);
          if(!valid&&crypto.timingSafeEqual(suppliedHash,guestHash)){
            if(auth(req)&&sessions.get(auth(req))?.role!=='guest')return respond(res,409,{error:'Sign out of your owner account before requesting guest access.'});
            const request=guestRequests.begin({ip,device:req.headers['user-agent'],existingSecret:cookie(req,'pc_remote_guest_request')});
            strikes.delete(ip);record(ip,'Guest requested access');
            return respond(res,202,{ok:true,pending:true,until:request.until},{'Set-Cookie':`pc_remote_guest_request=${request.secret}; Path=/; HttpOnly; SameSite=Strict; Max-Age=300${viaTunnel?'; Secure':''}`});
          }
        }
        if((requirePassword||requirePin)&&!valid){attempt.count++;if(attempt.count>=5){attempt.until=Date.now()+15*60*1000;attempt.count=0;}strikes.set(ip,attempt);return respond(res,401,{error:requirePassword?'Incorrect password':'Incorrect PIN'});}
        strikes.delete(ip);
        guestRequests.cancel(cookie(req,'pc_remote_guest_request'),ip);
        const token=crypto.randomBytes(32).toString('hex');
        const persistent=requirePassword&&b.remember===true,seconds=persistent?30*24*60*60:SESSION_TIME/1000;
        sessions.set(sessionKey(token),{ip,until:Date.now()+seconds*1000,persistent,role:'owner'});if(persistent)saveSessions();record(ip,requirePassword?'Signed in':'Phone paired');
        return respond(res,200,{ok:true}, {'Set-Cookie':[`${COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Strict${persistent||!requirePassword?'; Max-Age='+seconds:''}${viaTunnel?'; Secure':''}`,`pc_remote_guest_request=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${viaTunnel?'; Secure':''}`]});
      }
      const token=auth(req);
      if(!token)return respond(res,401,{error:'Pair your phone first'});
      if(req.method==='GET'&&pathname==='/api/collaboration/config'){
        if(!requiresHeader(req)||!permits(token,'voice')&&!permits(token,'whiteboard'))return respond(res,403,{error:'Collaboration access was not approved.'});
        return respond(res,200,{ok:true,iceServers:rtcServers});
      }
      if(pathname==='/api/ocr'||pathname==='/api/clipboard/image'){
        const ocr=pathname==='/api/ocr';if(!requiresHeader(req)||!permits(token,ocr?'screen':'clipboard'))return respond(res,403,{error:'This feature was not approved.'});
        if(ocr&&req.method!=='POST'||!['POST','GET'].includes(req.method))return respond(res,405,{error:'Action unavailable.'});
        try{let data='';if(req.method==='POST'){const body=await jsonBody(req,12*1024*1024);png(body.data);data=body.data;}const mode=ocr?'ocr':req.method==='GET'?'clipboard-image-read':'clipboard-image-write';const result=options.imageTools?await options.imageTools(mode,data):await imageTool(ROOT,mode,data);return respond(res,200,result);}catch(e){return respond(res,400,{error:e.message});}
      }
      if(pathname.startsWith('/api/handoff')){
        if(sessions.get(token).role==='guest'||!requiresHeader(req))return respond(res,403,{error:'Sign into your owner account on both devices.'});
        if(req.method==='POST'&&pathname==='/api/handoff')return respond(res,200,{ok:true,...handoffs.create(token)});
        if(req.method==='POST'&&pathname==='/api/handoff/claim'){const body=await jsonBody(req,1024);const result=handoffs.claim(body.code,token);return respond(res,result?200:409,result?{ok:true,...result}:{error:'This code is no longer available.'});}
        if(req.method==='GET'&&pathname==='/api/handoff'){const result=handoffs.status(new URL(req.url,'http://localhost').searchParams.get('code'),token);return respond(res,result?200:404,result?{ok:true,...result}:{error:'Handoff expired.'});}
      }
      if(pathname==='/api/wake'){
        if(sessions.get(token).role==='guest'||!requiresHeader(req))return respond(res,403,{error:'Only the owner can send wake signals.'});
        if(req.method==='GET')return respond(res,200,{ok:true,networks:wakeOnLan.networks()});
        if(req.method==='POST'){const body=await jsonBody(req,1024);await wakeOnLan.wake(body.mac,body.broadcast,options.wakeSend);return respond(res,200,{ok:true,message:'Wake signal sent. The PC must have Wake-on-LAN enabled.'});}
      }
      if(pathname.startsWith('/api/guest/')){
        if(sessions.get(token).role==='guest')return respond(res,403,{error:'Only the owner can manage guest access.'});
        if(!requiresHeader(req))return respond(res,403,{error:'Request header missing'});
        if(req.method==='GET'&&pathname==='/api/guest/requests')return respond(res,200,{ok:true,requests:guestRequests.pending(),active:Array.from(sessions.values()).filter(s=>s.role==='guest'&&s.until>Date.now()).map(s=>({id:s.guestId,device:s.device,until:s.until,permissions:s.permissions||{}}))});
        if(req.method==='POST'&&pathname==='/api/guest/decide'){
          const body=await jsonBody(req,4096);if(typeof body.approve!=='boolean'||!guestRequests.decide(body.id,body.approve,body.permissions,body.durationMinutes))return respond(res,409,{error:'This guest request has expired or was already answered.'});
          record(ip,body.approve?'Guest access approved':'Guest access denied');return respond(res,200,{ok:true});
        }
        if(req.method==='POST'&&pathname==='/api/guest/revoke'){
          const body=await jsonBody(req,4096);let revoked=false;
          for(const [key,session]of [...sessions])if(session.role==='guest'&&session.guestId===body.id){sessions.delete(key);guestScreens.revoke(key);webRtcVideo.revoke(key);collaboration.revoke(key);closeInputSockets(key);closeAudioSockets(key);void fileTransfers.revoke(key);for(const v of [...viewers])if(v.token===key)v.res.end();revoked=true;}
          record(ip,'Guest access ended');return respond(res,200,{ok:true,revoked});
        }
        return respond(res,404,{error:'Guest action not found'});
      }
      if(req.method==='GET'&&pathname==='/api/webrtc/config'){
        if(!requiresHeader(req)||!permits(token,'screen'))return respond(res,403,{error:'Screen viewing was not approved.'});
        return respond(res,200,{ok:true,iceServers:rtcServers});
      }
      if(req.method==='GET'&&pathname==='/api/apps'){
        if(!permits(token,'apps'))return respond(res,403,{error:'App switching was not approved.'});
        if(!requiresHeader(req))return respond(res,403,{error:'Request header missing'});
        try{return respond(res,200,await nativeFeatures.listApps());}catch(e){return respond(res,e.status||503,{error:e.message});}
      }
      if(req.method==='POST'&&pathname==='/api/apps/focus'){
        if(!permits(token,'apps'))return respond(res,403,{error:'App switching was not approved.'});
        if(!requiresHeader(req))return respond(res,403,{error:'Request header missing'});
        try{const body=await jsonBody(req,4096);return respond(res,200,await nativeFeatures.focusApp(body.id));}catch(e){return respond(res,e.status||503,{error:e.message});}
      }
      if(pathname==='/api/clipboard'&&(req.method==='GET'||req.method==='POST')){
        if(!permits(token,'clipboard'))return respond(res,403,{error:'Clipboard access was not approved.'});
        if(!requiresHeader(req))return respond(res,403,{error:'Request header missing'});
        try{
          if(req.method==='GET'){
            const text=options.clipboardProvider?await options.clipboardProvider.get():await nativeClipboard(ROOT,'get');
            record(ip,'Copied text from PC',text);
            return respond(res,200,{ok:true,text});
          }
          const body=await jsonBody(req,1024*1024);
          if(typeof body.text!=='string'||body.text.length>250000||body.text.includes('\0')||Buffer.from(body.text,'utf8').toString('utf8')!==body.text)return respond(res,400,{error:'Use text up to 250,000 characters.'});
          if(options.clipboardProvider)await options.clipboardProvider.set(body.text);else await nativeClipboard(ROOT,'set',body.text);
          record(ip,'Copied text to PC',body.text);
          return respond(res,200,{ok:true});
        }catch(e){return respond(res,503,{error:e.message});}
      }
      if(req.method==='POST'&&pathname==='/api/files/open-folder'){
        if(sessions.get(token).role==='guest')return respond(res,403,{error:'Only the owner can open the PC transfer folder.'});
        if(!requiresHeader(req))return respond(res,403,{error:'Request header missing'});
        if(options.disableActions||process.platform!=='win32')return respond(res,409,{error:'Open the transfer folder directly on your Windows PC.'});
        fs.mkdirSync(fileTransfers.root,{recursive:true});
        execFile('explorer.exe',[fileTransfers.root],{windowsHide:false},()=>{});return respond(res,200,{ok:true});
      }
      if(pathname==='/api/files'||pathname.startsWith('/api/files/')){
        const permission=pathname.startsWith('/api/files/uploads')?'upload':'download';
        if(!permits(token,permission))return respond(res,403,{error:(permission==='upload'?'Sending files':'PC file access')+' was not approved.'});
      }
      if(await fileTransfers.handle(req,res,{pathname,token,accountContext:sessions.get(token)?.role==='guest'?undefined:accountContext,readJson:jsonBody,respond:(response,status,data,headers)=>respond(response,status,sessions.get(token)?.role==='guest'&&data.folder?{...data,folder:'Shared transfer folder'}:data,headers)}))return;
      if(req.method==='GET'&&pathname==='/api/status'){
        const guest=sessions.get(token).role==='guest';
        return respond(res,200,{ok:true,name:guest?'Shared PC':hostname,...accessInfo(token),...(permits(token,'status')?{uptime:Math.round(os.uptime()),cpu,mem:Math.round(100*(1-os.freemem()/os.totalmem()))}:{}),log:guest?[]:activity.slice(0,6),screen:enabled&&process.platform==='win32'&&permits(token,'screen')});
      }
      if(req.method==='POST'&&pathname==='/api/unpair'){
        if(!requiresHeader(req))return respond(res,403,{error:'Request header missing'});
        sessions.delete(token);saveSessions();void fileTransfers.revoke(token);guestScreens.revoke(token);webRtcVideo.revoke(token);collaboration.revoke(token);closeInputSockets(token);closeAudioSockets(token);for(const v of [...viewers])if(v.token===token){try{v.res.end();}catch{} viewers.delete(v);}updateVideoDemand();if(!viewers.size)endAgent();
        record(ip,'Phone unpaired');return respond(res,200,{ok:true},{'Set-Cookie':`${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`});
      }
      if(req.method==='GET'&&pathname==='/api/screen'){
        if(!permits(token,'screen'))return respond(res,403,{error:'Screen viewing was not approved.'});
        if(!enabled||!requiresHeader(req))return respond(res,403,{error:'Screen sharing disabled'});
        const preset=new URL(req.url,'http://localhost').searchParams.get('p')||'med';
        if(!PRESETS[preset])return respond(res,400,{error:'Invalid quality setting'});
        if(!startAgent(preset))return respond(res,503,{error:'Desktop agent unavailable. Build it on Windows using start.bat.'});
        res.writeHead(200,{'Content-Type':'application/octet-stream','Cache-Control':'no-store, no-transform','X-Accel-Buffering':'no','X-Content-Type-Options':'nosniff'});
        res.socket.setNoDelay(true);
        const regions=new URL(req.url,'http://localhost').searchParams.get('regions')==='1';
        const v={res,token,regions,regionBase:null,busy:false,streamId:crypto.randomBytes(12).toString('hex'),feedbackSocket:null,inFlight:new Map(),deliveryMs:0};viewers.add(v);res.on('drain',()=>{v.busy=false;requestVideoFrame();});
        if(regions&&regionMode&&agent?.stdin.writable&&!refreshPending){refreshPending=true;agent.stdin.write('refresh\n');}
        updateVideoDemand();if(agentMeta)res.write(viewerMetadata(v));
        // An already-open stream must not outlive the pairing session.
        const expiry=sessionExpiry(sessions.get(token).until,()=>{if(!res.writableEnded)res.end();});
        record(ip,'Remote screen opened');console.log(`[Sharing screen with ${ip}. Close host window to stop.]`);
        res.on('close',()=>{expiry();viewers.delete(v);updateVideoDemand();if(!viewers.size)endAgent();});
        return;
      }
      if(req.method==='POST'&&pathname==='/api/input'){
        if(!requiresHeader(req))return respond(res,403,{error:'Remote input disabled'});
        const b=await jsonBody(req,100000),outcome=await processInput(token,b);
        const {status,...payload}=outcome;return respond(res,status,payload);
      }
      if(req.method==='POST'&&pathname==='/api/cmd'){
        if(!requiresHeader(req))return respond(res,403,{error:'Request header missing'});
        const b=await jsonBody(req);if(!commands.has(b.action))return respond(res,400,{error:'Unknown action'});
        if(!permits(token,['volup','voldown','mute','playpause','next','prev'].includes(b.action)?'media':'power'))return respond(res,403,{error:'This control was not approved.'});
        record(ip,`Requested ${b.action}`);
        return act(b.action,e=>respond(res,e?500:200,e?{error:`Action failed: ${e.message}`}:{ok:true,msg:`${b.action} requested`}));
      }
      return respond(res,404,{error:'Not found'});
    }catch(err){if(res.headersSent){res.destroy();return;}return respond(res,err.message==='Request too large'?413:400,{error:err.message});}
  });
  const inputStream=new WebSocketServer({noServer:true,maxPayload:100000,perMessageDeflate:false});
  const audioStream=new WebSocketServer({noServer:true,maxPayload:1024,perMessageDeflate:false});
  const guestScreens=createGuestScreen({sessions,auth,sessionExpiry});
  const webRtcVideo=createWebRtcVideo({sessions,auth,sessionExpiry});
  const collaboration=createCollaboration({sessions,auth,sessionExpiry});
  function rejectUpgrade(socket,status,message) {
    socket.on('error',()=>{});
    const body=JSON.stringify({error:message});
    socket.end(`HTTP/1.1 ${status} ${http.STATUS_CODES[status]}\r\nConnection: close\r\nContent-Type: application/json\r\nContent-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`);
  }
  server.on('upgrade',(req,socket,head)=>{
    socket.on('error',()=>{});
    let pathname;try{pathname=new URL(req.url,'http://localhost').pathname;}catch{return rejectUpgrade(socket,400,'Bad URL');}
    if(!['/api/input-stream','/api/audio','/api/guest-screen','/api/webrtc-video','/api/collaboration'].includes(pathname))return rejectUpgrade(socket,404,'Not found');
    if(!allowedRequest(req))return rejectUpgrade(socket,403,'Input stream host rejected');
    try{
      const origin=new URL(req.headers.origin);
      if(!['http:','https:'].includes(origin.protocol)||origin.host!==req.headers.host)return rejectUpgrade(socket,403,'Cross-origin request rejected');
    }catch{return rejectUpgrade(socket,403,'Request origin required');}
    const token=auth(req);
    if(!token)return rejectUpgrade(socket,401,'Pair your phone first');
    if(pathname==='/api/collaboration'){
      if(!permits(token,'voice')&&!permits(token,'whiteboard'))return rejectUpgrade(socket,403,'Collaboration was not approved');
      collaboration.upgrade(req,socket,head,token);return;
    }
    if(pathname==='/api/webrtc-video'){
      const publish=new URL(req.url,'http://localhost').searchParams.get('role')==='publish';
      if(!permits(token,'screen')||publish&&sessions.get(token).role==='guest')return rejectUpgrade(socket,403,'This video action was not approved');
      webRtcVideo.upgrade(req,socket,head,token,publish);return;
    }
    if(pathname==='/api/guest-screen'){guestScreens.upgrade(req,socket,head,token);return;}
    if(pathname==='/api/audio'){
      if(!permits(token,'audio'))return rejectUpgrade(socket,403,'PC audio access was not approved');
      if(Array.from(audioSockets).filter(entry=>entry.token===token).length>=2||audioSockets.size>=4)return rejectUpgrade(socket,429,'Stop an existing audio session first');
      audioStream.handleUpgrade(req,socket,head,ws=>{
        const entry={ws,token,capture:null};audioSockets.add(entry);let alive=true,formatSent=false;
        const expiry=sessionExpiry(sessions.get(token).until,()=>{entry.capture?.stop();disconnectInput(ws,1008,'Session expired');});
        const send=value=>{if(ws.readyState===WebSocket.OPEN)ws.send(JSON.stringify(value));};
        ws.on('error',()=>{});ws.on('pong',()=>{alive=true;});
        const heartbeat=setInterval(()=>{if(!alive||auth(req)!==token){entry.capture?.stop();ws.terminate();return;}alive=false;ws.ping();},15000);heartbeat.unref();
        ws.on('message',()=>{entry.capture?.stop();disconnectInput(ws,1008,'Audio is receive only');});
        ws.on('close',()=>{expiry();clearInterval(heartbeat);entry.capture?.stop();audioSockets.delete(entry);});
        try{entry.capture=nativeFeatures.openAudio({
          onMetadata:format=>{if(ws.readyState===WebSocket.OPEN){send(format);formatSent=true;}},
          onPcm:bytes=>{if(ws.readyState===WebSocket.OPEN&&formatSent&&ws.bufferedAmount<96000)ws.send(bytes,{binary:true});},
          onError:e=>{send({type:'error',error:e.message});disconnectInput(ws,1011,'PC audio stopped');},
          onClose:()=>disconnectInput(ws,1000,'PC audio stopped')
        });}catch(e){send({type:'error',error:e.message});disconnectInput(ws,1011,'PC audio unavailable');}
      });return;
    }
    if(!enabled)return rejectUpgrade(socket,403,'Remote input disabled');
    if(!agent||!agentReady||!Array.from(viewers).some(v=>v.token===token))return rejectUpgrade(socket,409,'No active screen session');
    const screenId=new URL(req.url,'http://localhost').searchParams.get('screen');
    const viewer=screenId?Array.from(viewers).find(v=>v.token===token&&v.streamId===screenId):null;
    if(screenId&&!viewer)return rejectUpgrade(socket,409,'Screen session changed');
    inputStream.handleUpgrade(req,socket,head,ws=>{
      const entry={ws,token};inputSockets.add(entry);
      if(viewer){viewer.feedbackSocket=ws;viewer.inFlight.clear();updateVideoDemand();}
      const expiry=sessionExpiry(sessions.get(token).until,()=>disconnectInput(ws,1008,'Session expired'));
      const activeIds=new Set();
      const send=payload=>{if(ws.readyState===WebSocket.OPEN)ws.send(JSON.stringify(payload));};
      ws.on('error',()=>{});
      // Protocol ping/pong detects a vanished browser and releases held input.
      let alive=true;
      ws.on('pong',()=>{alive=true;});
      const heartbeat=setInterval(()=>{if(!alive){ws.terminate();return;}alive=false;ws.ping();},15000);heartbeat.unref();
      ws.on('message',(data,binary)=>{
        if(ws.readyState!==WebSocket.OPEN)return;
        if(auth(req)!==token){send({status:401,error:'Session expired'});disconnectInput(ws,1008,'Session expired');return;}
        let body;try{if(binary)throw Error();body=JSON.parse(data.toString('utf8'));}catch{send({status:400,error:'Invalid JSON input'});return;}
        if(!body||typeof body!=='object'||Array.isArray(body)){send({status:400,error:'Invalid commands'});return;}
        if(Object.hasOwn(body,'frameAck')){
          if(viewer?.feedbackSocket===ws)acknowledgeVideo(viewer,body.frameAck);
          return;
        }
        if(body.refresh===true){
          if(viewer?.feedbackSocket===ws&&viewer.regions&&agent?.stdin.writable&&!refreshPending){refreshPending=true;agent.stdin.write('refresh\n');}
          return;
        }
        const id=body.id,hasId=id!==undefined;
        if(hasId&&!((Number.isSafeInteger(id)&&id>=0)||(typeof id==='string'&&/^[A-Za-z0-9_-]{1,64}$/.test(id)))){send({status:400,error:'Invalid request ID'});return;}
        if(body.wait===true&&!hasId){send({status:400,error:'Acknowledged input requires a request ID'});return;}
        if(hasId&&activeIds.has(id)){send({id,status:400,error:'Duplicate request ID'});return;}
        if(activeIds.size>=32){send({...hasId&&{id},status:429,error:'Too many pending input requests'});return;}
        if(hasId)activeIds.add(id);
        // processInput validates and writes synchronously before its first await.
        // Movement packets therefore stream in receive order without a round trip.
        processInput(token,body,ws).then(outcome=>{
          if(hasId||outcome.status!==200)send({...hasId&&{id},...outcome});
        }).catch(()=>send({...hasId&&{id},status:503,error:'Input stream failed'}))
          .finally(()=>{if(hasId)activeIds.delete(id);});
      });
      ws.on('close',()=>{
        clearInterval(heartbeat);
        expiry();inputSockets.delete(entry);releaseInput(ws);
        if(viewer?.feedbackSocket===ws){viewer.feedbackSocket=null;viewer.inFlight.clear();updateVideoDemand();}
        for(const [id,pending] of pendingInput)if(pending.owner===ws){clearTimeout(pending.timer);pendingInput.delete(id);pending.reject(new Error('Input stream disconnected'));}
      });
    });
  });
  function stop(){endViewers();closeAudioSockets();guestScreens.revoke();webRtcVideo.revoke();collaboration.revoke();}
  server.on('close',()=>{clearInterval(cpuClock);clearInterval(smartClock);guestRequests.clear();stop();inputStream.close();audioStream.close();guestScreens.close();webRtcVideo.close();collaboration.close();handoffs.clear();nativeFeatures.close();void fileTransfers.close();});
  return {server,pin,port,addresses:interfaces,stop};
}
if(require.main===module){
  if(process.argv.includes('--port')){console.log(Number(process.env.PORT||7666));process.exit(0);}
  let config={};
  try {config=JSON.parse(fs.readFileSync(path.join(ROOT,'config.json'),'utf8'));}
  catch(e) { if(e.code!=='ENOENT'){console.error('Cannot load config.json:',e.message);process.exit(1);} }
  const app=createApp({screen:config.screen!==false,delaySeconds:config.delaySeconds,requirePin:config.requirePin===true,tunnelHostname:config.tunnelHostname,password:typeof config.password==='string'&&config.password?config.password:'serame',sessionFile:path.join(ROOT,'.remembered-sessions.json'),transferDirectory:config.transferDirectory,maxFileBytes:config.maxFileBytes,webRtcIceServers:config.webRtcIceServers,deviceName:config.deviceName||"SERAME'S PC"});
  app.server.listen(app.port,config.tunnelHostname?'127.0.0.1':'0.0.0.0',()=>{
    const actual=app.server.address().port;
    const ip=app.addresses.find(a=>a.startsWith('192.168.'))||app.addresses[0]||'127.0.0.1';
    console.log(`\nPC Remote — personal Windows host\nPhone URL: ${config.tunnelHostname?'https://'+tunnelHost(config.tunnelHostname):'http://'+ip+':'+actual}\n${'Sign in with your app password. Remember me is available.'}\nKeep this terminal open; Ctrl+C stops sharing.\nNever forward port ${actual} to the internet.\n`);
  });
  app.server.on('error',e=>{console.error(e.code==='EADDRINUSE'?'Port is in use. Close the previous PC Remote terminal before starting a new instance.':e.message);process.exitCode=1;});
}
module.exports={createApp,privateIP,validInput};
