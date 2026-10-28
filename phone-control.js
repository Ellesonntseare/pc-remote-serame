'use strict';
const {randomBytes}=require('node:crypto');
function command(value){
  if(!value||!['tap','longpress','swipe','back','home','recents','text','pointer','hide-pointer'].includes(value.action))return null;
  const result={action:value.action};
  if(['tap','longpress','swipe','pointer'].includes(value.action)){
    const count=value.action==='swipe'?2:1;
    if(!Array.isArray(value.points)||value.points.length!==count||!value.points.every(p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&p.x>=0&&p.x<=1&&p.y>=0&&p.y<=1))return null;
    result.points=value.points.map(({x,y})=>({x,y}));
    if(value.action==='swipe'){if(!Number.isInteger(value.duration)||value.duration<100||value.duration>1500)return null;result.duration=value.duration;}
  }
  if(value.action==='text'){if(typeof value.text!=='string'||value.text.length>2000||value.text.includes('\0'))return null;result.text=value.text;}
  return result;
}
function createPhoneControl({send,peers,sharing}){
  function state(target,viewer){return {type:'control-state',state:target.control?.controller?'active':target.control?.requester?'pending':'off',supported:!!target.controlSupported,mouseSupported:!!target.mouseSupported,canControl:target.control?.controller===viewer,...(target.control?.controller===viewer?{id:target.control.id}:{}),generation:target.capture?.generation||0};}
  function notify(target){for(const viewer of peers)if(viewer.owner&&viewer.watching===target.id)send(viewer,state(target,viewer));}
  function end(target,message='Phone control ended.'){
    if(!target?.control)return;
    clearTimeout(target.control.timer);clearTimeout(target.control.commandTimer);target.control=null;
    send(target,{type:'control-state',state:'off',message});notify(target);
  }
  function detach(peer){for(const target of peers)if(target===peer||target.control?.controller===peer||target.control?.requester===peer)end(target);}
  function handle(peer,body){
    if(body.type==='capture'&&peer.publisher&&peer.sharing){
      if(!Number.isSafeInteger(body.generation)||body.generation<1||body.generation>1000000||!Number.isInteger(body.width)||!Number.isInteger(body.height)||body.width<2||body.height<2||body.width>16384||body.height>16384||body.generation<=(peer.capture?.generation||0))return true;
      peer.capture={generation:body.generation,width:body.width,height:body.height};peer.frame=null;
      for(const viewer of peers)if(viewer.owner&&viewer.watching===peer.id)send(viewer,{type:'capture',...peer.capture});return true;
    }
    if(body.type==='control-request'&&peer.owner&&!peer.publisher){
      const target=sharing(peer.watching);
      if(!target?.controlSupported||!target.capture||!target.frame){send(peer,{type:'control-state',state:'off',supported:!!target?.controlSupported,message:'Wait for a live phone screen.'});return true;}
      if(target.control){send(peer,state(target,peer));return true;}
      if(Date.now()-(target.requestAt||0)<15000){send(peer,{...state(target,peer),message:'Wait briefly before requesting again.'});return true;}
      target.requestAt=Date.now();const id=randomBytes(16).toString('hex');
      target.control={id,requester:peer,controller:null,lastSeq:0,pendingSeq:null,timer:setTimeout(()=>end(target,'Control request expired.'),120000)};target.control.timer.unref();
      send(target,{type:'control-request',id,expiresIn:120000});notify(target);return true;
    }
    if(body.type==='control-response'&&peer.publisher){
      const grant=peer.control;
      if(!peer.sharing||!grant?.requester||body.id!==grant.id)return true;
      if(body.approved!==true||grant.requester.watching!==peer.id||grant.requester.ws.readyState!==1){end(peer,'Phone control was declined.');return true;}
      clearTimeout(grant.timer);grant.controller=grant.requester;grant.requester=null;
      grant.timer=setTimeout(()=>end(peer,'Phone control expired. Request again to continue.'),600000);grant.timer.unref();
      send(peer,{type:'control-state',state:'active',id:grant.id});notify(peer);return true;
    }
    if(body.type==='control-stop'){
      const target=peer.publisher?peer:peer.owner?sharing(peer.watching):null;
      if(target&&(peer.publisher||target.control?.controller===peer||target.control?.requester===peer))end(target);return true;
    }
    if((body.type==='control'||body.type==='pointer')&&peer.owner&&!peer.publisher){
      const target=sharing(peer.watching),grant=target?.control,action=command(body.command);
      if(!grant||grant.controller!==peer||body.id!==grant.id||!action||!Number.isSafeInteger(body.seq)||body.seq<=grant.lastSeq||body.seq>1000000||body.generation!==target.capture?.generation||!target.frame){send(peer,{type:'control-result',seq:body.seq,ok:false,message:'Control is unavailable or the phone screen changed.'});return true;}
      if(body.type==='pointer'){
        if(!target.mouseSupported||!['pointer','hide-pointer'].includes(action.action))return true;
        grant.lastSeq=body.seq;send(target,{type:'pointer',id:grant.id,seq:body.seq,generation:body.generation,command:action});return true;
      }
      if(['pointer','hide-pointer'].includes(action.action))return true;
      if(grant.pendingSeq!==null){send(peer,{type:'control-result',seq:body.seq,ok:false,message:'Wait for the previous phone action.'});return true;}
      grant.lastSeq=body.seq;grant.pendingSeq=body.seq;
      grant.commandTimer=setTimeout(()=>end(target,'Phone action timed out. Request control again.'),6000);grant.commandTimer.unref();
      send(target,{type:'control',id:grant.id,seq:body.seq,generation:body.generation,command:action});return true;
    }
    if(body.type==='control-result'&&peer.publisher){
      const grant=peer.control;if(!grant?.controller||body.id!==grant.id||body.seq!==grant.pendingSeq)return true;
      clearTimeout(grant.commandTimer);grant.pendingSeq=null;send(grant.controller,{type:'control-result',seq:body.seq,ok:body.ok===true,message:typeof body.message==='string'?body.message.slice(0,120):''});return true;
    }
    return false;
  }
  return {handle,end,detach,state};
}
module.exports={createPhoneControl,command};
