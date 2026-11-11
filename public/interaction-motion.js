'use strict';

// Visual feedback observes existing interactions; it never sends PC input or delays actions.
(() => {
 function mount(){
  if(window.PCRMotion)return;
  const media=window.matchMedia?.('(prefers-reduced-motion: reduce)'),active=new Set(),presses=new Map(),diagrams=new WeakMap();
  let receipt=null,receiptTimer=null,lastPage=null,nativeSeen=false,nativeStates=new Map(),browserSending=false;
  const reduced=()=>!!media?.matches||window.PCRAppearance?.light===true;
  const enabled=()=>!reduced()&&!document.hidden&&typeof Element.prototype.animate==='function';
  function play(node,frames,options={}){
   if(!node?.isConnected||!enabled())return null;
   try{const animation=node.animate(frames,{duration:240,easing:'cubic-bezier(.2,.8,.2,1)',...options});active.add(animation);animation.finished.then(()=>active.delete(animation),()=>active.delete(animation));return animation;}catch{return null;}
  }
  function control(target){
   const button=target?.closest?.('button,summary,[role="button"]');
   if(!button||button.matches(':disabled,[aria-disabled="true"],[data-remote-key],[data-remote-command],[data-a],#rsZoomIn,#rsZoomOut')||button.closest('[hidden],.hide,[data-pcr-denied="true"]'))return null;
   if(button.closest('#rs')&&!button.closest('.ecNavigation,.ecRemoteRail,.remoteOptionsPanel'))return null;
   return button;
  }
  function position(button){if(getComputedStyle(button).position==='static')button.classList.add('ecMotionStatic');button.classList.add('ecMotionControl');}
  function ink(button,event){
   const rect=button.getBoundingClientRect();if(!rect.width||!rect.height)return null;
   const layer=document.createElement('span'),circle=document.createElement('span'),size=Math.min(260,Math.max(rect.width,rect.height)*1.8);
   layer.className='ecMotionInk';layer.setAttribute('aria-hidden','true');circle.className='ecMotionRipple';
   Object.assign(circle.style,{width:size+'px',height:size+'px',left:(event.clientX-rect.left-size/2)+'px',top:(event.clientY-rect.top-size/2)+'px'});layer.append(circle);button.append(layer);
   const animation=play(circle,[{transform:'scale(.04)',opacity:.24},{transform:'scale(1)',opacity:0}],{duration:460,easing:'cubic-bezier(.1,.7,.2,1)'});
   if(animation)animation.finished.then(()=>layer.remove(),()=>layer.remove());else layer.remove();
   return {layer,animation};
  }
  function release(id,cancel=false){
   const press=presses.get(id);if(!press)return;presses.delete(id);press.button.classList.remove('ecMotionPressed');
   if(cancel){press.ink?.animation?.cancel();press.ink?.layer.remove();}
   else play(press.button,[{scale:'.95'},{scale:'1.025',offset:.65},{scale:'1'}],{duration:280});
  }
  function clearPresses(){for(const id of presses.keys())release(id,true);}
  function clearAnimations(){for(const animation of active)animation.cancel();active.clear();}
  function clearReceipt(){clearTimeout(receiptTimer);receiptTimer=null;receipt?.remove();receipt=null;}
  function stop(){clearPresses();clearAnimations();clearReceipt();}
  function preference(){document.documentElement.dataset.motion=reduced()?'reduce':'full';if(reduced())stop();}
  document.addEventListener('pointerdown',event=>{
   if(event.button!==0||event.isPrimary===false||!enabled())return;
   const button=control(event.target);if(!button)return;clearPresses();position(button);button.classList.add('ecMotionPressed');
   presses.set(event.pointerId,{button,x:event.clientX,y:event.clientY,ink:ink(button,event)});
  },{capture:true,passive:true});
  document.addEventListener('pointermove',event=>{const press=presses.get(event.pointerId);if(press&&Math.hypot(event.clientX-press.x,event.clientY-press.y)>10)release(event.pointerId,true);},{capture:true,passive:true});
  document.addEventListener('pointerup',event=>release(event.pointerId),{capture:true,passive:true});
  for(const name of ['pointercancel','lostpointercapture'])document.addEventListener(name,event=>release(event.pointerId,true),{capture:true,passive:true});
  document.addEventListener('click',event=>{if(event.detail!==0||!enabled())return;const button=control(event.target);if(button)play(button,[{scale:'.97'},{scale:'1'}]);},true);
  function enter(id){
   if(id===lastPage)return;lastPage=id;stop();if(!enabled())return;
   const root=document.getElementById(id==='home'?'ecHome':id);
   if(root&&id!=='rs'){
    const panels=[...root.children].filter(node=>!node.matches('header,nav,script,style,dialog,.secondScreenStage,[hidden]')&&!node.querySelector('canvas,video,iframe')&&!node.classList.contains('hide')).slice(0,5);
    panels.forEach((node,index)=>play(node,[{opacity:.12,translate:'0 18px'},{opacity:1,translate:'0 0'}],{duration:330,delay:index*28,fill:'backwards'}));
   }
   if(id==='filesDialog')paintFiles(true);
   const icon=document.querySelector('.ecNavigation button[aria-current="page"] svg');
   play(icon,[{scale:'.88'},{scale:'1.12',offset:.6},{scale:'1'}],{duration:300});
  }
  window.addEventListener('pcr:page',event=>enter(event.detail?.id||'home'));
  let filePath=null,fileRects=new Map(),fileSelection=new Set();const fileEffects=new Set();
  const filesPage=document.getElementById('filesDialog'),fileGrid=filesPage?.querySelector('[data-entries]');
  const filesShown=()=>!!filesPage?.open&&filesPage.dataset.pcrParked!=='true'&&!filesPage.querySelector('[data-pc-files]')?.hidden;
  const fileRows=()=>[...(fileGrid?.querySelectorAll('.fmFile:not([hidden])')||[])].slice(0,40);
  function filePlay(node,frames,options){const animation=play(node,frames,options);if(animation){fileEffects.add(animation);animation.finished.then(()=>fileEffects.delete(animation),()=>fileEffects.delete(animation));}}
  function beforeFiles(){for(const effect of fileEffects)effect.cancel();fileEffects.clear();fileRects=new Map(fileRows().map(row=>[row.dataset.file,row.getBoundingClientRect()]));}
  function paintFiles(force=false){
   const state=window.PCRFileManager?.state||{},next=state.path||'',changed=filePath!==next,old=filePath||'';filePath=next;
   if(!filesShown()||!enabled())return;
   const bounds=(document.getElementById('explorerContent')||fileGrid)?.getBoundingClientRect(),rows=fileRows().filter(row=>{const rect=row.getBoundingClientRect();return !bounds?.height||rect.bottom>=bounds.top&&rect.top<=bounds.bottom;}).slice(0,18);
   for(const [index,row]of rows.entries()){
    const previous=fileRects.get(row.dataset.file),rect=row.getBoundingClientRect(),newRow=!previous,dx=changed?(next.length<old.length?-30:30):previous?previous.left-rect.left:0,dy=changed||newRow?12:previous?previous.top-rect.top:0;
    if(force||changed||newRow)filePlay(row,[{opacity:.08,transform:'translate3d('+dx+'px,'+dy+'px,0) scale(.985)'},{opacity:1,transform:'translate3d(0,0,0) scale(1)'}],{duration:340,delay:index*18,fill:'backwards'});
    else if(Math.abs(dx)+Math.abs(dy)>1)filePlay(row,[{transform:'translate('+dx+'px,'+dy+'px)'},{transform:'translate(0,0)'}],{duration:280});
   }
   fileRects=new Map(fileRows().map(row=>[row.dataset.file,row.getBoundingClientRect()]));
  }
  window.addEventListener('pcr:files-before-render',beforeFiles);window.addEventListener('pcr:files-render',()=>paintFiles());
  window.addEventListener('pcr:files-state',event=>{const selected=new Set(event.detail?.selection||[]);if(filesShown()&&enabled())for(const row of fileRows().filter(row=>selected.has(row.dataset.file)&&!fileSelection.has(row.dataset.file)).slice(0,12))filePlay(row.querySelector('.fmFileIcon'),[{transform:'scale(.8) rotate(-5deg)'},{transform:'scale(1.18) rotate(2deg)',offset:.65},{transform:'scale(1) rotate(0deg)'}],{duration:300});fileSelection=selected;});
  if(fileGrid)new MutationObserver(()=>{filesPage.classList.toggle('ecFilesLoading',fileGrid.getAttribute('aria-busy')==='true');}).observe(fileGrid,{attributes:true,attributeFilter:['aria-busy']});
  for(const panel of filesPage?.querySelectorAll('.explorerContextMenu,.explorerProperties,.explorerMore,.explorerViewPopup')||[])new MutationObserver(()=>{if(panel.hidden||panel.tagName==='DETAILS'&&!panel.open||!filesShown())return;const content=panel.tagName==='DETAILS'?panel.querySelector('div'):panel;play(content,[{opacity:0,translate:'0 -10px',scale:'.96'},{opacity:1,translate:'0 0',scale:'1'}],{duration:240});}).observe(panel,{attributes:true,attributeFilter:panel.tagName==='DETAILS'?['open']:['hidden']});
  window.addEventListener('pcr:settings-category',event=>{const group=document.querySelector('#workspaceSettings [data-settings-section="'+String(event.detail?.section||'').replace(/[^a-z]/g,'')+'"] .settingsGroupContent');if(group)for(const [index,node]of [...group.children].filter(node=>!node.hidden).slice(0,6).entries())play(node,[{opacity:.1,translate:'18px 8px'},{opacity:1,translate:'0 0'}],{duration:320,delay:index*24,fill:'backwards'});});
  function placement(diagram){
   const selected=diagram.querySelector('button[aria-pressed="true"]'),icon=selected?.querySelector('.secondScreenPhone');if(!selected||!icon)return;
   const side=selected.dataset.placement,orientation=diagram.dataset.orientation,previous=diagrams.get(diagram);
   diagrams.set(diagram,{side,orientation,icon,animation:previous?.animation});
   if(!previous||previous.side===side&&previous.orientation===orientation)return;
   const before=previous.icon.getBoundingClientRect(),after=icon.getBoundingClientRect();previous.animation?.cancel();
   const animation=play(icon,[{transform:'translate('+(before.left+before.width/2-after.left-after.width/2)+'px,'+(before.top+before.height/2-after.top-after.height/2)+'px) scale(.88)'},{transform:'translate(0,0) scale(1.12)',offset:.75},{transform:'translate(0,0) scale(1)'}],{duration:360,easing:'cubic-bezier(.2,.8,.2,1)'});
   diagrams.set(diagram,{side,orientation,icon,animation});
  }
  for(const diagram of document.querySelectorAll('.secondScreenDiagram')){placement(diagram);new MutationObserver(()=>placement(diagram)).observe(diagram,{attributes:true,subtree:true,attributeFilter:['aria-pressed','data-orientation']});}
  const choices=document.getElementById('ecRailChoices');
  if(choices)new MutationObserver(()=>{if(!choices.hidden&&enabled())for(const [index,button]of [...choices.children].entries())play(button,[{opacity:0,translate:'0 -6px',scale:'.9'},{opacity:1,translate:'0 0',scale:'1'}],{duration:190,delay:index*24,fill:'backwards'});}).observe(choices,{attributes:true,attributeFilter:['hidden']});
  function complete(message){
   if(!window.PCRAuth?.signedIn||document.hidden)return;clearReceipt();
   receipt=document.createElement('div');receipt.className='ecMotionReceipt';receipt.setAttribute('role','status');receipt.innerHTML='<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="m7 12 3 3 7-7"/></svg><span></span>';receipt.querySelector('span').textContent=message;
   const page=window.PCRPages?.current,host=page&&document.getElementById(page);(host?.tagName==='DIALOG'&&host.open?host:document.body).append(receipt);
   play(receipt,[{opacity:0,translate:'0 10px',scale:'.96'},{opacity:1,translate:'0 0',scale:'1'}],{duration:260});
   for(const icon of document.querySelectorAll('[data-ec-go="files"] svg,.filesHome .dashboardTileIcon svg'))play(icon,[{scale:'1'},{scale:'1.18',offset:.55},{scale:'1'}],{duration:350});
   receiptTimer=setTimeout(()=>{const node=receipt;if(!node)return;const animation=play(node,[{opacity:1},{opacity:0}],{duration:180});if(animation)animation.finished.then(()=>{node.remove();if(receipt===node)receipt=null;},()=>node.remove());else clearReceipt();},2400);
  }
  window.addEventListener('pcr:transfer-queue',event=>{
   if(event.detail?.origin!==location.origin||!Array.isArray(event.detail.tasks))return;
   const rows=event.detail.tasks,newlyComplete=rows.filter(row=>row.state==='complete'&&nativeStates.has(row.id)&&nativeStates.get(row.id)!=='complete');
   nativeStates=new Map(rows.slice(-200).map(row=>[row.id,row.state]));
   if(nativeSeen&&newlyComplete.length)complete(newlyComplete.length>1?newlyComplete.length+' files transferred':newlyComplete[0].direction==='download'?'File saved on your phone':'File saved on your PC');nativeSeen=true;
  });
  window.addEventListener('pcr:upload-progress',event=>{const state=event.detail?.state;if(state==='complete'&&browserSending)complete('Files saved on your PC');browserSending=['preparing','sending','running'].includes(state);});
  window.addEventListener('pcr:auth',()=>{stop();nativeSeen=false;nativeStates.clear();browserSending=false;lastPage=null;filePath=null;fileRects.clear();fileSelection.clear();fileEffects.clear();});
  window.addEventListener('blur',clearPresses);window.addEventListener('pagehide',stop);document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();});
  window.addEventListener('pcr:appearance',preference);media?.addEventListener?.('change',preference);preference();
  window.PCRMotion={get reduced(){return reduced();},stop};
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
})();
