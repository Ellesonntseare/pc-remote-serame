'use strict';
const {randomBytes}=require('node:crypto'),{WebSocketServer,WebSocket}=require('ws');
function createSecondScreen({sessions,sessionExpiry,native,deviceFor,onFiles=async()=>[],onStop=()=>{}}){
 const wss=new WebSocketServer({noServer:true,maxPayload:4096,perMessageDeflate:false});let active=null,closed=false;
 const send=(peer,value)=>{if(peer.ws.readyState===WebSocket.OPEN&&peer.ws.bufferedAmount<256*1024)peer.ws.send(JSON.stringify(value));};
 function stop(peer){if(!peer||peer.stopped)return;peer.stopped=true;if(active===peer)active=null;clearInterval(peer.ping);peer.expiry?.();peer.helper?.stop();onStop(peer.token);peer.ws.close(1000,'Second screen stopped');}
 function upgrade(req,socket,head,token){wss.handleUpgrade(req,socket,head,ws=>{
  if(closed||active||sessions.get(token)?.role!=='owner'){ws.close(1008,active?'A second-screen session is already active.':'Owner access required.');return;}
  const device=deviceFor(token);if(device?.platform!=='android'){ws.close(1008,'Open Second screen in the Android app.');return;}
  const peer=active={token,device,ws,stopped:false,helper:null,source:null,rateAt:Date.now(),rate:0};
  peer.expiry=sessionExpiry(()=>sessions.get(token)?.until||0,()=>stop(peer));if(peer.stopped)return;peer.alive=true;peer.ping=setInterval(()=>{if(!sessions.get(token)||!peer.alive)stop(peer);else{peer.alive=false;ws.ping();}},5000);peer.ping.unref?.();ws.on('pong',()=>peer.alive=true);ws.on('close',()=>stop(peer));ws.on('error',()=>stop(peer));
  ws.on('message',raw=>{if(peer.stopped)return;if(sessions.get(token)?.role!=='owner')return stop(peer);try{const value=JSON.parse(raw.toString());if(Date.now()-peer.rateAt>1000){peer.rateAt=Date.now();peer.rate=0;}if(++peer.rate>200)throw Error('Input is arriving too quickly.');
   if(value.type==='ping'&&Number.isFinite(value.at)){send(peer,{type:'pong',at:value.at});}
   else if(value.type==='start'&&!peer.helper){
    peer.helper=native.openSecondScreen({width:value.width,height:value.height,side:value.side,alignment:value.alignment,onEvent:event=>{
     if(peer.stopped)return;
     if(event.kind==='ready'){peer.source={id:randomBytes(18).toString('base64url'),monitor:event.monitor};send(peer,{type:'ready',monitorId:peer.source.id,width:event.width,height:event.height,side:event.side});}
     else if(event.kind==='files'){void Promise.resolve().then(()=>onFiles(token,device,event.paths)).then(offers=>{send(peer,{type:'files',offers});send(peer,{type:'status',message:offers.length+' file(s) sent to Android. Check the transfer notification.'});}).catch(error=>send(peer,{type:'status',message:error.message}));}
     else if(event.kind==='input-result')send(peer,{type:'input-result',id:event.id,action:event.action,ok:event.ok,message:event.message});
     else if(event.kind==='pointer')send(peer,{type:'pointer',x:event.x,y:event.y,visible:event.visible});else if(event.kind==='drop-error')send(peer,{type:'status',message:event.message});
    },onError:error=>{send(peer,{type:'error',message:error.message});stop(peer);},onClose:()=>stop(peer)});
   }else if(value.type==='input'&&peer.source&&['text','key'].includes(value.action)){
    if(!Number.isSafeInteger(value.id)||value.id<1||value.action==='text'&&(typeof value.text!=='string'||!value.text.length||value.text.length>1024)||value.action==='key'&&!['Enter','Backspace','Tab'].includes(value.key))throw Error('Invalid second-screen keyboard input.');
    peer.helper.input({action:value.action,id:value.id,...(value.action==='text'?{text:value.text}:{key:value.key})});
   }else if(value.type==='input'&&peer.source){if(!['down','move','up','right','wheel'].includes(value.action)||![value.x,value.y].every(n=>Number.isFinite(n)&&n>=0&&n<=1)||value.action==='wheel'&&(!Number.isInteger(value.delta)||Math.abs(value.delta)>1200))throw Error('Invalid second-screen input.');peer.helper.input({action:value.action,x:value.x,y:value.y,...value.action==='wheel'&&{delta:value.delta}});}
   else if(value.type==='recover'&&peer.source)peer.helper.recover();else if(value.type==='stop')stop(peer);else throw Error('Start the second screen before controlling it.');
  }catch(error){send(peer,{type:'error',message:error.message});stop(peer);}});
 });}
 return {upgrade,source(token,id){if(active?.token!==token||active.stopped||active.source?.id!==id)throw Error('Start Second screen again.');return {monitor:active.source.monitor};},revoke(token){if(active&&(!token||active.token===token))stop(active);},close(){closed=true;stop(active);wss.close();}};
}
module.exports={createSecondScreen};
