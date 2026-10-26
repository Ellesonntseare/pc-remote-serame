'use strict';
(()=>{
  if(typeof window.qc!=='function')return;
  const held=new Set(),pointers=new Set(),original=window.qc;let resetting=false;
  const controlled=node=>node?.closest?.('#rsv,#remoteSwipePad,#remoteScrollRail');
  async function sendRelease(commands){
    if(!commands.length||!rs.on)return;
    // Button-up must not wait behind an IME edit/acknowledgement or stale motion.
    if(!window.PCRInputTransport?.isOpen){const end=Date.now()+2000;while(typeof qb!=='undefined'&&qb&&Date.now()<end)await new Promise(r=>setTimeout(r,10));}
    try{if(window.PCRInputTransport?.sendInput)await window.PCRInputTransport.sendInput(commands,{wait:false});else await api('/api/input',{method:'POST',body:JSON.stringify({cmds:commands})});}catch{window.PCRInputTransport?.stop();}
  }
  function release(){
    if(resetting)return Promise.resolve();resetting=true;const commands=[...held].map(side=>'up '+side);held.clear();pointers.clear();
    if(typeof qq!=='undefined')qq=qq.filter(c=>!/^down [lrm]$|^up [lrm]$/.test(c));
    if(typeof g!=='undefined'&&g){clearTimeout(g.lp);g=null;}if(typeof mouseDrag!=='undefined')mouseDrag=false;
    window.PCRSwipeDock?.release();resetting=false;return sendRelease(commands);
  }
  window.qc=function(command){const down=/^down ([lrm])$/.exec(command),up=/^up ([lrm])$/.exec(command);
    if(resetting&&up)return;
    if(down)held.add(down[1]);
    if(up&&held.delete(up[1])){if(typeof qq!=='undefined')qq=qq.filter(c=>c!=='down '+up[1]&&c!==command);void sendRelease([command]);return;}
    if(/^click [lrm]$/.test(command)&&held.size){void release().then(()=>original(command));return;}
    return original(command);
  };
  window.addEventListener('pointerdown',event=>{if(controlled(event.target))pointers.add(event.pointerId);},true);
  document.addEventListener('pointerdown',event=>{if(event.target.closest?.('#choosePCField'))void release();},true);
  const keyboard=window.rsKb;if(typeof keyboard==='function')window.rsKb=function(...args){void release();return keyboard.apply(this,args);};
  for(const name of ['pointerup','pointercancel','lostpointercapture'])window.addEventListener(name,event=>{if(pointers.delete(event.pointerId))queueMicrotask(()=>{if(!pointers.size&&held.size)void release();});},true);
  window.addEventListener('blur',()=>void release());window.addEventListener('pagehide',()=>void release());document.addEventListener('visibilitychange',()=>{if(document.hidden)void release();});window.addEventListener('pcr:page',event=>{if(event.detail?.id!=='rs')void release();});
  for(const name of ['selectstart','dragstart','contextmenu'])document.addEventListener(name,event=>{if(controlled(event.target))event.preventDefault();});
  window.PCRPointerSafety={release,get holding(){return held.size>0;}};
})();
