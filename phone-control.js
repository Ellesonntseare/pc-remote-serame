'use strict';
const {randomBytes}=require('node:crypto');
function command(value){
  if(!value||!['tap','longpress','swipe','back','home','recents','text','pointer','hide-pointer','touch-start','touch-move','touch-end','touch-cancel','insert','key'].includes(value.action))return null;
  const result={action:value.action};
  if(['tap','longpress','swipe','pointer','touch-start','touch-move','touch-end'].includes(value.action)){
    const count=value.action==='swipe'?2:1;
    if(!Array.isArray(value.points)||value.points.length!==count||!value.points.every(p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&p.x>=0&&p.x<=1&&p.y>=0&&p.y<=1))return null;
    result.points=value.points.map(({x,y})=>({x,y}));
    if(value.action==='swipe'){if(!Number.isInteger(value.duration)||value.duration<100||value.duration>1500)return null;result.duration=value.duration;}
  }
  if(value.action==='text'){if(typeof value.text!=='string'||value.text.length>2000||value.text.includes('\0'))return null;result.text=value.text;}
  if(value.action==='insert'){if(typeof value.text!=='string'||!value.text||value.text.length>256||value.text.includes('\0'))return null;result.text=value.text;}
  if(value.action==='key'){if(!['Enter','Backspace','Delete','Tab','ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End','PageUp','PageDown','a','c','x','v','z','y'].includes(value.key)||!Number.isInteger(value.modifiers)||value.modifiers<0||value.modifiers>7)return null;result.key=value.key;result.modifiers=value.modifiers;}
  return result;
}
function createPhoneControl({send,peers,sharing,openHandoff}){
  let desktop=null;
  function stopDesktop(target){if(!desktop||target&&desktop.target!==target)return;const previous=desktop;desktop=null;previous.session?.stop();send(previous.controller,{type:'desktop-state',state:'off'});}
  function state(target,viewer){return {type:'control-state',state:target.control?.controller?'active':target.control?.requester?'pending':'off',supported:!!target.controlSupported,mouseSupported:!!target.mouseSupported,advancedInput:!!target.advancedInput,desktopAvailable:!!openHandoff,canControl:target.control?.controller===viewer,...(target.control?.controller===viewer?{id:target.control.id,expiresIn:Math.max(1,(target.control.until||Date.now()+600000)-Date.now()),...target.control.resumeProof&&{resumeProof:target.control.resumeProof}}:{}),generation:target.capture?.generation||0};}
  function notify(target){for(const viewer of peers)if(viewer.owner&&viewer.watching===target.id)send(viewer,state(target,viewer));}
  function end(target,message='Phone control ended.',reconnect=false){
    stopDesktop(target);
    if(!target?.control)return;
    clearTimeout(target.control.timer);clearTimeout(target.control.commandTimer);target.control=null;
    send(target,{type:'control-state',state:'off',message,reconnect});notify(target);
  }
  function detach(peer,reconnect=false){for(const target of peers)if(target===peer||target.control?.controller===peer||target.control?.requester===peer)end(target,reconnect?'Connection interrupted. Reconnecting…':'Phone control ended.',reconnect);}
  function handle(peer,body){
    if(body.type==='capture'&&peer.publisher&&peer.sharing){
      if(!Number.isSafeInteger(body.generation)||body.generation<1||body.generation>1000000||!Number.isInteger(body.width)||!Number.isInteger(body.height)||body.width<2||body.height<2||body.width>16384||body.height>16384||body.generation<=(peer.capture?.generation||0))return true;
      peer.capture={generation:body.generation,width:body.width,height:body.height};peer.frame=null;
      if(desktop?.target===peer)try{desktop.session.update({...desktop.settings,width:body.width,height:body.height});}catch{stopDesktop(peer);}
      for(const viewer of peers)if(viewer.owner&&viewer.watching===peer.id)send(viewer,{type:'capture',...peer.capture});return true;
    }
    if(body.type==='control-request'&&peer.owner&&!peer.publisher){
      const target=sharing(peer.watching);
      if(!target?.controlSupported||!target.capture||!target.frame){send(peer,{type:'control-state',state:'off',supported:!!target?.controlSupported,message:'Wait for a live phone screen.'});return true;}
      if(target.control){send(peer,state(target,peer));return true;}
      const resumeProof=typeof body.resumeProof==='string'&&/^[a-f0-9]{32}$/.test(body.resumeProof)?body.resumeProof:'';
      const clientKey=typeof body.clientKey==='string'&&/^[a-f0-9]{32}$/.test(body.clientKey)?body.clientKey:'';
      if(Date.now()-(target.requestAt||0)<(resumeProof?500:15000)){send(peer,{...state(target,peer),message:'Wait briefly before requesting again.'});return true;}
      target.requestAt=Date.now();const id=randomBytes(16).toString('hex');
      target.control={id,requester:peer,controller:null,lastSeq:0,pendingSeq:null,timer:setTimeout(()=>end(target,'Control request expired.'),120000)};target.control.timer.unref();
      send(target,{type:'control-request',id,expiresIn:120000,...clientKey&&{clientKey},...resumeProof&&{resumeProof}});notify(target);return true;
    }
    if(body.type==='control-response'&&peer.publisher){
      const grant=peer.control;
      if(!peer.sharing||!grant?.requester||body.id!==grant.id)return true;
      if(body.approved!==true||grant.requester.watching!==peer.id||grant.requester.ws.readyState!==1){end(peer,'Phone control was declined.');return true;}
      clearTimeout(grant.timer);grant.controller=grant.requester;grant.requester=null;
      grant.resumeProof=typeof body.resumeProof==='string'&&/^[a-f0-9]{32}$/.test(body.resumeProof)?body.resumeProof:'';
      const expires=Number.isInteger(body.expiresIn)&&body.expiresIn>0&&body.expiresIn<=600000?body.expiresIn:600000;
      grant.until=Date.now()+expires;
      grant.timer=setTimeout(()=>end(peer,'Phone control expired. Request again to continue.'),expires);grant.timer.unref();
      send(peer,{type:'control-state',state:'active',id:grant.id});notify(peer);return true;
    }
    if(body.type==='control-stop'){
      const target=peer.publisher?peer:peer.owner?sharing(peer.watching):null;
      if(target&&(peer.publisher||target.control?.controller===peer||target.control?.requester===peer))end(target);return true;
    }
    if(body.type==='desktop-start'&&peer.owner&&!peer.publisher){
      const target=sharing(peer.watching),grant=target?.control;
      if(!openHandoff||grant?.controller!==peer||!target.advancedInput||!target.capture||!target.frame){send(peer,{type:'desktop-state',state:'off',message:'Approve control using the latest APK before enabling screen-edge switching.'});return true;}
      const side=body.side,sensitivity=body.sensitivity;
      if(!['left','right','top','bottom'].includes(side)||!Number.isFinite(sensitivity)||sensitivity<.3||sensitivity>3)return true;
      stopDesktop();const current=desktop={target,controller:peer,session:null,settings:{side,sensitivity}};
      try{current.session=openHandoff({side,sensitivity,width:target.capture.width,height:target.capture.height,onEvent:event=>{if(desktop!==current||target.control?.controller!==peer)return;if(event.kind==='state')send(peer,{type:'desktop-state',state:event.state,side});else send(peer,{type:'desktop-input',event});},onError:error=>{if(desktop===current){stopDesktop();send(peer,{type:'desktop-state',state:'off',message:error.message});}},onClose:()=>{if(desktop===current)stopDesktop();}});send(peer,{type:'desktop-state',state:'armed',side});}catch(error){stopDesktop();send(peer,{type:'desktop-state',state:'off',message:error.message});}return true;
    }
    if(body.type==='desktop-stop'&&desktop?.controller===peer){stopDesktop();return true;}
    if(body.type==='desktop-release'&&desktop?.controller===peer){desktop.session?.release();return true;}
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
