'use strict';
(()=>{
 function mount(){
  const screen=document.getElementById('rs'),view=document.getElementById('rsv'),panel=document.getElementById('typePanel'),input=document.getElementById('typeText');
  if(!screen||!view||!panel||!input||window.PCRTypingControls)return;
  screen.classList.add('directTyping');
  input.setAttribute('aria-label','Type directly on your PC');
  for(const child of panel.children)if(child!==input)child.hidden=true;
  let serial=0,checking=false,pointerCheck=null,dispatchingTap=false,lastField=null,phoneSelection=null;
  const badge=document.createElement('span');badge.id='remoteTypingState';badge.className='remoteTypingState';badge.setAttribute('role','status');document.querySelector('.screenConnectionGroup')?.append(badge);
  const permitted=()=> (!window.PCRCanAccess||window.PCRCanAccess('control'))&&(!window.PCRHoldControl||window.PCRHoldControl.can('pc'));
  const connected=()=>rs.on&&!!rs.m&&!screen.classList.contains('hide');
  const open=()=>!panel.classList.contains('hide')&&!input.readOnly;
  function updateState(){const active=open()&&connected()&&permitted()&&!live.paused;badge.dataset.state=checking?'waiting':active?'active':'paused';badge.textContent=checking?'Checking field':active?'Typing on PC':'';badge.hidden=!checking&&!active;}
  function focusKeyboard(){if(!open())return;input.focus({preventScroll:true});window.PCRDeviceInput?.focusKeyboard?.(input);updateState();}
  function coordinates(point){const box=window.PCRScreenTools?.imageBox?.()||window.box?.();if(!box||![box.x,box.y,box.w,box.h].every(Number.isFinite)||box.w<=0||box.h<=0||point.x<box.x||point.x>box.x+box.w||point.y<box.y||point.y>box.y+box.h)return null;return{x:Math.round((point.x-box.x)/box.w*(rs.m.w-1)),y:Math.round((point.y-box.y)/box.h*(rs.m.h-1))};}
  function cancelTap(){clearTimeout(pointerCheck);pointerCheck=null;serial++;checking=false;updateState();}
  function saveDraft(text){if(text&&text!==live.sent)window.PCRAccountWorkspace?.set('drafts.compose',text);}
  function beginTyping(result,position,resuming){
   if(!resuming){saveDraft(input.value);rsResetTypingContext(false);}
   liveTyping=true;live.paused=false;
   if(/^[a-f0-9]{32}$/.test(result.fieldId||''))lastField={id:result.fieldId,bounds:result.fieldBounds};
   window.rsKb();if(position)window.PCRScreenTools?.focusPoint?.(position);else if(result.fieldBounds){const b=result.fieldBounds;window.PCRScreenTools?.focusPoint?.({x:b.x+b.width/2,y:b.y+b.height/2});}
   rsTypeStatus('Typing on PC');updateState();
  }
  async function tap(point,alreadyClicked=false){
   if(!permitted()||!connected())return false;const position=point?coordinates(point):null;if(point&&!position)return false;
   if(typeBusy||composing||rsTypingDirty())return false;
   const metadata=rs.m,current=++serial,command=position?'focus '+position.x+' '+position.y:'focuscurrent';
   checking=true;updateState();
   // Reopening the same field preserves the phone IME baseline and selection.
   if(!open()&&lastField&&liveTyping&&input.value&&input.value===live.sent){
    try{const focused=await typingRequest([command]);if(current!==serial||!connected()||rs.m!==metadata)return false;if(permitted()&&focused?.editable===true&&focused.fieldId===lastField.id){checking=false;beginTyping(focused,position,true);return true;}}catch{if(current===serial){checking=false;updateState();}return false;}
   }
   window.PCRPointerSafety?.release?.();
   if(!alreadyClicked&&position){dispatchingTap=true;try{qc('abs '+position.x+' '+position.y);qc('click l');}finally{dispatchingTap=false;}}
   await new Promise(resolve=>setTimeout(resolve,120));
   const deadline=performance.now()+4500;
   while(current===serial&&connected()&&!document.hidden&&(qb||qq.length)&&performance.now()<deadline)await new Promise(resolve=>setTimeout(resolve,16));
   if(current!==serial||!connected()||document.hidden)return false;
   if(qb||qq.length){checking=false;updateState();return false;}
   let result;
   try{for(let attempt=0;attempt<4;attempt++){result=await typingRequest([command]);if(typeof result?.editable==='boolean'||current!==serial||!connected()||document.hidden)break;await new Promise(resolve=>setTimeout(resolve,150));}}
   catch{if(current===serial){checking=false;updateState();}return false;}
   if(current!==serial)return false;checking=false;
   if(!result||!connected()||rs.m!==metadata||!permitted()){updateState();return false;}
   if(result.editable===true)beginTyping(result,position,false);else updateState();return true;
  }
  function afterPointer(command){if(dispatchingTap||!['click l','up l','dbl'].includes(command))return;
   // Hardware typing stays on the remote canvas. Do not steal its focus for
   // the hidden phone editor after every desktop click.
   if(window.matchMedia?.('(any-pointer: fine)').matches){document.getElementById('rsc')?.focus({preventScroll:true});return;}
   clearTimeout(pointerCheck);pointerCheck=setTimeout(()=>{pointerCheck=null;void tap(null,true);},100);}
  const nativeKb=window.rsKb,nativeClose=window.rsTypeClose;
  if(typeof nativeClose==='function')window.rsTypeClose=function(...args){if(open())phoneSelection={value:input.value,start:input.selectionStart,end:input.selectionEnd,direction:input.selectionDirection};return nativeClose.apply(this,args);};
  if(typeof nativeKb==='function')window.rsKb=function(...args){if(!permitted())return;liveTyping=true;const result=nativeKb.apply(this,args);focusKeyboard();if(phoneSelection?.value===input.value)input.setSelectionRange(phoneSelection.start,phoneSelection.end,phoneSelection.direction);return result;};
  input.addEventListener('beforeinput',cancelTap);input.addEventListener('compositionstart',cancelTap);
  window.addEventListener('pcr:typing-reset',()=>{lastField=null;phoneSelection=null;});
  window.addEventListener('pcr:page',event=>{if(event.detail?.id!=='rs')cancelTap();});
  window.addEventListener('pcr:auth',()=>{cancelTap();if(!window.PCRAuth?.signedIn){lastField=null;phoneSelection=null;}});window.addEventListener('pcr:hold-release',cancelTap);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)cancelTap();});
  new MutationObserver(updateState).observe(panel,{attributes:true,attributeFilter:['class']});
  window.PCRTypingControls={tap,afterPointer,updateState,get choosing(){return false;}};updateState();
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
})();

