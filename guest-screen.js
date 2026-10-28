'use strict';
const {WebSocketServer,WebSocket}=require('ws');
const {createPhoneControl}=require('./phone-control');
const {randomBytes}=require('node:crypto');
function jpegSize(bytes){
  if(bytes.length<20||bytes.readUInt16BE(0)!==0xffd8||bytes.readUInt16BE(bytes.length-2)!==0xffd9)return null;
  let at=2;
  while(at+4<bytes.length){if(bytes[at++]!==255)return null;while(bytes[at]===255)at++;const marker=bytes[at++];if(marker===0xda||marker===0xd9)return null;const len=bytes.readUInt16BE(at);if(len<2||at+len>bytes.length)return null;if([0xc0,0xc1,0xc2].includes(marker)){if(len<8)return null;const height=bytes.readUInt16BE(at+3),width=bytes.readUInt16BE(at+5);return width>0&&height>0&&width<=1920&&height<=1920&&width*height<=2073600?{width,height}:null;}at+=len;}
  return null;
}
function validMark(value){return value&&['laser','pen','clear'].includes(value.tool)&&(value.tool==='clear'||Array.isArray(value.points)&&value.points.length>=1&&value.points.length<=64&&value.points.every(p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&p.x>=0&&p.x<=1&&p.y>=0&&p.y<=1));}
function createGuestScreen({sessions,auth,sessionExpiry}){
  const wss=new WebSocketServer({noServer:true,maxPayload:1024*1024,perMessageDeflate:false}),peers=new Set();
  const send=(peer,data)=>{if(peer.ws.readyState===WebSocket.OPEN&&peer.ws.bufferedAmount<512*1024)peer.ws.send(typeof data==='string'||Buffer.isBuffer(data)?data:JSON.stringify(data));};
  const sharing=id=>Array.from(peers).find(p=>p.id===id&&p.sharing);
  const control=createPhoneControl({send,peers,sharing});
  const shareList=()=>Array.from(peers).filter(p=>p.sharing).map(p=>({id:p.id,device:p.device}));
  function announce(){const shares=shareList();for(const peer of peers)if(peer.owner&&!peer.publisher)send(peer,{type:'shares',shares});}
  function stopShare(peer){control.end(peer);peer.frame=null;peer.capture=null;if(!peer.sharing)return;peer.sharing=false;peer.marks=[];for(const watcher of peers)if(watcher.owner&&watcher.watching===peer.id){watcher.watching=null;send(watcher,{type:'stopped'});}announce();}
  function upgrade(req,socket,head,token){
    wss.handleUpgrade(req,socket,head,ws=>{
      const session=sessions.get(token);if(!session){ws.close(1008,'Session ended');return;}
      const peer={ws,token,owner:session.role!=='guest',publisher:session.role==='guest',id:session.guestId||randomBytes(16).toString('hex'),device:session.device||'Shared device',sharing:false,watching:null,marks:[],frame:null,lastFrame:0,rateAt:Date.now(),rate:0,alive:true};
      if(!peer.owner)for(const old of peers)if(!old.owner&&old.id===peer.id){stopShare(old);old.ws.close(1001,'Sharing moved to another tab');}
      peers.add(peer);const expiry=sessionExpiry(()=>session.until,()=>ws.close(1008,'Session expired'));
      send(peer,{type:'ready',role:peer.owner?'owner':'guest'});if(peer.owner)send(peer,{type:'shares',shares:shareList()});
      ws.on('error',()=>{});ws.on('pong',()=>{peer.alive=true;});
      const heartbeat=setInterval(()=>{if(auth(req)!==token||!peer.alive){stopShare(peer);ws.terminate();return;}peer.alive=false;ws.ping();},15000);heartbeat.unref();
      ws.on('message',(bytes,binary)=>{
        if(auth(req)!==token){stopShare(peer);ws.close(1008,'Session ended');return;}
        const now=Date.now();if(now-peer.rateAt>=1000){peer.rate=0;peer.rateAt=now;}if(++peer.rate>120){ws.close(1008,'Too many sharing messages');return;}
        if(binary){
          if(!peer.sharing||now-peer.lastFrame<80)return;
          const dimensions=jpegSize(bytes);if(!dimensions){stopShare(peer);ws.close(1008,'Invalid shared frame');return;}peer.lastFrame=now;peer.frame=bytes;
          for(const watcher of peers)if(watcher.owner&&watcher.watching===peer.id)send(watcher,bytes);return;
        }
        let body;try{if(bytes.length>16000)throw Error();body=JSON.parse(bytes.toString());if(!body||typeof body!=='object')throw Error();}catch{ws.close(1008,'Invalid sharing message');return;}
        if(body.type==='start'){control.detach(peer);peer.publisher=true;peer.watching=null;peer.sharing=true;peer.controlSupported=body.controlSupported===true;peer.mouseSupported=peer.controlSupported&&body.mouseSupported===true;if(typeof body.device==='string'&&body.device.trim())peer.device=body.device.trim().replace(/[\u0000-\u001f]/g,'').slice(0,80);peer.capture=null;peer.marks=[];peer.frame=null;peer.lastFrame=0;announce();send(peer,{type:'sharing'});return;}
        if(body.type==='stop'&&peer.publisher){stopShare(peer);return;}
        if(body.type==='watch'&&peer.owner&&!peer.publisher){const target=sharing(body.id);if(peer.watching!==target?.id)control.detach(peer);peer.watching=target?.id||null;send(peer,target?{type:'watching',id:target.id,marks:target.marks,capture:target.capture}:{type:'stopped'});if(target){send(peer,control.state(target,peer));if(target.frame)send(peer,target.frame);}return;}
        if(control.handle(peer,body))return;
        if(body.type==='mark'&&validMark(body)){
          const target=peer.publisher?(peer.sharing?peer:null):peer.owner?sharing(peer.watching):null;if(!target)return;
          const mark={type:'mark',tool:body.tool,points:body.tool==='clear'?[]:body.points.map(({x,y})=>({x,y})),color:peer.owner?'#66e6bc':'#82b7ff'};
          if(mark.tool==='clear')target.marks=[];else if(mark.tool==='pen'){target.marks.push(mark);target.marks=target.marks.slice(-160);}
          for(const other of peers)if(other!==peer&&(other===target||other.owner&&other.watching===target.id))send(other,mark);
        }
      });
      ws.on('close',()=>{control.detach(peer);stopShare(peer);peers.delete(peer);clearInterval(heartbeat);expiry();});
    });
  }
  function revoke(token){for(const peer of peers)if(!token||peer.token===token){control.detach(peer);stopShare(peer);peer.ws.close(1001,'Session ended');const timer=setTimeout(()=>peer.ws.terminate(),300);timer.unref();}}
  return {upgrade,revoke,close(){revoke();wss.close();}};
}
module.exports={createGuestScreen,jpegSize,validMark};
