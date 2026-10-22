'use strict';
const {WebSocketServer,WebSocket}=require('ws'),{randomBytes}=require('node:crypto'),{can}=require('./guest-permissions');
const colors=['#69e3ba','#7eb5ff','#f3c776','#f397bb','#ffffff'];
function validStroke(v){return v&&colors.includes(v.color)&&Number.isInteger(v.width)&&v.width>=1&&v.width<=12&&Array.isArray(v.points)&&v.points.length>=1&&v.points.length<=256&&v.points.every(p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&p.x>=0&&p.x<=1&&p.y>=0&&p.y<=1);}
function createCollaboration({sessions,auth,sessionExpiry}){
  const wss=new WebSocketServer({noServer:true,maxPayload:100000,perMessageDeflate:false}),peers=new Set(),rooms=new Map();
  const send=(peer,value)=>{if(peer?.ws.readyState===WebSocket.OPEN&&peer.ws.bufferedAmount<256000)peer.ws.send(JSON.stringify(value));};
  function announce(){for(const peer of peers)send(peer,{type:'people',people:[...peers].filter(other=>other!==peer&&(peer.owner?!other.owner:other.owner)).map(other=>({id:other.id,room:other.roomId,voice:other.voice,board:other.board,name:other.owner?'Serame':'Guest'}))});}
  function voiceEnd(peer){const partner=peer.partner,id=peer.callId;peer.partner=null;peer.callId=null;peer.voice=false;if(partner){partner.partner=null;partner.callId=null;partner.voice=false;send(partner,{type:'voice-ended',id});}send(peer,{type:'voice-ended',id});announce();}
  function leaveBoard(peer){const room=rooms.get(peer.boardRoom);room?.members.delete(peer);if(room&&!room.members.size)rooms.delete(peer.boardRoom);peer.boardRoom=null;peer.board=false;}
  function drop(peer){voiceEnd(peer);leaveBoard(peer);peers.delete(peer);announce();}
  function upgrade(req,socket,head,token){wss.handleUpgrade(req,socket,head,ws=>{
    if(peers.size>=20){ws.close(1008,'Room is full');return;}const session=sessions.get(token);if(!session){ws.close();return;}
    const peer={ws,token,owner:session.role!=='guest',id:randomBytes(12).toString('hex'),roomId:session.guestId||null,voice:false,board:false,boardRoom:null,partner:null,alive:true,rate:0,at:Date.now()};peers.add(peer);
    send(peer,{type:'ready',id:peer.id,room:peer.roomId});announce();
    const expiry=sessionExpiry(()=>session.until,()=>{drop(peer);ws.close(1008,'Session expired');});const heartbeat=setInterval(()=>{if(!peer.alive||auth(req)!==token){drop(peer);ws.terminate();return;}peer.alive=false;ws.ping();},15000);heartbeat.unref();ws.on('pong',()=>peer.alive=true);ws.on('error',()=>{});
    ws.on('message',(bytes,binary)=>{
      if(auth(req)!==token){drop(peer);ws.close(1008,'Session ended');return;}if(Date.now()-peer.at>1000){peer.at=Date.now();peer.rate=0;}if(binary||++peer.rate>80){ws.close(1008,'Message limit');return;}
      let value;try{value=JSON.parse(bytes.toString());if(!value||typeof value!=='object')return;}catch{return;}
      if(value.type==='voice-join'&&can(session,'voice')){peer.voice=true;announce();return;}
      if(value.type==='voice-leave'){voiceEnd(peer);return;}
      if(value.type==='call'&&peer.owner&&peer.voice&&!peer.partner){const target=[...peers].find(p=>p.id===value.id&&!p.owner&&p.voice&&!p.partner);if(target){peer.partner=target;target.partner=peer;peer.callId=target.callId=randomBytes(16).toString('hex');send(peer,{type:'voice-peer',id:peer.callId,initiator:true});send(target,{type:'voice-peer',id:peer.callId,initiator:false});}return;}
      if(value.type==='description'&&peer.voice&&peer.partner&&value.id===peer.callId){const d=value.description;if(d&&['offer','answer'].includes(d.type)&&typeof d.sdp==='string'&&d.sdp.length<=90000)send(peer.partner,{type:'description',id:peer.callId,description:{type:d.type,sdp:d.sdp}});return;}
      if(value.type==='ice'&&peer.voice&&peer.partner&&value.id===peer.callId){const c=value.candidate;if(c===null||c&&typeof c.candidate==='string'&&c.candidate.length<=4000)send(peer.partner,{type:'ice',id:peer.callId,candidate:c===null?null:{candidate:c.candidate,sdpMid:typeof c.sdpMid==='string'?c.sdpMid.slice(0,100):null,sdpMLineIndex:Number.isInteger(c.sdpMLineIndex)?c.sdpMLineIndex:null}});return;}
      if(value.type==='board-join'&&can(session,'whiteboard')){
        const target=peer.owner?[...peers].find(p=>!p.owner&&p.roomId===value.room&&can(sessions.get(p.token),'whiteboard')):peer;
        if(!target)return;leaveBoard(peer);peer.board=true;peer.boardRoom=target.roomId;
        if(!rooms.has(peer.boardRoom))rooms.set(peer.boardRoom,{members:new Set(),strokes:[],points:0});const room=rooms.get(peer.boardRoom);room.members.add(peer);send(peer,{type:'board',strokes:room.strokes});announce();return;
      }
      const room=rooms.get(peer.boardRoom);
      if(value.type==='stroke'&&room?.members.has(peer)&&can(session,'whiteboard')&&validStroke(value)){
        const stroke={type:'stroke',id:randomBytes(8).toString('hex'),color:value.color,width:value.width,points:value.points.map(({x,y})=>({x,y}))};room.strokes.push(stroke);room.points+=stroke.points.length;
        let trimmed=false;while(room.strokes.length>300||room.points>15000){room.points-=room.strokes.shift().points.length;trimmed=true;}
        for(const member of room.members)send(member,trimmed?{type:'board',strokes:room.strokes}:stroke);return;
      }
      if(value.type==='board-clear'&&room?.members.has(peer)){room.strokes=[];room.points=0;for(const member of room.members)send(member,{type:'board',strokes:[]});}
    });
    ws.on('close',()=>{drop(peer);expiry();clearInterval(heartbeat);});
  });}
  function revoke(token){for(const peer of [...peers])if(!token||peer.token===token){drop(peer);peer.ws.close(1001,'Session ended');const timeout=setTimeout(()=>peer.ws.terminate(),300);timeout.unref();}}
  return {upgrade,revoke,close(){revoke();rooms.clear();wss.close();}};
}
module.exports={createCollaboration,validStroke};
