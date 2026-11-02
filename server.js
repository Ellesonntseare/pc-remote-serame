'use strict';
// Visible, LAN-only Windows Elleson Connect service. Runs only while user keeps the host console open.
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn, execFile } = require('node:child_process');
const { WebSocketServer, WebSocket } = require('ws');
const ScreenPacketReader = require('./public/screen-packets');
const {createFileTransfers}=require('./file-transfers');
const {pcLocations,createLocationProvider}=require('./pc-locations');
const {createSyncHub}=require('./sync-hub');
const {createAccountWorkspace}=require('./account-workspace');
const {createAccountAPI}=require('./account-api');
const {accountScope}=require('./account-scope');
const {createSocialsIntegration}=require('./socials-host');
const {createClipboardWatch}=require('./clipboard-watch');
const {createSharedClipboard}=require('./shared-clipboard');
const {createDeviceCompanions}=require('./device-companions');
const {saveDeviceName}=require('./host-settings');
const {createNetworkDevices}=require('./network-devices');
const nativeClipboard=require('./native-clipboard');
const {createNativeFeatures}=require('./native-features');
const {createAppUpdates}=require('./app-updates');
const {createLocalRouteProof}=require('./local-route-proof');
const {createSecondScreen}=require('./second-screen');
const {createNativeVideo,PROFILES:NATIVE_VIDEO_PROFILES}=require('./native-video');
const {createSessionAdmin}=require('./session-admin');
const {createDisplayPrivacy}=require('./display-privacy');
const {createDeviceLinks}=require('./device-links');
const {createAssetCache}=require('./asset-cache');
const {createAssetBundles}=require('./asset-bundles');
const {createGoogleSignIn}=require('./google-signin');
const {createGoogleAccounts}=require('./google-accounts');
const {createPhoneAudio}=require('./phone-audio');
const {createSystemMetrics}=require('./system-metrics');
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
function sessionExpiry(until,expire,{now=Date.now,setTimer=setTimeout,clearTimer=clearTimeout}={}){
  let timer,stopped=false;
  function check(){if(stopped)return;const remaining=(typeof until==='function'?until():until)-now();if(!Number.isFinite(remaining)||remaining<=0){stopped=true;expire();return;}timer=setTimer(check,Math.min(remaining,2147483647));timer.unref?.();}
  check();return()=>{stopped=true;clearTimer(timer);};
}
// Explicit public asset map: no arbitrary filesystem paths or paired data.
const PWA_ASSETS = new Map([
  ['/sync-settings.js',['sync-settings.js','text/javascript; charset=utf-8']],
  ['/file-browser.css',['file-browser.css','text/css; charset=utf-8']],
  ['/phone-audio.js',['phone-audio.js','text/javascript; charset=utf-8']],
  ['/phone-audio.css',['phone-audio.css','text/css; charset=utf-8']],
  ['/audio-capture-worklet.js',['audio-capture-worklet.js','text/javascript; charset=utf-8']],
  ['/google-signin.js',['google-signin.js','text/javascript; charset=utf-8']],
  ['/native-media.js',['native-media.js','text/javascript; charset=utf-8']],
  ['/device-companion.js',['device-companion.js','text/javascript; charset=utf-8']],
  ...['mission-control','camera-sharing','local-connection','sculpted-flow'].flatMap(name=>[['/'+name+'.js',[name+'.js','text/javascript; charset=utf-8']],['/'+name+'.css',[name+'.css','text/css; charset=utf-8']]]),
  ['/media-recording.js',['media-recording.js','text/javascript; charset=utf-8']],
  ...['workspace-scene.webp','login-scene.webp'].map(name=>['/'+name,[name,'image/webp']]),
  ...['workspace-settings','device-links','device-input','typing-controls','home-panels','native-window','window-presentation','touch-trail','explorer-workspace','account-workspace'].flatMap(name=>[['/'+name+'.js',[name+'.js','text/javascript; charset=utf-8']],['/'+name+'.css',[name+'.css','text/css; charset=utf-8']]]),
  ['/screen-packets.js', ['screen-packets.js', 'text/javascript; charset=utf-8']],
  ['/hold-repeat.js', ['hold-repeat.js', 'text/javascript; charset=utf-8']],
  ['/fullscreen-gestures.js', ['fullscreen-gestures.js', 'text/javascript; charset=utf-8']],
  ['/phone-workspaces.js', ['phone-workspaces.js', 'text/javascript; charset=utf-8']],
  ['/phone-workspaces.css', ['phone-workspaces.css', 'text/css; charset=utf-8']],
  ['/explorer-controls.js', ['explorer-controls.js', 'text/javascript; charset=utf-8']],
  ['/explorer-windows.css', ['explorer-windows.css', 'text/css; charset=utf-8']],
  ['/privacy-mode.js', ['privacy-mode.js', 'text/javascript; charset=utf-8']],
  ['/native-video.js',['native-video.js','text/javascript; charset=utf-8']],
  ['/session-admin.js',['session-admin.js','text/javascript; charset=utf-8']],
  ['/session-admin.css',['session-admin.css','text/css; charset=utf-8']],
  ['/audio-hub.js',['audio-hub.js','text/javascript; charset=utf-8']],
  ['/audio-hub.css',['audio-hub.css','text/css; charset=utf-8']],
  ['/transfer-badges.js', ['transfer-badges.js', 'text/javascript; charset=utf-8']],
  ['/screen-renderer.js', ['screen-renderer.js', 'text/javascript; charset=utf-8']],
  ['/remote-cursor.js', ['remote-cursor.js', 'text/javascript; charset=utf-8']],
  ['/file-transfers.js', ['file-transfers.js', 'text/javascript; charset=utf-8']],
  ['/file-transfers.css', ['file-transfers.css', 'text/css; charset=utf-8']],
  ...['file-manager','native-transfers','appearance','remote-video','accessibility','pointer-safety','context-controls','shared-sync','folder-sync'].map(name=>['/'+name+'.js',[name+'.js','text/javascript; charset=utf-8']]),
  ['/file-manager.css',['file-manager.css','text/css; charset=utf-8']],
  ['/brand.svg', ['brand.svg', 'image/svg+xml']],
  ['/app-refinements.css', ['app-refinements.css', 'text/css; charset=utf-8']],
  ...['audio-worklet.js','pc-audio.js','app-switcher.js','precision-lens.js','guest-access.js','phone-mouse.js','phone-input.js','phone-drop.js','guest-screen.js','workspace-ui.js','page-navigation.js','projects.js','socials-return.js','app-updates.js','mse-video.js','second-screen-policy.js','second-screen.js'].map(name=>['/'+name,[name,'text/javascript; charset=utf-8']]),
  ...['native-features.css','precision-lens.css','pointer-settings.css','guest-access.css','guest-screen.css','workspace-ui.css','page-navigation.css','projects.css','second-screen.css'].map(name=>['/'+name,[name,'text/css; charset=utf-8']]),
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
  if(verb==='focuscurrent')return c==='focuscurrent';
  if (['mv','abs','focus'].includes(verb)) return /^-?\d{1,6} -?\d{1,6}$/.test(v);
  if (verb === 'wheel' || verb === 'hwheel') return /^-?\d{1,5}$/.test(v);
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
  const socials=createSocialsIntegration({directory:options.socialsDirectory,dataDirectory:options.socialsDataDirectory||path.join(ROOT,'.socials-data')});
  if(options.socialsDirectory)void socials.start().catch(error=>console.error('Socials scheduler startup failed',error?.name));
  const assets=createAssetCache();
  const bundles=createAssetBundles({allowed:PWA_ASSETS,read:route=>route==='/index.html'?assets.get(path.join(ROOT,'index.html'),'text/html'):assets.get(path.join(ROOT,'public',PWA_ASSETS.get(route)[0]),PWA_ASSETS.get(route)[1])});
  const rtcServers=iceServers(options.webRtcIceServers);
  const tunnelHostname = tunnelHost(options.tunnelHostname);
  const google=createGoogleSignIn(options.googleSignIn,options.googleDependencies);
  const allowLan=options.allowLan??!tunnelHostname;
  const requirePin = options.requirePin ?? !!options.pin;
  const requirePassword=typeof options.password==='string'&&options.password.length>0;
  const passwordSalt=crypto.randomBytes(16),passwordHash=requirePassword?crypto.scryptSync(options.password,passwordSalt,32):null;
  const guestHash=requirePassword?crypto.scryptSync('guest',passwordSalt,32):null;
  const guestRequests=createGuestRequests();
  const handoffs=createHandoffs();
  const pin = options.pin || String(crypto.randomInt(10000000,99999999));
  const port = options.port ?? Number(process.env.PORT || 7666);
  const enabled = options.screen ?? true;
  let hostname = options.deviceName||os.hostname(),discovery=null;
  const interfaces = addresses();
  const hostnames = new Set(['localhost','127.0.0.1',os.hostname().toLowerCase(),...interfaces]);
  const sessions = new Map(), strikes = new Map(), activity=[];
  const accountData=options.accountWorkspace||createAccountWorkspace({file:options.workspaceFile||':memory:'}),accountAPI=createAccountAPI({store:accountData});
  const workspaceScope=token=>accountScope(sessions.get(token),identity=>google.isOwner(identity));
  let clipboardObserver=null,clipboardEcho=null;
  const sharedClipboard=createSharedClipboard({store:accountData,directory:options.sharedClipboardDirectory,apply:async value=>{if(options.sharedClipboardProvider?.apply)return options.sharedClipboardProvider.apply(value);if(options.clipboardProvider?.set&&['text','empty'].includes(value.kind))return options.clipboardProvider.set(value.text||'');if(!clipboardObserver?.active)throw Error('The Windows clipboard connection is starting.');return clipboardObserver.set(value);}});
  const nativeFeatures=options.nativeFeatures||createNativeFeatures({root:ROOT});
  const appUpdates=options.appUpdates||createAppUpdates({root:ROOT,currentVersion:require('./package.json').version});
  const localRouteProof=createLocalRouteProof();
  const displayPrivacy=options.displayPrivacy||createDisplayPrivacy({root:ROOT});
  const audioSockets=new Set();
  const accountContext=requirePassword?crypto.createHash('sha256').update('pc-remote-owner-v1\0'+options.password).digest('hex'):undefined;
  const pairingContext=accountContext||crypto.createHash('sha256').update('pc-remote-pin-v1\0'+pin).digest('hex');
  const googleAccounts=createGoogleAccounts({file:options.accountFile||(options.sessionFile?path.join(path.dirname(options.sessionFile),'.google-accounts.json'):undefined)});
  const deviceLinks=createDeviceLinks({openLink:url=>nativeFeatures.openLink(url),readClipboard:()=>options.clipboardProvider?options.clipboardProvider.get():nativeClipboard(ROOT,'get')});
  const smart=createSmartQuality();
  const hostIdentity=os.hostname()+'|'+os.homedir();
  const locationProvider=options.useWindowsLocations&&nativeFeatures.fileLocations?createLocationProvider({native:()=>nativeFeatures.fileLocations(),fallback:options.fileLocationsProvider||(()=>options.fileLocations||[])}):options.fileLocationsProvider;
  const fileTransfers=createFileTransfers({onActivity:(actor,event)=>{if(actor?.accountKey)accountData.record(actor.accountKey,{...event,device:actor.device||'Elleson Connect'});},directory:options.transferDirectory||path.join(os.homedir(),'Downloads','PC Remote Transfers'),maxBytes:options.maxFileBytes,watch:options.discovery===true,locations:pcLocations(options.fileLocations),locationsProvider:locationProvider,thumbnailProvider:options.thumbnailProvider||(!options.disableAgent&&nativeFeatures.fileThumbnail?file=>nativeFeatures.fileThumbnail(file):undefined)});
  const syncHub=createSyncHub({identity:hostIdentity,onActivity:(scope,event)=>{if(event.action==='clipboard.sent')clipboardEcho={text:event.text,at:Date.now()};try{accountData.record(scope,event);}catch{console.error('Account activity could not be saved.');}},onRegister:(scope,token,device)=>{const session=sessions.get(token);if(session&&(session.clientId!==device.id||session.deviceName!==device.name)){session.clientId=device.id;session.deviceName=device.name;saveSessions();}},file:options.syncFile,stageFiles:fileTransfers.stageFromPC,getFileRevision:()=>fileTransfers.revision,getHostName:()=>hostname,setHostName:async name=>{try{await options.setDeviceName?.(name);}catch{throw Object.assign(Error('The PC name could not be saved. Check the host configuration file.'),{status:500});}hostname=name;discovery?.rename(name);},clipboard:options.clipboardProvider||{get:()=>nativeClipboard(ROOT,'get'),set:text=>nativeClipboard(ROOT,'set',text)}});
  const networkDevices=createNetworkDevices({enabled:options.discovery===true&&allowLan});
  const sessionKey=token=>crypto.createHash('sha256').update(token).digest('hex');
  if(options.sessionFile)try{
    for(const [key,session] of JSON.parse(fs.readFileSync(options.sessionFile,'utf8')))if(/^[a-f0-9]{64}$/.test(key)&&session.persistent===true&&session.until>Date.now()&&(!session.identity||google.isAllowed(session.identity)&&session.account)){if(session.role==='owner'&&!session.identity&&session.pairContext!==pairingContext)continue;if(session.identity){if(google.isOwner(session.identity)){session.role='owner';session.pairContext=pairingContext;}else if(session.role==='owner'&&session.pairContext!==pairingContext)session.role='account';}sessions.set(key,session);}
  }catch(e){if(e.code!=='ENOENT')console.error('Remembered logins could not be loaded. Please sign in again.');}
  function saveSessions(){
    if(!options.sessionFile)return;
    const data=Array.from(sessions).filter(([,s])=>s.persistent&&s.until>Date.now());
    fs.writeFileSync(options.sessionFile+'.tmp',JSON.stringify(data),{mode:0o600});fs.renameSync(options.sessionFile+'.tmp',options.sessionFile);
  }
  const sessionAdmin=createSessionAdmin({sessions,accountKey:session=>accountScope(session,identity=>google.isOwner(identity)),file:options.historyFile||(options.sessionFile?path.join(path.dirname(options.sessionFile),'.session-history.json'):undefined)});
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
  const record=(ip,text,preview,token)=>{if(text==='Copied text to PC'&&typeof preview==='string')clipboardEcho={text:preview,at:Date.now()};activity.unshift({t:Date.now(),ip,text,...typeof preview==='string'&&{preview:preview.slice(0,2000)}});activity.length=Math.min(20,activity.length);const scope=token?(workspaceScope(token)||(sessions.get(token)?.role==='guest'?'owner':null)):'owner';if(scope)try{accountData.record(scope,{label:text,device:sessions.get(token)?.deviceName||sessions.get(token)?.device||'PC host',type:/Copied text|clipboard/i.test(text)?'clipboard':/screen/i.test(text)?'screen':/privacy/i.test(text)?'privacy':/signed|paired|session/i.test(text)?'session':'activity',action:/Copied text/i.test(text)?'clipboard.copied':'activity.recorded',...typeof preview==='string'&&{text:preview}});}catch{console.error('Account activity could not be saved.');}};
  const cookie=(req,name=COOKIE_NAME)=>{
    const raw=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(name+'='));
    return raw?raw.slice(name.length+1):'';
  };
  const auth=(req)=>{
    const token=sessionKey(cookie(req)), s=sessions.get(token);
    if(!s || (!s.persistent&&s.ip!==req.socket.remoteAddress) || s.until<Date.now()) {sessions.delete(token);if(s)deviceLinks.revoke(token);return null;}
    sessionAdmin.seen(token);return token;
  };
  const requiresHeader=(req)=>req.headers['x-pcr']==='1';
  const permits=(token,key)=>can(sessions.get(token),key);
  const mainAdmin=token=>sessions.get(token)?.role==='owner'&&(!sessions.get(token)?.identity||google.isOwner(sessions.get(token).identity));
  const accessInfo=token=>({mainAdmin:mainAdmin(token),role:sessions.get(token).role||'owner',workspaceId:workspaceScope(token),until:sessions.get(token).until,...sessions.get(token).account&&{account:sessions.get(token).account},...(sessions.get(token).role==='guest'?{permissions:sessions.get(token).permissions||{},guestId:sessions.get(token).guestId}:{})});
  const isTunnelRequest=req=>!!tunnelHostname&&loopbackIP(req.socket.remoteAddress)&&sameHost(req.headers.host,new Set([tunnelHostname]));
  const allowedRequest=req=>isTunnelRequest(req)||allowLan&&privateIP(req.socket.remoteAddress)&&(sameHost(req.headers.host,hostnames)||sameHost(req.headers.host,new Set([(req.socket.localAddress||'').replace(/^::ffff:/,'')])));
  function videoPacket(type,value){
    const payload=Buffer.from(JSON.stringify(value)),header=Buffer.alloc(5);
    header[0]=type;header.writeUInt32BE(payload.length,1);return Buffer.concat([header,payload]);
  }
  function viewerMetadata(viewer){return videoPacket(1,{...JSON.parse(agentMeta.subarray(5).toString('utf8')),streamId:viewer.streamId});}
  function requestVideoFrame(){
    if(!captureDemand||captureRequested||!agent?.stdin.writable)return;
    if(!Array.from(viewers).some(v=>!v.controlOnly&&v.res.writable&&!v.busy&&v.inFlight.size<2))return;
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
    const next=viewers.size>0&&Array.from(viewers).every(v=>v.controlOnly||v.feedbackSocket?.readyState===WebSocket.OPEN);
    if(next!==captureDemand){captureDemand=next;captureRequested=false;if(agent?.stdin.writable)agent.stdin.write('flow '+(next?1:0)+'\n');}
    applySmartQuality();requestVideoFrame();
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
    if(agentPreset!=='auto'||!agent?.stdin.writable||!agentMeta||!viewers.size)return;
    if(agentMeta){const nativeWidth=JSON.parse(agentMeta.subarray(5).toString('utf8')).w;const requested=Math.max(...Array.from(viewers,v=>v.maxWidth||Infinity));if(Number.isFinite(nativeWidth)&&nativeWidth>0)smart.limitScale(Math.min(1,requested/nativeWidth));}
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
  function startAgent(preset,maxWidth=null) {
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
    if(preset==='auto'&&maxWidth)args.push(String(maxWidth));
    const p=options.agentFactory ? options.agentFactory(preset) : spawn(bin,args,{cwd:ROOT,windowsHide:true,stdio:['pipe','pipe','pipe']});
    agent=p;agentPreset=preset;agentBuffer=new ScreenPacketReader(MAX_PACKET);agentReady=false;
    p.stdin.on('error',()=>{});
    p.stderr.on('data',d=>console.error('[Desktop agent]',String(d).trim()));
    p.on('error',e=>{if(agent!==p)return;console.error('Desktop agent failed:',e.message);for(const v of viewers)try{v.res.end();}catch{};viewers.clear();endAgent();});
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
              ack.ok===true?waiter.resolve(ack):waiter.reject(new Error(ack.error||'Desktop input rejected'));
            }
          } catch(e){console.error('Invalid desktop input acknowledgement:',e.message);}
          return;
        } else if(pkt[0]===4){captureRequested=false;requestVideoFrame();return;}
        else if(pkt[0]===6){
          for(const v of viewers)if(v.regions&&v.res.writable&&!v.busy)v.busy=!v.res.write(pkt);
          return;
        }else if(pkt[0]!==0&&pkt[0]!==5) return;
        if(pkt[0]===1){applySmartQuality();for(const v of viewers)if(v.res.writable)v.res.write(viewerMetadata(v));return;}
        captureRequested=false;
        let frameBase=null,keyframe=true;
        if(pkt[0]===5){
          if(len<=21||pkt[5]>1){console.error('Invalid desktop region');endViewers();return;}
          keyframe=pkt[5]===1;frameBase=pkt.readUInt32BE(6);
          if(keyframe){regionBase=frameBase;refreshPending=false;}
        }
        const id=++videoSequence,marker=videoPacket(3,{id});
        for(const v of viewers)if(!v.controlOnly&&v.res.writable&&!v.busy){
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
      if(b.cmds.length<1||b.cmds.length>25||!b.cmds.every(c=>c==='focuscurrent'||/^(text|paste|edit|key|combo|abs|click|focus) /.test(c)))
        return result(400,{error:'Invalid typing request'});
      const tagged=[],ids=[];
      const completion=b.cmds.map(c=>new Promise((resolve,reject)=>{
        const id=crypto.randomBytes(8).toString('hex');ids.push(id);
        const timer=setTimeout(()=>{pendingInput.delete(id);reject(new Error('Windows input acknowledgement timed out'));},15000);
        timer.unref();pendingInput.set(id,{resolve,reject,timer,owner});tagged.push(`ack ${id} ${c}`);
      }));
      try{
        agent.stdin.write(tagged.join('\n')+'\n');
        const replies=await Promise.all(completion),focus=replies.find(reply=>Object.hasOwn(reply,'editable'));
        const bounds=focus?.fieldBounds,field=typeof focus?.fieldId==='string'&&/^[a-f0-9]{32}$/.test(focus.fieldId)&&bounds&&['x','y','width','height'].every(key=>Number.isInteger(bounds[key])&&Math.abs(bounds[key])<=131072)&&bounds.width>0&&bounds.height>0?{fieldId:focus.fieldId,fieldBounds:{x:bounds.x,y:bounds.y,width:bounds.width,height:bounds.height}}:{};
        return result(200,{ok:true,delivered:true,...focus&&{editable:typeof focus.editable==='boolean'?focus.editable:null,...field}});
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
    const delay=Math.max(0,Math.min(300,Number(options.delaySeconds ?? 10)||0));
    const cmd = {
      shutdown:['shutdown',['/s','/t',String(delay)]], restart:['shutdown',['/r','/t',String(delay)]],
      logoff:['shutdown',['/l']],sleep:['rundll32.exe',['powrprof.dll,SetSuspendState','0,1,0']],
      lock:['rundll32.exe',['user32.dll,LockWorkStation']],cancel:['shutdown',['/a']],
    };
    if(cmd[action]){if(process.platform!=='win32')return callback(new Error('Requires Windows'));return execFile(cmd[action][0],cmd[action][1],callback);}
    return nativeFeatures.sendMedia(action).then(result=>callback(null,result),callback);
  }
  let prevCpu=os.cpus(),cpu=0;
  const systemMetrics=createSystemMetrics({disabled:options.disableAgent===true,read:options.readSystemMetrics});
  const cpuClock=setInterval(()=>{const now=os.cpus();let total=0,idle=0;now.forEach((c,i)=>{for(const k in c.times)total+=c.times[k]-(prevCpu[i]?.times[k]||0);idle+=c.times.idle-(prevCpu[i]?.times.idle||0);});cpu=total?Math.max(0,Math.round(100*(1-idle/total))):0;prevCpu=now;},3000);
  cpuClock.unref();
  async function googleSession(result,ip,secure,req){
    const registered=await googleAccounts.register(result.identity,{ownerContext:google.isOwner(result.identity)?pairingContext:undefined}),paired=registered.pairedContext===pairingContext;
    const raw=crypto.randomBytes(32).toString('hex'),seconds=result.remember?30*24*60*60:SESSION_TIME/1000;
    sessions.set(sessionKey(raw),{ip,until:Date.now()+seconds*1000,persistent:result.remember,role:paired?'owner':'account',identity:result.identity,account:{...registered.profile,newAccount:registered.created},...paired&&{pairContext:pairingContext}});sessionAdmin.login(sessionKey(raw),req,'google');record(ip,'Signed in with Google',undefined,sessionKey(raw));if(result.remember)saveSessions();record(ip,registered.created?'Google account registered':'Signed in with Google');
    return `${COOKIE_NAME}=${raw}; Path=/; HttpOnly; SameSite=Strict${result.remember?'; Max-Age='+seconds:''}${secure?'; Secure':''}`;
  }
  let stopping=false;
  const server=http.createServer(async(req,res)=>{
    res.once('finish',()=>{if(stopping&&!req.socket.destroyed)req.socket.end();});
    const ip=req.socket.remoteAddress;
    // Tunnel mode accepts only the local connector and explicitly named host.
    // Never use X-Forwarded-For / CF-Connecting-IP as proof of authorization.
    const viaTunnel = isTunnelRequest(req);req.pcrTunnel=viaTunnel;
    const allowed = allowedRequest(req);
    if(!allowed)return respond(res,403,{error:tunnelHostname?'Tunnel host only':'Local network only. For remote.teamtrader.co.za, run start-cloudflare.bat on the Windows host and restart Cloudflare Tunnel.'});
    if(req.headers.origin){try{const origin=new URL(req.headers.origin);if(origin.host!==req.headers.host)return respond(res,403,{error:'Cross-origin request rejected'});}catch{return respond(res,403,{error:'Invalid origin'});}}
    let pathname;
    try{pathname=new URL(req.url,'http://localhost').pathname;}catch{return respond(res,400,{error:'Bad URL'});}
    try{
      if(req.method==='GET'&&/^\/socials\/connect\/(facebook|instagram|youtube|google|linkedin|tiktok|pinterest|x|threads)$/.test(pathname)){
        const html='<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Connect account · Elleson Socials</title><style>body{margin:0;background:#f3f6f1;color:#214734;font:15px/1.8 system-ui;min-height:100dvh;display:grid;place-items:center}main{padding:32px;max-width:480px}h1{font-size:30px;letter-spacing:-1px}a{color:#315e43}</style><script src="/socials-return.js" defer></script></head><body><main><h1>Connecting your account</h1><p id="connectionStatus" role="status">Finishing your sign-in…</p><a href="/socials/#channels">Back to Accounts</a></main></body></html>';
        res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'"});return res.end(html);
      }
      if(req.method==='GET'&&(pathname==='/'||pathname==='/index.html')){
        const page=await bundles.page(req.headers['accept-encoding']);
        res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Vary':'Accept-Encoding',...page.encoding&&{'Content-Encoding':page.encoding},'Content-Length':page.body.length,'Content-Security-Policy':`default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; connect-src 'self' ws://${req.headers.host} wss://${req.headers.host}; worker-src 'self'; media-src 'self' blob:; manifest-src 'self'; object-src 'none'; base-uri 'none'`,'X-Content-Type-Options':'nosniff'});
        return res.end(page.body);
      }
      if(req.method==='GET'&&(pathname==='/manifest.json'||pathname==='/manifest.webmanifest'))return respond(res,200,{
        id:'/',name:'Elleson Connect',short_name:'Elleson Connect',description:'Control your own Windows PC from your phone.',
        start_url:'/',scope:'/',display:'standalone',theme_color:'#10100F',background_color:'#10100F',
        icons:[
          {src:'/icons/icon-192.png',sizes:'192x192',type:'image/png',purpose:'any'},
          {src:'/icons/icon-512.png',sizes:'512x512',type:'image/png',purpose:'any'},
          {src:'/icons/icon-maskable-512.png',sizes:'512x512',type:'image/png',purpose:'maskable'},
        ]
      },{'Content-Type':'application/manifest+json; charset=utf-8'});
      if(req.method==='GET'&&(PWA_ASSETS.has(pathname)||bundles.has(pathname))){
        const [filename,type]=PWA_ASSETS.get(pathname)||[null,bundles.type(pathname)];
        let asset;
        try{asset=bundles.has(pathname)?await bundles.get(pathname,req.headers['accept-encoding']):await assets.get(path.join(ROOT,'public',filename),type,req.headers['accept-encoding']);}
        catch(e){if(e.code==='ENOENT')return respond(res,404,{error:'App file missing. Extract the complete update and restart the Windows host.'});throw e;}
        // Revalidate public code and artwork on every use, while letting a phone
        // retain unchanged bytes. Sessions, HTML, API data and the worker never
        // enter this cache path. Hash the content so an update cannot reuse a tag.
        const worker=pathname==='/sw.js';
        const etag=worker?null:asset.etag;
        const headers={'Content-Type':type,'Cache-Control':worker?'no-store':'private, no-cache','Vary':'Accept-Encoding',...asset.encoding&&{'Content-Encoding':asset.encoding},'X-Content-Type-Options':'nosniff',...(worker?{'Service-Worker-Allowed':'/'}:{ETag:etag})};
        const validators=String(req.headers['if-none-match']||'').split(',').map(value=>value.trim().replace(/^W\//,''));
        if(!worker&&(validators.includes(etag)||validators.includes('*'))){res.writeHead(304,headers);return res.end();}
        res.writeHead(200,{...headers,'Content-Length':asset.body.length});
        return res.end(asset.body);
      }
      if(req.method==='GET'&&pathname==='/api/local-proof'){
        try{const address=(req.socket.localAddress||'').replace(/^::ffff:/,''),port=req.socket.localPort,nonce=new URL(req.url,'http://localhost').searchParams.get('nonce')||'';return respond(res,200,{ok:true,...localRouteProof.proof(nonce,'http://'+address+':'+port)});}catch{return respond(res,409,{error:'Start this connection check from the signed-in app.'});}
      }
      if(req.method==='GET'&&pathname==='/api/ping'){
        const token=auth(req),paired=!!token&&sessions.get(token).role!=='account';
        return respond(res,200,{ok:true,paired,requirePin,requirePassword,guestEnabled:requirePassword,...(paired?{name:sessions.get(token).role==='guest'?'Shared PC':hostname,...accessInfo(token),screen:enabled&&process.platform==='win32'&&permits(token,'screen')}:token?accessInfo(token):{})});
      }
      if(req.method==='GET'&&pathname==='/api/app-version')return respond(res,200,{version:require('./package.json').version});
      if(pathname.startsWith('/api/auth/google/')){
        const url=new URL(req.url,'http://localhost'),action=pathname.slice('/api/auth/google/'.length),oauthCookie='pc_remote_google';
        const redirect=(location,headers={})=>{res.writeHead(303,{'Location':location,'Cache-Control':'no-store','Referrer-Policy':'no-referrer',...headers});res.end();};
        const clearCookie=oauthCookie+'=; Path=/api/auth/google; HttpOnly; Secure; SameSite=Lax; Max-Age=0';
        try{
          if(action==='start'&&req.method==='POST'){
            if(!requiresHeader(req))return respond(res,403,{error:'Request header missing'});
            const body=await jsonBody(req);return respond(res,200,{ok:true,...google.start({remember:body.remember===true,device:body.device===true,ip})});
          }
          if((action==='browser'||action==='callback')&&req.method==='GET'){
            if(!viaTunnel||'https://'+req.headers.host!==google.origin)return respond(res,403,{error:'Open Google sign-in through the configured HTTPS website.'});
            if(action==='browser'){const result=google.browser(url.searchParams.get('ticket'));return redirect(result.url,{'Set-Cookie':oauthCookie+'='+result.cookie+'; Path=/api/auth/google; HttpOnly; Secure; SameSite=Lax; Max-Age=300'});}
            const result=await google.callback({id:url.searchParams.get('state'),code:url.searchParams.get('code'),cookie:cookie(req,oauthCookie),error:url.searchParams.get('error')});
            if(!result.device)return redirect('/',{'Set-Cookie':[clearCookie,await googleSession(result,ip,true,req)]});
            res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Referrer-Policy':'no-referrer','Set-Cookie':clearCookie,'Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'"});return res.end('<!doctype html><meta name="viewport" content="width=device-width, initial-scale=1"><title>Signed in · Elleson Connect</title><style>body{background:#031321;color:#eef8ff;font:18px system-ui;display:grid;place-items:center;min-height:90vh;text-align:center}h1{color:#24dccb;font-size:28px}p{color:#a3c4db;max-width:300px;line-height:1.6}</style><main><h1>You’re signed in.</h1><p>Return to the Elleson Connect app to continue.</p></main>');
          }
          if(action==='poll'&&req.method==='POST'){
            if(!requiresHeader(req))return respond(res,403,{error:'Request header missing'});const body=await jsonBody(req),result=google.poll({id:body.id,secret:body.secret,ip});
            if(result.pending)return respond(res,200,{ok:true,pending:true});guestRequests.cancel(cookie(req,'pc_remote_guest_request'),ip);return respond(res,200,{ok:true},{'Set-Cookie':await googleSession(result,ip,viaTunnel,req)});
          }
          return respond(res,404,{error:'Unknown sign-in request'});
        }catch(error){if(action==='callback')return redirect('/?google=failed',{'Set-Cookie':clearCookie});return respond(res,error.status||500,{error:error.status?error.message:'Google sign-in is unavailable. Try again.'});}
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
        sessions.set(key,{ip,until:Date.now()+approved.durationMinutes*60000,persistent:false,role:'guest',guestId:approved.id,device:approved.device,permissions:approved.permissions});sessionAdmin.login(key,req,'guest');record(ip,'Guest signed in');
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
        const previousKey=auth(req),previous=sessions.get(previousKey);let account;
        if(previous?.identity){account=await googleAccounts.pair(previous.identity,pairingContext);sessionAdmin.end(previousKey,'PC paired; session replaced');sessions.delete(previousKey);}
        sessions.set(sessionKey(token),{ip,until:Date.now()+seconds*1000,persistent,role:'owner',pairContext:pairingContext,...account&&{identity:previous.identity,account,pairContext:pairingContext}});sessionAdmin.login(sessionKey(token),req,account?'google':'password');if(persistent)saveSessions();record(ip,account?'Google account paired with this PC':requirePassword?'Signed in':'Phone paired',undefined,sessionKey(token));
        return respond(res,200,{ok:true}, {'Set-Cookie':[`${COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Strict${persistent||!requirePassword?'; Max-Age='+seconds:''}${viaTunnel?'; Secure':''}`,`pc_remote_guest_request=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${viaTunnel?'; Secure':''}`]});
      }
      const token=auth(req);
      if(!token)return respond(res,401,{error:'Pair your phone first'});
      if(await socials.handle(req,res,{pathname,session:sessions.get(token),scope:workspaceScope(token),origin:(viaTunnel?'https://':'http://')+req.headers.host,respond}))return;
      if(pathname==='/api/local-route-key'&&req.method==='GET'){
        if(!requiresHeader(req)||sessions.get(token)?.role!=='owner')return respond(res,403,{error:'Owner access is required to choose a faster connection.'});
        return respond(res,200,{ok:true,...localRouteProof.key(),persistent:!!sessions.get(token)?.persistent,expiresAt:sessions.get(token).until});
      }
      if(pathname==='/api/second-screen'&&req.method==='GET'){
        if(!requiresHeader(req)||sessions.get(token)?.role!=='owner')return respond(res,403,{error:'Owner access is required for Second screen.'});
        try{return respond(res,200,{...await nativeFeatures.secondScreenProbe(),phoneRegistered:syncHub.device(token,workspaceScope(token)||'owner')?.platform==='android'});}catch{return respond(res,503,{error:'Update the Windows host to set up Second screen.'});}
      }
      if(pathname==='/api/second-screen/setup'&&req.method==='POST'){
        if(!requiresHeader(req)||sessions.get(token)?.role!=='owner')return respond(res,403,{error:'Owner access is required to set up Second screen.'});
        try{await nativeFeatures.openLink('https://github.com/VirtualDrivers/Virtual-Display-Driver#-installation');return respond(res,200,{ok:true});}catch{return respond(res,503,{error:'Open the Virtual Display Driver installation page on your PC.'});}
      }
      if(pathname==='/api/updates'||/^\/api\/updates\/(android|windows)\/download$/.test(pathname)){
        if(sessions.get(token)?.role!=='owner')return respond(res,403,{error:'Only the PC owner can install app updates.'});
        if(req.method!=='GET')return respond(res,405,{error:'Use GET for app updates.'});
        if(pathname==='/api/updates'){
          if(!requiresHeader(req))return respond(res,403,{error:'Request header missing'});
          try{return respond(res,200,await appUpdates.status());}catch(error){return respond(res,503,{error:error.message});}
        }
        try{const item=await appUpdates.getPackage(pathname.includes('/android/')?'android':'windows');res.writeHead(200,{'Content-Type':pathname.includes('/android/')?'application/vnd.android.package-archive':'application/vnd.microsoft.portable-executable','Content-Length':item.size,'Content-Disposition':'attachment; filename="'+item.name+'"','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','X-Content-SHA256':item.sha256});fs.createReadStream(item.file).on('error',()=>res.destroy()).pipe(res);return;}catch(error){return respond(res,503,{error:error.message});}
      }
      if(req.method==='POST'&&pathname==='/api/presence'){
        if(!requiresHeader(req))return respond(res,403,{error:'Request header missing'});
        return respond(res,200,{ok:true});
      }
      if(pathname==='/api/sessions'||pathname==='/api/sessions/revoke'){
        if(!requiresHeader(req)||!mainAdmin(token))return respond(res,403,{error:'Only the main administrator can manage signed-in devices.'});
        if(req.method==='GET'&&pathname==='/api/sessions')return respond(res,200,sessionAdmin.snapshot(token,new URL(req.url,'http://localhost').searchParams.get('summary')==='1'));
        if(req.method==='POST'&&pathname==='/api/sessions/revoke'){
          const body=await jsonBody(req,16384);if(!body||typeof body!=='object'||Array.isArray(body))return respond(res,400,{error:'Choose the devices to sign out.'});if(body.all!==true&&(!Array.isArray(body.ids)||!body.ids.length||body.ids.length>200||body.ids.some(id=>typeof id!=='string'||!/^[a-f0-9]{32}$/.test(id))))return respond(res,400,{error:'Choose the devices to sign out.'});
          const ids=new Set(body.all===true?[]:body.ids),selected=[...sessions].filter(([,session])=>body.all===true||ids.has(session.id));
          record(ip,'Administrator signed out '+selected.length+' device sessions',undefined,token);
          for(const [key]of selected){sessionAdmin.end(key,'Signed out by administrator');sessions.delete(key);deviceLinks.revoke(key);guestScreens.revoke(key);webRtcVideo.revoke(key);nativeVideo.revoke(key);cameraRevoke(key);collaboration.revoke(key);companions.revoke(key);closeInputSockets(key);closeAudioSockets(key);displayPrivacy.revoke(key);for(const viewer of [...viewers])if(viewer.token===key){viewer.res.end();viewers.delete(viewer);}}
          saveSessions();await Promise.allSettled(selected.map(([key])=>fileTransfers.revoke(key)));updateVideoDemand();if(!viewers.size)endAgent();
          return respond(res,200,{ok:true,revoked:selected.length,signedOut:selected.some(([key])=>key===token)});
        }
        return respond(res,405,{error:'Unsupported session action'});
      }
      if(req.method==='GET'&&pathname==='/api/account'){
        if(!requiresHeader(req))return respond(res,403,{error:'Request header missing'});
        return respond(res,200,{ok:true,account:sessions.get(token).account||null,paired:sessions.get(token).role!=='account'});
      }
      if(await accountAPI.handle(req,res,{pathname,scope:workspaceScope(token),valid:()=>!!sessions.get(token)&&sessions.get(token).until>Date.now(),device:syncHub.device(token,workspaceScope(token)||'owner')?.name||sessions.get(token)?.deviceName||sessions.get(token)?.device||'Elleson Connect',readJson:jsonBody,respond}))return;
      if(sessions.get(token).role==='account'&&!['/api/unpair','/api/session','/api/presence'].includes(pathname))return respond(res,403,{error:'Your Google account is signed in. Pair this PC before accessing its controls or files.',needsPairing:true});
      if(await syncHub.handle(req,res,{pathname,token,accountKey:workspaceScope(token)||'owner',role:sessions.get(token)?.role,readJson:jsonBody,respond}))return;
      if(await sharedClipboard.handle(req,res,{pathname,scope:workspaceScope(token),role:sessions.get(token)?.role,device:syncHub.device(token,workspaceScope(token)||'owner')?.name||sessions.get(token)?.deviceName||'Elleson Connect',sourceId:syncHub.device(token,workspaceScope(token)||'owner')?.id||'device',readJson:jsonBody,respond}))return;
      if(pathname==='/api/companion/devices'||pathname.startsWith('/api/companion/devices/')){
        if(!requiresHeader(req)||sessions.get(token)?.role!=='owner')return respond(res,403,{error:'Pair your own device first.'});
        const scope=workspaceScope(token);if(req.method==='GET'&&pathname==='/api/companion/devices')return respond(res,200,{ok:true,devices:companions.devices(scope)});
        const match=/^\/api\/companion\/devices\/([-a-zA-Z0-9]{12,80})\/command$/.exec(pathname);if(req.method==='POST'&&match){try{const body=await jsonBody(req,128*1024),result=await companions.request(scope,match[1],body.action,body.payload||{},body.action==='file-hash'?60000:15000);if(['ring','stop-ring'].includes(body.action))accountData.record(scope,{type:'devices',action:'devices.'+body.action,label:body.action==='ring'?'Find my phone started':'Find my phone stopped',device:sessions.get(token)?.deviceName||'Elleson Connect'});return respond(res,200,{ok:true,result});}catch(error){return respond(res,error.status||503,{error:error.status?error.message:'The phone could not complete that action.'});}}
        return respond(res,405,{error:'Device action unavailable.'});
      }
      if(pathname==='/api/phone/inbox'&&req.method==='GET'){
        if(!requiresHeader(req)||sessions.get(token)?.role!=='owner')return respond(res,403,{error:'Sign in as the owner to receive phone files.'});
        return respond(res,200,{ok:true,inbox:await syncHub.pending(token,workspaceScope(token)||'owner')});
      }
      if(pathname==='/api/phone/files'&&req.method==='POST'){
        if(!requiresHeader(req)||sessions.get(token)?.role!=='owner')return respond(res,403,{error:'Sign in as the owner to send files to a phone.'});
        try{
          const body=await jsonBody(req,32768),scope=workspaceScope(token)||'owner';
          if(typeof body.target!=='string'||!Array.isArray(body.names)||!body.names.length||body.names.length>100||body.names.some(name=>typeof name!=='string'||name.length>1200)||typeof body.group!=='string'||!/^[a-f0-9-]{32,36}$/.test(body.group))return respond(res,400,{error:'Choose files and one receiving phone.'});
          const devices=await syncHub.devices(scope);if(!devices.some(device=>device.id===body.target))return respond(res,404,{error:'Open Elleson Connect on that phone using the same account first.'});
          const files=await Promise.all(body.names.map(name=>fileTransfers.resolveFile(name)));
          const result=await syncHub.enqueue({accountKey:scope,files,target:body.target,returnItems:true});
          const offers=result.items.map(item=>({id:item.id,name:item.label,size:item.size,path:'/api/files/download?name='+encodeURIComponent(item.name),group:body.group}));
          const receiving=guestScreens.offerFiles(body.target,offers,phoneToken=>(workspaceScope(phoneToken)||'owner')===scope);
          return respond(res,200,{ok:true,count:result.count,receiving});
        }catch(error){return respond(res,error.status||400,{error:error.status?error.message:'Files could not be queued for the phone.'});}
      }
      if(pathname==='/api/host/send'&&req.method==='POST'||pathname==='/api/host/targets'&&req.method==='GET'){
        if(viaTunnel||!['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress)||!requiresHeader(req)||sessions.get(token)?.role!=='owner')return respond(res,403,{error:'Use Send to my phone from this Windows PC.'});
        try{if(req.method==='GET')return respond(res,200,{ok:true,devices:await syncHub.devices(workspaceScope(token)||'owner')});const body=await jsonBody(req,1024*1024);return respond(res,200,await syncHub.enqueue({accountKey:workspaceScope(token)||'owner',files:body.files||[],text:body.text||'',target:body.target||'*'}));}catch(error){return respond(res,error.status||400,{error:error.status?error.message:'The selected files could not be queued.'});}
      }
      if(await deviceLinks.handle(req,res,{pathname,token,role:sessions.get(token)?.role,guestId:sessions.get(token)?.guestId,accountContext,canClipboard:permits(token,'clipboard'),readJson:jsonBody,respond}))return;
      if(req.method==='GET'&&pathname==='/api/session'){
        if(!requiresHeader(req))return respond(res,403,{error:'Request header missing'});
        return respond(res,200,{ok:true,...accessInfo(token)});
      }
      if(req.method==='GET'&&pathname==='/api/local-network'){
        if(!requiresHeader(req)||sessions.get(token)?.role==='guest')return respond(res,403,{error:'Sign in as the owner to see local PC addresses.'});
        const addresses=Object.entries(os.networkInterfaces()).flatMap(([name,entries])=>(entries||[]).filter(item=>item.family==='IPv4'&&!item.internal&&privateIP(item.address)).map(item=>({name,address:item.address}))).sort((a,b)=>Number(b.address.startsWith('192.168.'))-Number(a.address.startsWith('192.168.'))).slice(0,12);
        return respond(res,200,{ok:true,name:hostname,port:server.address().port,addresses,local:!viaTunnel});
      }
      if(req.method==='GET'&&pathname==='/api/network-devices'){
        if(!requiresHeader(req)||sessions.get(token)?.role!=='owner')return respond(res,403,{error:'Pair this device before browsing the network.'});
        return respond(res,200,await networkDevices.list());
      }
      if(req.method==='GET'&&pathname==='/api/phone-audio/config'){
        if(!requiresHeader(req)||sessions.get(token)?.role!=='owner')return respond(res,403,{error:'Only the paired PC owner can stream audio to this PC.'});
        let devices={virtualMic:{available:false,name:'CABLE Output',setupUrl:'https://vb-audio.com/Cable/'}};try{if(nativeFeatures.audioDevices)devices=await nativeFeatures.audioDevices();}catch{}
        return respond(res,200,{ok:true,available:process.platform==='win32'||!!options.nativeFeatures?.openAudioOutput,defaultVolume:.6,virtualMic:devices.virtualMic});
      }
      if(req.method==='GET'&&pathname==='/api/collaboration/config'){
        if(!requiresHeader(req)||!['voice','whiteboard','chat','notes'].some(key=>permits(token,key)))return respond(res,403,{error:'Collaboration access was not approved.'});
        return respond(res,200,{ok:true,iceServers:rtcServers});
      }
      if(pathname==='/api/ocr'||pathname==='/api/clipboard/image'){
        const ocr=pathname==='/api/ocr';if(!requiresHeader(req)||!permits(token,ocr?'screen':'clipboard'))return respond(res,403,{error:'This feature was not approved.'});
        if(ocr&&req.method!=='POST'||!['POST','GET'].includes(req.method))return respond(res,405,{error:'Action unavailable.'});
        try{let data='';if(req.method==='POST'){const body=await jsonBody(req,12*1024*1024);png(body.data);data=body.data;}const mode=ocr?'ocr':req.method==='GET'?'clipboard-image-read':'clipboard-image-write';const result=options.imageTools?await options.imageTools(mode,data):await imageTool(ROOT,mode,data);if(result.ok)record(ip,ocr?'Read text from the PC screen':req.method==='GET'?'Read PC image clipboard':'Copied image to PC clipboard',ocr?String(result.text||'').slice(0,250000):undefined,token);return respond(res,200,result);}catch(e){return respond(res,400,{error:e.message});}
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
          record(ip,body.approve?'Guest access approved':'Guest access denied',undefined,token);return respond(res,200,{ok:true});
        }
        if(req.method==='POST'&&pathname==='/api/guest/revoke'){
          const body=await jsonBody(req,4096);let revoked=false;
          for(const [key,session]of [...sessions])if(session.role==='guest'&&session.guestId===body.id){sessions.delete(key);deviceLinks.revoke(key);guestScreens.revoke(key);webRtcVideo.revoke(key);nativeVideo.revoke(key);cameraRevoke(key);collaboration.revoke(key);companions.revoke(key);closeInputSockets(key);closeAudioSockets(key);await fileTransfers.revoke(key);for(const v of [...viewers])if(v.token===key)v.res.end();revoked=true;}
          record(ip,'Guest access ended',undefined,token);return respond(res,200,{ok:true,revoked});
        }
        if(req.method==='POST'&&pathname==='/api/guest/revoke-all'){
          const body=await jsonBody(req,4096),ids=body.ids;
          if(!Array.isArray(ids)||ids.length<1||ids.length>50||new Set(ids).size!==ids.length||ids.some(id=>typeof id!=='string'||!/^[a-f0-9]{32}$/.test(id)))return respond(res,400,{error:'Choose the active guests to end.'});
          const selected=new Set(ids);let revoked=0;
          for(const [key,session]of [...sessions])if(session.role==='guest'&&selected.has(session.guestId)){
            sessions.delete(key);deviceLinks.revoke(key);guestScreens.revoke(key);webRtcVideo.revoke(key);nativeVideo.revoke(key);cameraRevoke(key);collaboration.revoke(key);companions.revoke(key);closeInputSockets(key);closeAudioSockets(key);await fileTransfers.revoke(key);for(const v of [...viewers])if(v.token===key)v.res.end();revoked++;
          }
          record(ip,'Ended '+revoked+' guest sessions',undefined,token);return respond(res,200,{ok:true,revoked});
        }
        if(req.method==='POST'&&pathname==='/api/guest/extend'){
          const body=await jsonBody(req,1024),minutes=body.minutes;
          if(!Number.isInteger(minutes)||minutes<5||minutes>480)return respond(res,400,{error:'Choose between 5 minutes and 8 hours.'});
          const guest=Array.from(sessions.values()).find(s=>s.role==='guest'&&s.guestId===body.id&&s.until>Date.now());
          if(!guest)return respond(res,409,{error:'This guest session has ended.'});
          const until=guest.until+minutes*60000;
          if(until>Date.now()+480*60000)return respond(res,400,{error:'A guest can have up to 8 hours remaining.'});
          guest.until=until;record(ip,'Guest session extended',undefined,token);return respond(res,200,{ok:true,until});
        }
        return respond(res,404,{error:'Guest action not found'});
      }
      if(req.method==='GET'&&pathname==='/api/webrtc/config'){
        if(!requiresHeader(req)||!permits(token,'screen'))return respond(res,403,{error:'Screen viewing was not approved.'});
        return respond(res,200,{ok:true,iceServers:rtcServers,audioAllowed:permits(token,'audio')});
      }
      if(pathname==='/api/privacy'&&(req.method==='GET'||req.method==='POST')){
        if(!requiresHeader(req)||sessions.get(token)?.role!=='owner')return respond(res,403,{error:'Privacy mode is available to the PC owner only.'});
        if(req.method==='GET')return respond(res,200,displayPrivacy.status(token));
        try{
          const body=await jsonBody(req,1024);
          if(body.action==='stop'){displayPrivacy.stop();record(ip,'Privacy mode off',undefined,token);return respond(res,200,displayPrivacy.status(token));}
          if(body.action==='heartbeat'){displayPrivacy.heartbeat(token);return respond(res,200,displayPrivacy.status(token));}
          if(body.action!=='start')return respond(res,400,{error:'Invalid privacy action.'});
          if(!Array.from(viewers).some(viewer=>viewer.token===token))return respond(res,409,{error:'Open the remote screen before enabling Privacy mode.'});
          const result=await displayPrivacy.start(token);record(ip,'Privacy mode on',undefined,token);return respond(res,200,result);
        }catch(error){return respond(res,503,{error:error.message,...error.diagnostic&&{diagnostic:error.diagnostic}});}
      }
      if(req.method==='GET'&&pathname==='/api/camera/config'){
        if(!requiresHeader(req)||sessions.get(token)?.role==='guest')return respond(res,403,{error:'Sign in as the owner on both devices to share a camera.'});
        return respond(res,200,{ok:true,iceServers:rtcServers,audioAllowed:true});
      }
      if(req.method==='GET'&&pathname==='/api/apps'){
        if(!permits(token,'apps'))return respond(res,403,{error:'App switching was not approved.'});
        if(!requiresHeader(req))return respond(res,403,{error:'Request header missing'});
        try{return respond(res,200,await nativeFeatures.listApps());}catch(e){return respond(res,e.status||503,{error:e.message});}
      }
      if(req.method==='GET'&&pathname==='/api/apps/current'){
        if(!requiresHeader(req)||!permits(token,'apps'))return respond(res,403,{error:'App controls were not approved.'});
        try{return respond(res,200,await nativeFeatures.currentApp());}catch{return respond(res,503,{error:'Active app detection is unavailable.'});}
      }
      if(req.method==='POST'&&pathname==='/api/apps/control'){
        if(sessions.get(token)?.role!=='owner'||!permits(token,'apps')||!permits(token,'control'))return respond(res,403,{error:'Owner app control is required.'});
        if(!requiresHeader(req))return respond(res,403,{error:'Request header missing'});
        try{const body=await jsonBody(req,16384);return respond(res,200,await nativeFeatures.controlApp(body.id,body));}catch(e){return respond(res,e.status||503,{error:e.message});}
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
            record(ip,'Copied text from PC',text,token);
            return respond(res,200,{ok:true,text});
          }
          const body=await jsonBody(req,1024*1024);
          if(typeof body.text!=='string'||body.text.length>250000||body.text.includes('\0')||Buffer.from(body.text,'utf8').toString('utf8')!==body.text)return respond(res,400,{error:'Use text up to 250,000 characters.'});
          if(sessions.get(token)?.role==='owner'&&sharedClipboard.enabled(workspaceScope(token)))await sharedClipboard.copy(workspaceScope(token),{kind:'text',text:body.text},{source:syncHub.device(token,workspaceScope(token))?.name||sessions.get(token)?.deviceName||'Elleson Connect',sourceId:syncHub.device(token,workspaceScope(token))?.id||'device',activityLabel:'Copied text to PC'});else{if(options.clipboardProvider)await options.clipboardProvider.set(body.text);else await nativeClipboard(ROOT,'set',body.text);record(ip,'Copied text to PC',body.text,token);}
          return respond(res,200,{ok:true});
        }catch(e){return respond(res,503,{error:e.message});}
      }
      if(req.method==='POST'&&pathname==='/api/files/reveal'){
        if(sessions.get(token).role!=='owner')return respond(res,403,{error:'Only the paired owner can reveal files on the PC.'});
        if(!requiresHeader(req))return respond(res,403,{error:'Request header missing'});
        const body=await jsonBody(req);if(!body)return respond(res,400,{error:'Choose a completed file.'});
        try{const file=await fileTransfers.resolveFile(body.name);if(options.disableActions||process.platform!=='win32')return respond(res,409,{error:'Open the transfer folder directly on your Windows PC.'});execFile('explorer.exe',['/select,',file],{windowsHide:false},()=>{});return respond(res,200,{ok:true});}catch(error){return respond(res,error.status||404,{error:'The completed file is no longer in the transfer folder.'});}
      }
      if(req.method==='POST'&&pathname==='/api/files/open-folder'){
        if(sessions.get(token).role==='guest')return respond(res,403,{error:'Only the owner can open the PC transfer folder.'});
        if(!requiresHeader(req))return respond(res,403,{error:'Request header missing'});
        if(options.disableActions||process.platform!=='win32')return respond(res,409,{error:'Open the transfer folder directly on your Windows PC.'});
        fs.mkdirSync(fileTransfers.root,{recursive:true});
        execFile('explorer.exe',[fileTransfers.root],{windowsHide:false},()=>{});return respond(res,200,{ok:true});
      }
      if(pathname==='/api/files'||pathname.startsWith('/api/files/')){
        const permission=pathname.startsWith('/api/files/uploads')||pathname==='/api/files/mkdir'?'upload':'download';
        if(!permits(token,permission))return respond(res,403,{error:(permission==='upload'?'Sending files':'PC file access')+' was not approved.'});
      }
      if(await fileTransfers.handle(req,res,{pathname,token,activityContext:{accountKey:workspaceScope(token)||'owner',device:syncHub.device(token,workspaceScope(token)||'owner')?.name||sessions.get(token)?.deviceName||sessions.get(token)?.device||'Elleson Connect'},allowLocations:sessions.get(token)?.role==='owner',chunkBytes:viaTunnel?1024*1024:options.localChunkBytes||8*1024*1024,accountContext:sessions.get(token)?.role==='guest'?undefined:accountContext,readJson:jsonBody,respond:(response,status,data,headers)=>respond(response,status,sessions.get(token)?.role==='guest'&&data.folder?{...data,folder:'Shared transfer folder'}:data,headers)}))return;
      if(req.method==='GET'&&pathname==='/api/status'){
        const guest=sessions.get(token).role==='guest';
        return respond(res,200,{ok:true,name:guest?'Shared PC':hostname,...accessInfo(token),...(permits(token,'status')?{uptime:Math.round(os.uptime()),cpu,mem:Math.round(100*(1-os.freemem()/os.totalmem())),system:systemMetrics.get()}:{}),historyCount:guest?0:accountData.metadata(workspaceScope(token)||'owner').eventCount,log:guest?[]:accountData.list(workspaceScope(token)||'owner',{limit:6}).events.map(event=>({t:event.time,text:event.label,...event.preview&&{preview:event.preview}})),screen:enabled&&process.platform==='win32'&&permits(token,'screen')});
      }
      if(req.method==='POST'&&pathname==='/api/unpair'){
        if(!requiresHeader(req))return respond(res,403,{error:'Request header missing'});
        record(ip,'Phone unpaired',undefined,token);sessionAdmin.end(token,'Signed out');sessions.delete(token);saveSessions();await fileTransfers.revoke(token);deviceLinks.revoke(token);guestScreens.revoke(token);webRtcVideo.revoke(token);nativeVideo.revoke(token);cameraRevoke(token);collaboration.revoke(token);companions.revoke(token);closeInputSockets(token);closeAudioSockets(token);for(const v of [...viewers])if(v.token===token){try{v.res.end();}catch{} viewers.delete(v);}updateVideoDemand();if(!viewers.size)endAgent();
        displayPrivacy.revoke(token);return respond(res,200,{ok:true},{'Set-Cookie':`${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`});
      }
      if(req.method==='GET'&&pathname==='/api/screen'){
        if(!permits(token,'screen'))return respond(res,403,{error:'Screen viewing was not approved.'});
        if(!enabled||!requiresHeader(req))return respond(res,403,{error:'Screen sharing disabled'});
        const query=new URL(req.url,'http://localhost').searchParams,preset=query.get('p')||'med';
        if(!PRESETS[preset])return respond(res,400,{error:'Invalid quality setting'});
        const maxWidth=preset==='auto'&&query.has('maxWidth')?Number(query.get('maxWidth')):null;
        if(maxWidth!==null&&(!Number.isInteger(maxWidth)||maxWidth<320||maxWidth>8192))return respond(res,400,{error:'Invalid screen size preference'});
        if(!startAgent(preset,maxWidth))return respond(res,503,{error:'Desktop agent unavailable. Build it on Windows using start.bat.'});
        res.writeHead(200,{'Content-Type':'application/octet-stream','Cache-Control':'no-store, no-transform','X-Accel-Buffering':'no','X-Content-Type-Options':'nosniff'});
        res.socket.setNoDelay(true);
        const regions=new URL(req.url,'http://localhost').searchParams.get('regions')==='1';
        const v={res,token,regions,controlOnly:query.get('controlOnly')==='1',maxWidth,regionBase:null,busy:false,streamId:crypto.randomBytes(12).toString('hex'),feedbackSocket:null,inFlight:new Map(),deliveryMs:0};viewers.add(v);res.on('drain',()=>{v.busy=false;requestVideoFrame();});
        if(regions&&regionMode&&agent?.stdin.writable&&!refreshPending){refreshPending=true;agent.stdin.write('refresh\n');}
        updateVideoDemand();if(agentMeta)res.write(viewerMetadata(v));
        // An already-open stream must not outlive the pairing session.
        const expiry=sessionExpiry(()=>sessions.get(token)?.until||0,()=>{if(!res.writableEnded)res.end();});
        record(ip,'Remote screen opened',undefined,token);console.log(`[Sharing screen with ${ip}. Close host window to stop.]`);
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
        record(ip,`Requested ${b.action}`,undefined,token);
        return act(b.action,(e,result)=>respond(res,e?500:200,e?{error:`Action failed: ${e.message}`}:{ok:true,...result,msg:result?.msg||`${b.action} requested`}));
      }
      return respond(res,404,{error:'Not found'});
    }catch(err){if(res.headersSent){res.destroy();return;}return respond(res,err.message==='Request too large'?413:400,{error:err.message});}
  });
  // Status polls run every five seconds. Keep idle HTTP connections beyond
  // that boundary so the next control request can reuse a live connection.
  server.keepAliveTimeout=65000;server.headersTimeout=70000;
  const inputStream=new WebSocketServer({noServer:true,maxPayload:100000,perMessageDeflate:false});
  const audioStream=new WebSocketServer({noServer:true,maxPayload:1024,perMessageDeflate:false});
  const guestScreens=createGuestScreen({sessions,auth,sessionExpiry,openHandoff:options.nativeFeatures?.openPhoneInput||(!options.disableAgent&&process.platform==='win32'?value=>nativeFeatures.openPhoneInput(value):undefined),onDesktopFiles:async(controller,target,paths)=>{
    const scope=workspaceScope(controller.token),grant=target.control;
    if(sessions.get(controller.token)?.role!=='owner'||!scope||scope!==workspaceScope(target.token)||grant?.controller!==controller||!target.deviceId)throw Error('Pair the phone with the same account before sending files across the edge.');
    const devices=await syncHub.devices(scope);if(!devices.some(device=>device.id===target.deviceId))throw Error('Open the phone app with the same account first.');
    const result=await syncHub.enqueue({accountKey:scope,files:paths,target:target.deviceId,returnItems:true});guestScreens.offerFiles(target.deviceId,result.items,token=>workspaceScope(token)===scope&&target.control===grant&&grant.controller===controller);return result.count;
  }});
  const webRtcVideo=createWebRtcVideo({sessions,auth,sessionExpiry});
  const nativeVideo=createNativeVideo({root:ROOT,sessions,auth,sessionExpiry,enabled:enabled&&!options.disableAgent,...options.nativeVideoDependencies});
  const secondScreen=createSecondScreen({sessions,sessionExpiry,native:nativeFeatures,deviceFor:token=>syncHub.device(token,workspaceScope(token)||'owner'),onStop:token=>nativeVideo.revoke(token),onFiles:async(token,device,paths)=>{if(sessions.get(token)?.role!=='owner')throw Error('Your owner session ended.');const scope=workspaceScope(token);if(!scope)throw Error('Sign in before sending files.');const result=await syncHub.enqueue({accountKey:scope,files:paths,target:device.id,returnItems:true});return result.items;}});
  const cameraChannels=new Map(['pc','phone'].map(room=>[room,createWebRtcVideo({sessions,auth,sessionExpiry})]));
  const phoneAudio=createPhoneAudio({sessions,auth,sessionExpiry,openOutput:settings=>nativeFeatures.openAudioOutput(settings)});
  function cameraRevoke(token){phoneAudio.revoke(token);for(const channel of cameraChannels.values())channel.revoke(token);}
  const companions=createDeviceCompanions({clipboard:sharedClipboard,sessions,auth,scopeFor:workspaceScope,sessionExpiry});
  const collaboration=createCollaboration({sessions,auth,sessionExpiry,accountKey:workspaceScope,onActivity:(scope,event)=>accountData.record(scope,event)});
  function rejectUpgrade(socket,status,message) {
    socket.on('error',()=>{});
    const body=JSON.stringify({error:message});
    socket.end(`HTTP/1.1 ${status} ${http.STATUS_CODES[status]}\r\nConnection: close\r\nContent-Type: application/json\r\nContent-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`);
  }
  server.on('upgrade',(req,socket,head)=>{
    socket.on('error',()=>{});
    let pathname;try{pathname=new URL(req.url,'http://localhost').pathname;}catch{return rejectUpgrade(socket,400,'Bad URL');}
    if(!['/api/input-stream','/api/audio','/api/guest-screen','/api/webrtc-video','/api/native-video','/api/second-screen','/api/collaboration','/api/camera','/api/phone-audio','/api/device-channel'].includes(pathname))return rejectUpgrade(socket,404,'Not found');
    if(!allowedRequest(req))return rejectUpgrade(socket,403,'Input stream host rejected');
    try{
      const origin=new URL(req.headers.origin);
      if(!['http:','https:'].includes(origin.protocol)||origin.host!==req.headers.host)return rejectUpgrade(socket,403,'Cross-origin request rejected');
    }catch{return rejectUpgrade(socket,403,'Request origin required');}
    const token=auth(req);
    if(!token)return rejectUpgrade(socket,401,'Pair your phone first');
    if(sessions.get(token).role==='account')return rejectUpgrade(socket,403,'Pair this PC before opening a remote session');
    if(pathname==='/api/device-channel'){if(sessions.get(token)?.role!=='owner'||!workspaceScope(token))return rejectUpgrade(socket,403,'Pair your own device first.');return companions.upgrade(req,socket,head,token);}
    if(pathname==='/api/second-screen'){if(sessions.get(token)?.role!=='owner')return rejectUpgrade(socket,403,'Owner access required.');return secondScreen.upgrade(req,socket,head,token);}
    if(pathname==='/api/native-video'){
      if(!enabled||!permits(token,'screen'))return rejectUpgrade(socket,403,'Screen viewing was not approved');
      const params=new URL(req.url,'http://localhost').searchParams,preset=params.get('p')||'auto';if(!Object.hasOwn(NATIVE_VIDEO_PROFILES,preset))return rejectUpgrade(socket,400,'Invalid video quality');
      let windowSource=null;if(params.has('window')){if(!permits(token,'apps'))return rejectUpgrade(socket,403,'Window presentation was not approved');try{windowSource=nativeFeatures.presentationApp(params.get('window'));}catch(error){return rejectUpgrade(socket,error.status||400,'Choose the window again');}}
      if(params.has('monitor')){if(params.has('window'))return rejectUpgrade(socket,400,'Choose one display source.');try{windowSource=secondScreen.source(token,params.get('monitor'));}catch{return rejectUpgrade(socket,400,'Start Second screen again.');}}
      return nativeVideo.upgrade(req,socket,head,token,preset,windowSource,params.get('mse')==='1');
    }
    if(pathname==='/api/phone-audio'){
      if(sessions.get(token)?.role!=='owner')return rejectUpgrade(socket,403,'Only the paired PC owner can stream audio to this PC');
      phoneAudio.upgrade(req,socket,head,token);return;
    }
    if(pathname==='/api/camera'){
      if(sessions.get(token)?.role==='guest')return rejectUpgrade(socket,403,'Camera sharing is available only to the owner');
      const query=new URL(req.url,'http://localhost').searchParams,channel=cameraChannels.get(query.get('room'));
      if(!channel)return rejectUpgrade(socket,400,'Choose the PC or phone camera channel');
      const role=query.get('role');if(!['publish','watch'].includes(role))return rejectUpgrade(socket,400,'Invalid camera role');
      channel.upgrade(req,socket,head,token,role==='publish');return;
    }
    if(pathname==='/api/collaboration'){
      if(!['voice','whiteboard','chat','notes'].some(key=>permits(token,key)))return rejectUpgrade(socket,403,'Collaboration was not approved');
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
        const expiry=sessionExpiry(()=>sessions.get(token)?.until||0,()=>{entry.capture?.stop();disconnectInput(ws,1008,'Session expired');});
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
      const expiry=sessionExpiry(()=>sessions.get(token)?.until||0,()=>disconnectInput(ws,1008,'Session expired'));
      const activeIds=new Set();
      const send=payload=>{if(ws.readyState===WebSocket.OPEN)ws.send(JSON.stringify(payload));};
      ws.on('error',()=>{});
      // Protocol ping/pong detects a vanished browser and releases held input.
      let alive=true;
      ws.on('pong',()=>{alive=true;if(auth(req)===token)displayPrivacy.heartbeat(token);});
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
  function stop(){stopping=true;appUpdates.close();secondScreen.revoke();accountAPI.close();clipboardObserver?.close();clipboardObserver=null;server.closeIdleConnections?.();displayPrivacy.close();endViewers();closeAudioSockets();guestScreens.revoke();webRtcVideo.revoke();nativeVideo.revoke();cameraRevoke();collaboration.revoke();companions.revoke();}
  server.on('close',()=>{socials.close();sessionAdmin.close();google.clear();systemMetrics.close();clearInterval(cpuClock);clearInterval(smartClock);guestRequests.clear();bundles.clear();assets.clear();stop();inputStream.close();audioStream.close();guestScreens.close();secondScreen.close();webRtcVideo.close();nativeVideo.close();for(const channel of cameraChannels.values())channel.close();phoneAudio.close();collaboration.close();companions.close();deviceLinks.close();handoffs.clear();nativeFeatures.close();void fileTransfers.close();});
  if(options.discovery===true)discovery=require('./local-discovery').advertise(server,{name:hostname,identity:hostIdentity,enabled:allowLan});
  server.once('close',()=>{networkDevices.close();clipboardObserver?.close();clipboardObserver=null;void syncHub.close();void sharedClipboard.close().finally(()=>accountData.close());});
  function clipboardPreferences(){
    const history=accountData.getValue('owner','history.preferences')?.clipboardCapture!==false,sync=sharedClipboard.enabled('owner');
    const enabled=!stopping&&options.observeClipboard===true&&!options.disableAgent&&(history||sync);
    if(!enabled){clipboardObserver?.close();clipboardObserver=null;return;}if(clipboardObserver)return;
    clipboardObserver=createClipboardWatch({root:ROOT,captureImages:true,...options.clipboardWatchDependencies,onChange:async value=>{
      if(value.local)return;
      const echoed=value.kind==='text'&&clipboardEcho?.text===value.text&&Date.now()-clipboardEcho.at<1500;if(echoed)clipboardEcho=null;
      const history=accountData.getValue('owner','history.preferences')?.clipboardCapture!==false;
      const share=sharedClipboard.enabled('owner')&&(['text','empty'].includes(value.kind)||value.kind==='image'&&value.data&&accountData.getValue('owner','clipboard.preferences')?.images!==false);
      if(share){await sharedClipboard.native(value,{device:hostname,history:history&&!echoed});return;}
      if(!history||echoed)return;const files=(value.files||[]).slice();while(files.length&&Buffer.byteLength(JSON.stringify(files))>24000)files.pop();
      accountData.record('owner',{id:'pc-clipboard:'+value.id,type:'clipboard',action:'clipboard.captured',label:value.initial?'PC clipboard at host start':value.kind==='text'?'Copied text on PC':value.kind==='files'?'Copied files on PC':value.kind==='image'?'Copied an image on PC':'PC clipboard changed',device:hostname,text:value.kind==='text'?value.text:'',payload:{kind:value.kind,initial:!!value.initial,...files.length&&{files,total:value.files.length}}});
    }});
  }
  clipboardPreferences();const stopClipboardPreferences=accountData.subscribe(scope=>{if(scope==='owner')clipboardPreferences();});
  server.once('close',()=>{stopClipboardPreferences();clipboardObserver?.close();clipboardObserver=null;});
  return {server,pin,port,addresses:interfaces,stop};
}
if(require.main===module){
  if(process.argv.includes('--port')){console.log(Number(process.env.PORT||7666));process.exit(0);}
  let config={};
  try {config=JSON.parse(fs.readFileSync(path.join(ROOT,'config.json'),'utf8'));}
  catch(e) { if(e.code!=='ENOENT'){console.error('Cannot load config.json:',e.message);process.exit(1);} }
  const allowLan=config.allowLan!==false;
  if(typeof config.password!=='string'||!config.password||['serame','admin'].includes(config.password)){console.error('Set your owner password in local config.json, or use the Windows host setup. The old default sign-ins are disabled.');process.exit(1);}
  const app=createApp({socialsDirectory:config.socialsDirectory,socialsDataDirectory:config.socialsDataDirectory,workspaceFile:path.join(ROOT,'.account-workspace.sqlite'),sharedClipboardDirectory:path.join(ROOT,'.shared-clipboard'),observeClipboard:true,useWindowsLocations:true,discovery:allowLan,fileLocations:config.fileLocations,fileLocationsProvider:()=>pcLocations(JSON.parse(fs.readFileSync(path.join(ROOT,'config.json'),'utf8')).fileLocations),syncFile:path.join(ROOT,'.shared-device-state.json'),screen:config.screen!==false,delaySeconds:config.delaySeconds,requirePin:config.requirePin===true,tunnelHostname:config.tunnelHostname,allowLan,password:config.password,sessionFile:path.join(ROOT,'.remembered-sessions.json'),transferDirectory:config.transferDirectory,maxFileBytes:config.maxFileBytes,webRtcIceServers:config.webRtcIceServers,deviceName:config.deviceName||"SERAME'S PC",setDeviceName:name=>saveDeviceName(ROOT,name),googleSignIn:{...config.googleSignIn,clientId:process.env.PCR_GOOGLE_CLIENT_ID||config.googleSignIn?.clientId,clientSecret:process.env.PCR_GOOGLE_CLIENT_SECRET||config.googleSignIn?.clientSecret}});
  app.server.listen(app.port,allowLan?'0.0.0.0':'127.0.0.1',()=>{
    const actual=app.server.address().port;
    const ip=app.addresses.find(a=>a.startsWith('192.168.'))||app.addresses[0]||'127.0.0.1';
    console.log(`\nElleson Connect — personal Windows host\n${allowLan?'Local phone URL: http://'+ip+':'+actual+'\n':''}${config.tunnelHostname?'Website: https://'+tunnelHost(config.tunnelHostname)+'\n':''}Sign in with your app password. Remember me is available.\nKeep this terminal open; Ctrl+C stops sharing.\nNever forward port ${actual} to the internet.\n`);
  });
  app.server.on('error',e=>{console.error(e.code==='EADDRINUSE'?'Port is in use. Close the previous Elleson Connect terminal before starting a new instance.':e.message);process.exitCode=1;});
}
module.exports={createApp,privateIP,validInput,sessionExpiry};
