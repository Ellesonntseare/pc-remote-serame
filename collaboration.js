'use strict';
const {WebSocketServer,WebSocket}=require('ws'),{randomBytes}=require('node:crypto'),{can}=require('./guest-permissions');
const colors=['#69e3ba','#7eb5ff','#f3c776','#f397bb','#ffffff'];
function validStroke(v){return v&&colors.includes(v.color)&&Number.isInteger(v.width)&&v.width>=1&&v.width<=12&&Array.isArray(v.points)&&v.points.length>=1&&v.points.length<=256&&v.points.every(p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&p.x>=0&&p.x<=1&&p.y>=0&&p.y<=1);}
function validNotes(value){return !!value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).every(key=>['text','items'].includes(key))&&typeof value.text==='string'&&value.text.length<=8000&&Array.isArray(value.items)&&value.items.length<=50&&new Set(value.items.map(item=>item?.id)).size===value.items.length&&value.items.every(item=>item&&Object.keys(item).every(key=>['id','text','done'].includes(key))&&typeof item.id==='string'&&/^[a-zA-Z0-9_-]{1,64}$/.test(item.id)&&typeof item.text==='string'&&item.text.length<=240&&typeof item.done==='boolean');}
const copyNotes=value=>({text:value.text,items:value.items.map(({id,text,done})=>({id,text,done}))});
function createCollaboration({sessions,auth,sessionExpiry,accountKey=()=>null,onActivity=()=>{}}){
  const wss=new WebSocketServer({noServer:true,maxPayload:100000,perMessageDeflate:false}),peers=new Set(),rooms=new Map(),sharedRooms=new Map();
  const send=(peer,value)=>{if(peer?.ws.readyState===WebSocket.OPEN&&peer.ws.bufferedAmount<256000)peer.ws.send(JSON.stringify(value));};
  function announce(){for(const peer of peers)send(peer,{type:'people',people:[...peers].filter(other=>other!==peer&&(peer.owner?!other.owner:other.owner)).map(other=>({id:other.id,room:other.roomId,voice:other.voice,board:other.board,chat:can(sessions.get(other.token),'chat'),notes:can(sessions.get(other.token),'notes'),name:other.owner?'Serame':'Guest'}))});}
  function audit(peer,event){try{if(peer.accountKey)onActivity(peer.accountKey,{type:'collaboration',device:peer.device,...event});}catch{}}
  function voiceEnd(peer){if(peer.voice||peer.callId)audit(peer,{action:'collaboration.voice-ended',label:'Left a voice session'});const partner=peer.partner,id=peer.callId;peer.partner=null;peer.callId=null;peer.voice=false;if(partner){partner.partner=null;partner.callId=null;partner.voice=false;send(partner,{type:'voice-ended',id});}send(peer,{type:'voice-ended',id});announce();}
  function leaveBoard(peer){const room=rooms.get(peer.boardRoom);room?.members.delete(peer);if(room&&!room.members.size)rooms.delete(peer.boardRoom);peer.boardRoom=null;peer.board=false;}
  function pruneSharedRooms(){for(const [id,room]of sharedRooms)if(!room.chat.size&&!room.notes.size&&![...peers].some(peer=>!peer.owner&&peer.roomId===id))sharedRooms.delete(id);}
  function leaveShared(peer,kind){const id=peer.shared[kind],room=sharedRooms.get(id);room?.[kind].delete(peer);peer.shared[kind]=null;pruneSharedRooms();}
  function endSharedRoom(id){const room=sharedRooms.get(id);if(!room)return;for(const member of new Set([...room.chat,...room.notes])){for(const kind of ['chat','notes'])if(member.shared[kind]===id)member.shared[kind]=null;send(member,{type:'shared-ended',room:id});}sharedRooms.delete(id);}
  function joinShared(peer,session,kind,value){
    if(!can(session,kind))return;
    const target=peer.owner?[...peers].find(p=>!p.owner&&p.roomId===value.room&&can(sessions.get(p.token),kind)):peer;
    if(!target)return;const id=target.roomId;if(peer.shared[kind]!==id)leaveShared(peer,kind);
    if(!sharedRooms.has(id))sharedRooms.set(id,{chat:new Set(),notes:new Set(),messages:[],revision:0,document:{text:'',items:[]}});
    const room=sharedRooms.get(id);room[kind].add(peer);peer.shared[kind]=id;
    send(peer,kind==='chat'?{type:'chat',room:id,messages:room.messages}:{type:'notes',room:id,revision:room.revision,document:room.document});
  }
  function drop(peer){voiceEnd(peer);leaveBoard(peer);leaveShared(peer,'chat');leaveShared(peer,'notes');peers.delete(peer);pruneSharedRooms();announce();}
  function upgrade(req,socket,head,token){wss.handleUpgrade(req,socket,head,ws=>{
    if(peers.size>=20){ws.close(1008,'Room is full');return;}const session=sessions.get(token);if(!session){ws.close();return;}
    const peer={ws,token,owner:session.role!=='guest',id:randomBytes(12).toString('hex'),roomId:session.guestId||null,voice:false,board:false,boardRoom:null,shared:{chat:null,notes:null},accountKey:accountKey(token)||(session.role==='guest'?'owner':null),device:session.deviceName||session.device||'Elleson Connect',partner:null,alive:true,rate:0,at:Date.now(),chatAt:Date.now(),chatRate:0};peers.add(peer);
    send(peer,{type:'ready',id:peer.id,room:peer.roomId});announce();
    const expiry=sessionExpiry(()=>session.until,()=>{if(!peer.owner)endSharedRoom(peer.roomId);drop(peer);ws.close(1008,'Session expired');});const heartbeat=setInterval(()=>{if(!peer.alive||auth(req)!==token){if(!peer.owner&&auth(req)!==token)endSharedRoom(peer.roomId);drop(peer);ws.terminate();return;}peer.alive=false;ws.ping();},15000);heartbeat.unref();ws.on('pong',()=>peer.alive=true);ws.on('error',()=>{});
    ws.on('message',(bytes,binary)=>{
      if(auth(req)!==token){drop(peer);ws.close(1008,'Session ended');return;}if(Date.now()-peer.at>1000){peer.at=Date.now();peer.rate=0;}if(binary||++peer.rate>80){ws.close(1008,'Message limit');return;}
      let value;try{value=JSON.parse(bytes.toString());if(!value||typeof value!=='object')return;}catch{return;}
      if(value.type==='shared-leave'){leaveShared(peer,'chat');leaveShared(peer,'notes');return;}
      if(value.type==='chat-join'){joinShared(peer,session,'chat',value);return;}
      if(value.type==='notes-join'){joinShared(peer,session,'notes',value);return;}
      if(value.type==='chat-send'&&can(session,'chat')){
        const room=sharedRooms.get(peer.shared.chat);if(!room?.chat.has(peer)||typeof value.text!=='string'||!value.text.trim()||value.text.length>1000)return;
        if(Date.now()-peer.chatAt>10000){peer.chatAt=Date.now();peer.chatRate=0;}if(++peer.chatRate>12){send(peer,{type:'shared-error',message:'Please wait a moment before sending another message.'});return;}
        const message={id:randomBytes(10).toString('hex'),text:value.text.trim(),from:peer.owner?'Owner':'Guest',at:Date.now()};room.messages.push(message);audit(peer,{id:'chat:'+message.id,action:'collaboration.message',label:'Session chat message',text:message.text,payload:{from:message.from,room:peer.shared.chat}});if(room.messages.length>60)room.messages.shift();for(const member of room.chat)send(member,{type:'chat-message',room:peer.shared.chat,message});return;
      }
      if(value.type==='notes-update'&&can(session,'notes')){
        const room=sharedRooms.get(peer.shared.notes);if(!room?.notes.has(peer)||!Number.isSafeInteger(value.baseRevision)||!validNotes(value.document))return;
        if(value.baseRevision!==room.revision){send(peer,{type:'notes-conflict',room:peer.shared.notes,revision:room.revision,document:room.document});return;}
        room.document=copyNotes(value.document);room.revision++;audit(peer,{action:'collaboration.notes',label:'Updated session notes and checklist',text:room.document.text,payload:{revision:room.revision,items:room.document.items}});for(const member of room.notes)send(member,{type:'notes',room:peer.shared.notes,revision:room.revision,document:room.document,by:peer.id});return;
      }
      if(value.type==='voice-join'&&can(session,'voice')){if(!peer.voice)audit(peer,{action:'collaboration.voice-joined',label:'Joined a voice session'});peer.voice=true;announce();return;}
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
        const stroke={type:'stroke',id:randomBytes(8).toString('hex'),color:value.color,width:value.width,points:value.points.map(({x,y})=>({x,y}))};room.strokes.push(stroke);room.points+=stroke.points.length;audit(peer,{id:'stroke:'+stroke.id,action:'collaboration.drawing',label:'Drew on the shared whiteboard',payload:{points:stroke.points.length,color:stroke.color,width:stroke.width}});
        let trimmed=false;while(room.strokes.length>300||room.points>15000){room.points-=room.strokes.shift().points.length;trimmed=true;}
        for(const member of room.members)send(member,trimmed?{type:'board',strokes:room.strokes}:stroke);return;
      }
      if(value.type==='board-clear'&&room?.members.has(peer)){audit(peer,{action:'collaboration.board-cleared',label:'Cleared the shared whiteboard'});room.strokes=[];room.points=0;for(const member of room.members)send(member,{type:'board',strokes:[]});}
    });
    ws.on('close',()=>{drop(peer);expiry();clearInterval(heartbeat);});
  });}
  function revoke(token){for(const peer of [...peers])if(!token||peer.token===token){if(!peer.owner)endSharedRoom(peer.roomId);drop(peer);peer.ws.close(1001,'Session ended');const timeout=setTimeout(()=>peer.ws.terminate(),300);timeout.unref();}}
  return {upgrade,revoke,close(){revoke();rooms.clear();sharedRooms.clear();wss.close();}};
}
module.exports={createCollaboration,validStroke,validNotes};
