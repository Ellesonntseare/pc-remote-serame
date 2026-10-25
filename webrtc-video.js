'use strict';
const crypto=require('node:crypto');
const {WebSocketServer,WebSocket}=require('ws');
const {can}=require('./guest-permissions');
function activeAudio(sdp){return String(sdp).split(/(?=^m=)/m).some(section=>/^m=audio\s/m.test(section)&&!/^m=audio\s+0(?:\s|\/)/m.test(section)&&!/^a=inactive\s*$/m.test(section));}
function validSignal(value,publisher){
  if(!value||typeof value!=='object')return false;
  if(value.type==='description')return value.description&&value.description.type===(publisher?'offer':'answer')&&typeof value.description.sdp==='string'&&value.description.sdp.length>0&&value.description.sdp.length<=90000;
  if(value.type==='candidate')return value.candidate===null||value.candidate&&typeof value.candidate.candidate==='string'&&value.candidate.candidate.length<=4096&&(value.candidate.sdpMid==null||typeof value.candidate.sdpMid==='string'&&value.candidate.sdpMid.length<=100)&&(value.candidate.sdpMLineIndex==null||Number.isInteger(value.candidate.sdpMLineIndex)&&value.candidate.sdpMLineIndex>=0&&value.candidate.sdpMLineIndex<=128)&&(value.candidate.usernameFragment==null||typeof value.candidate.usernameFragment==='string'&&value.candidate.usernameFragment.length<=256);
  return false;
}
function iceServers(value){
  if(value===undefined)return [];
  if(!Array.isArray(value)||value.length>4)throw Error('Use up to four WebRTC ICE servers.');
  return value.map(server=>{const urls=Array.isArray(server?.urls)?server.urls:[server?.urls];if(!urls.length||urls.length>8||urls.some(url=>typeof url!=='string'||url.length>512||!/^(stun|stuns|turn|turns):[^\s]+$/.test(url)))throw Error('Invalid WebRTC ICE server.');const result={urls};for(const key of ['username','credential'])if(server[key]!==undefined){if(typeof server[key]!=='string'||server[key].length>512)throw Error('Invalid WebRTC relay credentials.');result[key]=server[key];}return result;});
}
function createWebRtcVideo({auth,sessionExpiry,sessions}){
  const wss=new WebSocketServer({noServer:true,maxPayload:100000,perMessageDeflate:false}),peers=new Set();let publisher=null;
  const send=(peer,value)=>{if(peer?.ws.readyState===WebSocket.OPEN){if(peer.ws.bufferedAmount>262144){peer.ws.close(1008,'Signaling queue is full');return;}peer.ws.send(JSON.stringify(value));}};
  function drop(peer){
    if(!peers.delete(peer))return;
    if(publisher===peer){publisher=null;for(const other of peers){other.linked=false;send(other,{type:'source-stopped'});}}
    else if(peer.linked)send(publisher,{type:'leave',id:peer.id});
  }
  function upgrade(req,socket,head,token,publish){
    wss.handleUpgrade(req,socket,head,ws=>{
      if(publish&&publisher){ws.close(1008,'A PC is already sharing video');return;}
      if(peers.size>=9){ws.close(1008,'Too many video connections');return;}
      const peer={ws,token,publish,audioAllowed:can(sessions.get(token),'audio'),hasAudio:false,id:crypto.randomBytes(16).toString('hex'),linked:false,alive:true,rate:0,rateAt:Date.now()};peers.add(peer);
      if(publish){publisher=peer;for(const other of peers)if(other!==peer)send(other,{type:'source-ready',hasAudio:peer.hasAudio});}
      send(peer,{type:'ready',publish,available:!!publisher,audioAllowed:peer.audioAllowed,hasAudio:publisher?.hasAudio||false});
      const expiry=sessionExpiry(()=>sessions.get(token)?.until||0,()=>{drop(peer);ws.close(1008,'Session expired');});
      const heartbeat=setInterval(()=>{if(!peer.alive||auth(req)!==token){drop(peer);ws.terminate();return;}peer.alive=false;ws.ping();},15000);heartbeat.unref();
      ws.on('pong',()=>{peer.alive=true;});ws.on('error',()=>{});
      ws.on('message',(bytes,binary)=>{
        if(auth(req)!==token){drop(peer);ws.close(1008,'Session ended');return;}
        const now=Date.now();if(now-peer.rateAt>5000){peer.rateAt=now;peer.rate=0;}if(binary||++peer.rate>400){drop(peer);ws.close(1008,'Invalid video signaling');return;}
        let value;try{value=JSON.parse(bytes.toString());}catch{ws.close(1008,'Invalid video signaling');return;}
        if(value?.type==='source-state'&&publish&&typeof value.hasAudio==='boolean'){peer.hasAudio=value.hasAudio;for(const other of peers)if(other!==peer)send(other,{type:'source-ready',hasAudio:peer.hasAudio});return;}
        if(value?.type==='watch'&&!publish){if(!publisher){send(peer,{type:'source-stopped'});return;}if(!peer.linked){peer.linked=true;send(publisher,{type:'join',id:peer.id,audioAllowed:peer.audioAllowed});}return;}
        if(!validSignal(value,publish)){ws.close(1008,'Invalid video signaling');return;}
        const target=publish?Array.from(peers).find(p=>!p.publish&&p.linked&&p.id===value.id):peer.linked?publisher:null;
        if(!target)return;if(publish&&value.type==='description'&&!target.audioAllowed&&activeAudio(value.description.sdp)){drop(peer);ws.close(1008,'PC audio was not approved for this viewer');return;}send(target,{type:value.type,id:publish?undefined:peer.id,...value.type==='description'?{description:{type:value.description.type,sdp:value.description.sdp}}:{candidate:value.candidate===null?null:{candidate:value.candidate.candidate,sdpMid:value.candidate.sdpMid,sdpMLineIndex:value.candidate.sdpMLineIndex,usernameFragment:value.candidate.usernameFragment}}});
      });
      ws.on('close',()=>{drop(peer);expiry();clearInterval(heartbeat);});
    });
  }
  function revoke(token){for(const peer of [...peers])if(!token||peer.token===token){drop(peer);peer.ws.close(1001,'Session ended');const timer=setTimeout(()=>peer.ws.terminate(),300);timer.unref();}}
  return {upgrade,revoke,close(){revoke();wss.close();}};
}
module.exports={createWebRtcVideo,validSignal,iceServers,activeAudio};
