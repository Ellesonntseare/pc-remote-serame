'use strict';
const {WebSocketServer,WebSocket}=require('ws'),crypto=require('node:crypto');
const actions=new Set(['ring','stop-ring','file-roots','file-list','file-search','file-hash','keyboard-context','notice']);
function createDeviceCompanions({clipboard,sessions,auth,scopeFor,sessionExpiry,now=Date.now}={}){
  const wss=new WebSocketServer({noServer:true,maxPayload:1024*1024,perMessageDeflate:false}),peers=new Set(),pending=new Map();let stopped=false;
  const send=(peer,value)=>{if(peer.ws.readyState!==WebSocket.OPEN||peer.ws.bufferedAmount>2*1024*1024)return false;peer.ws.send(JSON.stringify(value));return true;};
  async function snapshot(peer,after){try{const value=await clipboard.snapshot(peer.scope,{after});if(send(peer,{type:'clipboard',...value}))peer.clipRevision=value.revision;}catch{send(peer,{type:'clipboard-error',message:'Clipboard is waiting for the PC.'});}}
  const unsubscribe=clipboard.subscribe(scope=>{for(const peer of peers)if(peer.scope===scope&&peer.id)void snapshot(peer,peer.clipRevision);});
  function end(peer,message='Device disconnected.'){
    peers.delete(peer);clearTimeout(peer.helloTimer);clearInterval(peer.heartbeat);peer.expiry?.();
    for(const [id,request]of pending)if(request.peer===peer){pending.delete(id);clearTimeout(request.timer);request.reject(Object.assign(Error(message),{status:409}));}
  }
  function upgrade(req,socket,head,token){
    wss.handleUpgrade(req,socket,head,ws=>{
      const session=sessions.get(token),scope=scopeFor(token);if(stopped||!session||session.role!=='owner'||!scope||peers.size>=80){ws.close(1008,'Pair this device first.');return;}
      const peer={ws,token,scope,id:'',name:'Phone',capabilities:{},status:{},seen:now(),alive:true,clipRevision:0};peers.add(peer);
      peer.expiry=sessionExpiry(()=>session.until,()=>{end(peer,'Your session ended.');ws.close(1008,'Your session ended.');});
      peer.helloTimer=setTimeout(()=>{if(!peer.id)ws.close(1008,'Device registration timed out.');},8000);peer.helloTimer.unref?.();
      peer.heartbeat=setInterval(()=>{if(!peer.alive||auth(req)!==token){end(peer,'Your connection ended.');ws.terminate();return;}peer.alive=false;ws.ping();},15000);peer.heartbeat.unref?.();ws.on('pong',()=>{peer.alive=true;peer.seen=now();});ws.on('error',()=>{});ws.on('close',()=>end(peer));
      ws.on('message',(bytes,binary)=>{
        if(binary){ws.close(1003,'Use the file transfer endpoint for binary data.');return;}let value;try{value=JSON.parse(bytes.toString());}catch{return;}
        if(value.type==='hello'){
          if(typeof value.deviceId!=='string'||!/^[-a-zA-Z0-9]{12,80}$/.test(value.deviceId)||typeof value.name!=='string'||value.name.length>80)return;
          for(const other of peers)if(other!==peer&&other.scope===scope&&other.id===value.deviceId){end(other,'This device reconnected.');other.ws.close(1001,'Device reconnected.');}
          peer.id=value.deviceId;peer.name=value.name;clearTimeout(peer.helloTimer);peer.capabilities={};for(const name of ['clipboardText','clipboardImages','backgroundClipboard','ring','files','keyboard','scanner'])peer.capabilities[name]=value.capabilities?.[name]===true;
          send(peer,{type:'connected',account:scope,deviceId:peer.id,serverTime:now()});void snapshot(peer,Number.isSafeInteger(value.after)?value.after:0);return;
        }
        if(!peer.id)return;
        if(value.type==='clipboard-resume'){void snapshot(peer,Number.isSafeInteger(value.after)?value.after:0);return;}
        if(value.type==='reply'&&typeof value.id==='string'){
          const request=pending.get(value.id);if(!request||request.peer!==peer)return;pending.delete(value.id);clearTimeout(request.timer);
          if(value.ok===true)request.resolve(value.result&&typeof value.result==='object'?value.result:{});else request.reject(Object.assign(Error(typeof value.error==='string'?value.error.slice(0,250):'The phone could not finish this action.'),{status:409}));return;
        }
        if(value.type==='status'){
          peer.status={};for(const name of ['network','keyboard','clipboard','appVersion','webViewVersion'])if(typeof value[name]==='string')peer.status[name]=value[name].slice(0,100);if(Number.isFinite(value.battery))peer.status.battery=Math.max(0,Math.min(100,Math.round(value.battery)));peer.seen=now();
        }
      });
    });
  }
  function devices(scope){return[...peers].filter(peer=>peer.scope===scope&&peer.id).map(peer=>({id:peer.id,name:peer.name,online:true,capabilities:peer.capabilities,status:peer.status,seen:peer.seen}));}
  function request(scope,deviceId,action,payload={},timeout=15000){
    if(!actions.has(action))return Promise.reject(Object.assign(Error('Unsupported phone action.'),{status:400}));
    const peer=[...peers].find(peer=>peer.scope===scope&&peer.id===deviceId);if(!peer)return Promise.reject(Object.assign(Error('Open PC Remote on that phone to connect it.'),{status:409}));
    if([...pending.values()].filter(item=>item.peer===peer).length>=8)return Promise.reject(Object.assign(Error('The phone is busy. Try again in a moment.'),{status:429}));
    if(Buffer.byteLength(JSON.stringify(payload))>128*1024)return Promise.reject(Object.assign(Error('Phone request is too large.'),{status:400}));
    const id=crypto.randomUUID();return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{pending.delete(id);reject(Object.assign(Error('The phone did not respond. Check its connection.'),{status:504}));},Math.min(60000,Math.max(1000,timeout)));timer.unref?.();pending.set(id,{peer,resolve,reject,timer});if(!send(peer,{type:'command',id,action,payload})){pending.delete(id);clearTimeout(timer);reject(Object.assign(Error('The phone connection is busy.'),{status:409}));}});
  }
  function revoke(token){for(const peer of [...peers])if(!token||peer.token===token){end(peer,'Your session ended.');peer.ws.close(1001,'Your session ended.');const timer=setTimeout(()=>peer.ws.terminate(),300);timer.unref?.();}}
  return{upgrade,devices,request,revoke,close(){stopped=true;unsubscribe();revoke();wss.close();}};
}
module.exports={createDeviceCompanions};
