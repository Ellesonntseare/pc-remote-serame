'use strict';
(() => {
  const screen=document.getElementById('rs');
  const view=document.getElementById('rsv');
  const desktop=document.getElementById('rsc');
  const bar=screen?.querySelector('.rsbot');
  if(!screen||!view||!desktop||!bar)return;

  function element(tag,className,text){
    const node=document.createElement(tag);
    if(className)node.className=className;
    if(text)node.textContent=text;
    return node;
  }
  function button(className,label,text){
    const node=element('button',className,text);node.type='button';
    node.setAttribute('aria-label',label);node.title=label;
    return node;
  }
  const toggle=button('precisionLensToggle','Show precision lens','Lens');
  toggle.id='rsLens';toggle.setAttribute('aria-pressed','false');
  toggle.setAttribute('aria-controls','precisionLens');toggle.disabled=true;
  toggle.insertAdjacentHTML('afterbegin','<svg width="15" height="15" viewBox="0 0 20 20" aria-hidden="true" focusable="false"><circle cx="8.5" cy="8.5" r="5.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="m12.5 12.5 4.5 4.5M8.5 5.5v6M5.5 8.5h6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>');
  bar.append(toggle);

  const panel=element('section','precisionLens');panel.id='precisionLens';panel.hidden=true;
  panel.setAttribute('aria-label','Precision lens');
  const header=element('div','precisionLensHeader');
  const title=element('span','precisionLensTitle','Precision');
  const fineButton=button('precisionLensFine','Slow trackpad movement','Fine');
  fineButton.setAttribute('aria-pressed','true');
  const close=button('precisionLensClose','Close precision lens','×');
  header.append(title,fineButton,close);
  const previewBox=element('div','precisionLensPreview');
  const previewCanvas=element('canvas','precisionLensCanvas');
  previewCanvas.setAttribute('aria-hidden','true');
  const crosshair=element('div','precisionLensCrosshair');crosshair.setAttribute('aria-hidden','true');
  const waiting=element('span','precisionLensWaiting','Move the pointer');
  previewBox.append(previewCanvas,crosshair,waiting);
  const controls=element('div','precisionLensNudges');
  controls.setAttribute('role','group');controls.setAttribute('aria-label','Fine pointer controls');
  const nudgeButtons=[];
  for(const [text,label,dx,dy] of [['←','Move pointer left',-1,0],['↑','Move pointer up',0,-1],['●','Click at pointer',0,0],['↓','Move pointer down',0,1],['→','Move pointer right',1,0]]){
    const node=button(dx||dy?'precisionLensNudge':'precisionLensClick',label,text);
    node.addEventListener('click',()=>{
      if(!usable()||!pointer?.visible||!active)return;
      if(typeof rsCanPoint==='function'&&!rsCanPoint())return;
      if(dx||dy){
        const m=metadata();
        const moveX=clamp(pointer.x+dx,0,m.w-1)-pointer.x;
        const moveY=clamp(pointer.y+dy,0,m.h-1)-pointer.y;
        if(moveX||moveY)qc('mv '+moveX+' '+moveY);
      }else qc('click l');
    });
    controls.append(node);nudgeButtons.push(node);
  }
  // A sibling of the gesture surface keeps Pan's capture handlers from
  // swallowing these controls. The preview itself remains click-through.
  panel.append(header,previewBox,controls);screen.append(panel);
  const context=previewCanvas.getContext('2d');
  let active=false,fine=true,source=null,dimensions='',haveFrame=false,pointer=null;
  let pending=0,lastPreview=-Infinity;
  const magnification=2.75;
  const clamp=(number,min,max)=>Math.max(min,Math.min(max,number));

  function metadata(){
    if(!rs.on||!rs.m||!Number.isFinite(rs.m.w)||!Number.isFinite(rs.m.h)||rs.m.w<1||rs.m.h<1)return null;
    return rs.m;
  }
  function clean(){return screen.classList.contains('screenClean');}
  function usable(){return haveFrame&&!!metadata()&&source===rs.ab&&dimensions===rs.m.w+'x'+rs.m.h;}
  function clearPixels(){
    context?.clearRect(0,0,previewCanvas.width,previewCanvas.height);
    crosshair.hidden=true;waiting.hidden=false;
  }
  function clearData(){
    haveFrame=false;pointer=null;lastPreview=-Infinity;
    if(pending)cancelAnimationFrame(pending);pending=0;clearPixels();
  }
  function syncSource(){
    const m=metadata();if(!m)return null;
    const next=m.w+'x'+m.h;
    if(source!==rs.ab||dimensions!==next){clearData();source=rs.ab;dimensions=next;}
    return m;
  }
  function updateUI(){
    const available=usable();
    toggle.disabled=!available;
    toggle.setAttribute('aria-pressed',String(active));
    toggle.setAttribute('aria-label',active?'Hide precision lens':'Show precision lens');
    toggle.title=active?'Hide precision lens':'Show precision lens';
    fineButton.setAttribute('aria-pressed',String(fine));
    panel.hidden=!active||!available||clean();
    for(const node of nudgeButtons)node.disabled=!available||!active||!pointer?.visible;
  }
  function schedule(){
    updateUI();
    if(!panel.hidden&&!pending)pending=requestAnimationFrame(render);
  }
  function positionPanel(){
    const box=view.getBoundingClientRect();
    const width=Math.max(120,Math.min(224,box.width-16));
    panel.style.width=width+'px';
    panel.style.left=Math.max(8,box.left+box.width-width-8)+'px';
    panel.style.top=Math.max(8,box.top+8)+'px';
  }
  function render(){
    pending=0;updateUI();if(panel.hidden)return;
    positionPanel();
    if(!context||!pointer?.visible){clearPixels();return;}
    const m=metadata(),box=desktop.getBoundingClientRect();
    if(!m||!desktop.width||!desktop.height||box.width<=0||box.height<=0){clearPixels();return;}
    const width=previewBox.clientWidth||208,height=previewBox.clientHeight||112;
    const dpr=clamp(Number(window.devicePixelRatio)||1,1,4);
    const bitmapW=Math.max(1,Math.round(width*dpr)),bitmapH=Math.max(1,Math.round(height*dpr));
    if(previewCanvas.width!==bitmapW)previewCanvas.width=bitmapW;
    if(previewCanvas.height!==bitmapH)previewCanvas.height=bitmapH;
    // Crop the already rendered frame. Its bitmap can be smaller than the PC
    // desktop, and its CSS size changes with zoom, orientation and full screen.
    const cropW=Math.min(desktop.width,width/magnification*desktop.width/box.width);
    const cropH=Math.min(desktop.height,height/magnification*desktop.height/box.height);
    const pixelX=m.w===1?0:pointer.x/(m.w-1)*(desktop.width-1);
    const pixelY=m.h===1?0:pointer.y/(m.h-1)*(desktop.height-1);
    const left=clamp(pixelX-cropW/2,0,desktop.width-cropW);
    const top=clamp(pixelY-cropH/2,0,desktop.height-cropH);
    context.imageSmoothingEnabled=false;
    context.clearRect(0,0,bitmapW,bitmapH);
    context.drawImage(desktop,left,top,cropW,cropH,0,0,bitmapW,bitmapH);
    crosshair.style.left=clamp((pixelX-left)/cropW*100,0,100)+'%';
    crosshair.style.top=clamp((pixelY-top)/cropH*100,0,100)+'%';
    crosshair.hidden=false;waiting.hidden=true;
  }
  function report(state){
    const m=syncSource();if(!m||!state||!Number.isFinite(state.x)||!Number.isFinite(state.y))return;
    // Give the same short preview lead as the desktop pointer while the report
    // travels back. Later reports always reconcile the displayed position.
    if(performance.now()-lastPreview>150){
      pointer={x:clamp(state.x,0,m.w-1),y:clamp(state.y,0,m.h-1),visible:state.visible!==false};
    }
    schedule();
  }
  function preview(command){
    const m=syncSource();if(!m||typeof command!=='string')return;
    const [kind,a,b]=command.split(' '),x=Number(a),y=Number(b);
    if(!Number.isFinite(x)||!Number.isFinite(y))return;
    if(kind==='abs')pointer={x:clamp(x,0,m.w-1),y:clamp(y,0,m.h-1),visible:true};
    else if(kind==='mv'&&pointer)pointer={x:clamp(pointer.x+x,0,m.w-1),y:clamp(pointer.y+y,0,m.h-1),visible:true};
    else return;
    lastPreview=performance.now();schedule();
  }
  function frame(){
    if(!syncSource()||!desktop.width||!desktop.height)return;
    haveFrame=true;schedule();
  }
  function reset(){source=null;dimensions='';clearData();updateUI();}
  function closed(){active=false;fine=true;reset();}
  function setActive(value){
    active=!!value&&usable();schedule();
    if(!active&&panel.contains(document.activeElement))toggle.focus({preventScroll:true});
  }
  function scaleMovement(dx,dy){
    const factor=active&&fine&&usable()&&!clean()?0.25:1;
    return {dx:dx*factor,dy:dy*factor};
  }
  toggle.addEventListener('click',()=>setActive(!active));
  close.addEventListener('click',()=>setActive(false));
  fineButton.addEventListener('click',()=>{fine=!fine;updateUI();});
  // The image and crosshair are transparent to gestures. Only the explicit
  // controls own touches, so tapping them never also taps the desktop below.
  for(const name of ['pointerdown','pointermove','pointerup','pointercancel','touchstart','touchmove','touchend','touchcancel','mousedown','mouseup','click','dblclick','contextmenu','wheel']){
    panel.addEventListener(name,event=>{event.stopPropagation();if(name==='contextmenu'||name==='wheel')event.preventDefault();},{passive:false});
  }
  panel.addEventListener('mousedown',event=>event.preventDefault());
  panel.addEventListener('keydown',event=>{
    event.stopPropagation();
    if(event.key==='Escape'){event.preventDefault();setActive(false);}
  });
  view.addEventListener('scroll',schedule,{passive:true});
  window.addEventListener('resize',schedule);
  document.addEventListener('fullscreenchange',schedule);
  window.visualViewport?.addEventListener('resize',schedule);
  window.visualViewport?.addEventListener('scroll',schedule);
  if(typeof ResizeObserver==='function'){
    const observer=new ResizeObserver(schedule);observer.observe(view);observer.observe(desktop);
  }
  if(typeof MutationObserver==='function')new MutationObserver(schedule).observe(screen,{attributes:true,attributeFilter:['class']});
  window.PCRPrecisionLens={frame,report,preview,reset,connecting:reset,disconnected:reset,closed,scaleMovement};
})();
