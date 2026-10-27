'use strict';
(() => {
  const screen=document.getElementById('rs');const controlTouches=event=>window.PCRHoldControl?.touches(event)||Array.from(event.touches||[]);
  const view=document.getElementById('rsv');
  const canvas=document.getElementById('rsc');
  if(!screen||!view||!canvas)return;
  const toolbar=document.createElement('div');
  toolbar.id='screenTools';toolbar.className='screenTools';
  toolbar.innerHTML='<div class="screenConnectionGroup"><span id="screenConnection" role="status" aria-live="polite" data-state="closed">Screen closed</span><button type="button" id="rsReconnect" aria-label="Reconnect" title="Reconnect">↻</button></div><div class="screenViewGroup"><button type="button" id="rsFullscreen" aria-label="Full screen" title="Full screen">⛶</button><button type="button" id="rsZoomOut" aria-label="Zoom out" title="Zoom out">−</button><button type="button" id="rsZoomReset" aria-label="Reset zoom" title="Reset zoom">100%</button><button type="button" id="rsZoomIn" aria-label="Zoom in" title="Zoom in">+</button><button type="button" id="rsPan" aria-label="Pan view" title="Pan view" aria-pressed="false">✥</button></div>';
  const originalBar=screen.querySelector('.rsbar');originalBar.after(toolbar);
  const headerButtons=Array.from(originalBar.querySelectorAll('button'));
  toolbar.append(...headerButtons);originalBar.classList.add('screenHeaderLegacy');
  headerButtons.at(-1).classList.add('screenClose');headerButtons.at(-1).setAttribute('aria-label','Close remote screen');
  const stage=document.createElement('div');stage.id='screenStage';
  canvas.before(stage);stage.append(canvas);view.classList.add('screenZoomView');
  const status=toolbar.querySelector('#screenConnection');
  const reconnectButton=toolbar.querySelector('#rsReconnect');
  const fullButton=toolbar.querySelector('#rsFullscreen');
  const presentButton=document.createElement('button');presentButton.type='button';presentButton.id='rsPresentation';presentButton.textContent='Present';presentButton.title='Presentation mode';presentButton.setAttribute('aria-label','Presentation mode');screen.querySelector('.rsbot').append(presentButton);
  const restoreButton=document.createElement('button');restoreButton.type='button';restoreButton.id='rsRestoreControls';restoreButton.textContent='Show controls';restoreButton.setAttribute('aria-label','Exit presentation and show controls');screen.append(restoreButton);
  fullButton.title='Show only the remote screen. Escape or a three-finger tap restores the controls.';
  const minus=toolbar.querySelector('#rsZoomOut');
  const plus=toolbar.querySelector('#rsZoomIn');
  const zoomButton=toolbar.querySelector('#rsZoomReset');
  const panButton=toolbar.querySelector('#rsPan');
  let zoom=1,pan=false,gesture=null,watchdog=null,lastRatio=0,reconnecting=false;
  let fullscreenRequest=0,requestedFullscreen=false;
  let typingPoint=null,savedView=null;
  const fullscreenSupported=typeof screen.requestFullscreen==='function'&&document.fullscreenEnabled!==false;

  function announce(text,state){
    if(status.textContent!==text)status.textContent=text;
    status.dataset.state=state;
    reconnectButton.disabled=false;
  }
  function clearWatchdog(){clearTimeout(watchdog);watchdog=null;}
  function startWatchdog(message){
    clearWatchdog();
    watchdog=setTimeout(()=>{if(rs.on){announce(message,'stalled');rsPauseLive('Screen updates stopped. Check the connection, select the PC field again, then tap New field.');}},10000);
  }
  function displayRatio(){return rs.m?.w>0&&rs.m?.h>0?rs.m.w/rs.m.h:(canvas.width/canvas.height||1);}
  function adaptHeight(){screen.classList.toggle('screenVeryShort',screen.clientHeight>0&&screen.clientHeight<=550);}
  function layout(keepCenter=true){
    const w=view.clientWidth,h=view.clientHeight;if(!w||!h)return;
    const oldW=stage.offsetWidth||w,oldH=stage.offsetHeight||h;
    const centerX=(view.scrollLeft+w/2)/oldW,centerY=(view.scrollTop+h/2)/oldH;
    const ratio=displayRatio();lastRatio=ratio;
    const fitW=Math.min(w,h*ratio),fitH=fitW/ratio;
    const imageW=fitW*zoom,imageH=fitH*zoom;
    const stageW=Math.max(w,imageW),stageH=Math.max(h,imageH);
    stage.style.width=stageW+'px';stage.style.height=stageH+'px';
    canvas.style.width=imageW+'px';canvas.style.height=imageH+'px';
    if(keepCenter){view.scrollLeft=centerX*stageW-w/2;view.scrollTop=centerY*stageH-h/2;}
    keepTypingVisible();
  }
  function keepTypingVisible(){
    if(!typingPoint||!screen.classList.contains('typing')||!rs.m)return;
    const image=canvas.getBoundingClientRect(),bounds=view.getBoundingClientRect(),viewport=window.visualViewport;
    const bottom=Math.min(bounds.bottom,viewport?viewport.offsetTop+viewport.height:window.innerHeight)-12,top=bounds.top+12;
    const x=image.left+typingPoint.x/rs.m.w*image.width,y=image.top+typingPoint.y/rs.m.h*image.height;
    if(x<bounds.left+24||x>bounds.right-24)view.scrollLeft+=x-(bounds.left+bounds.width/2);
    if(y<top||y>bottom)view.scrollTop+=y-(top+Math.max(20,bottom-top)*.45);
  }
  function focusPoint(point){if(!point||!Number.isFinite(point.x)||!Number.isFinite(point.y))return;typingPoint={x:point.x,y:point.y};requestAnimationFrame(()=>{if(!screen.classList.contains('typing'))return;const readable=Math.min(3,Math.max(zoom,(rs.m?.w||1280)/Math.max(1,view.clientWidth*1.5)));setZoom(readable,{precise:true});keepTypingVisible();});}
  function panUI(){
    panButton.disabled=zoom===1;
    panButton.title=pan?'Control PC':'Pan view';panButton.setAttribute('aria-label',panButton.title);
    panButton.setAttribute('aria-pressed',String(pan));
    view.classList.toggle('screenPanning',pan);
  }
  function stopGesture(){gesture=null;}
  function setZoom(value,{anchor=null,precise=false}={}){
    const old=anchor?canvas.getBoundingClientRect():null,ux=old?.width?(anchor.x-old.left)/old.width:.5,uy=old?.height?(anchor.y-old.top)/old.height:.5;
    zoom=Math.min(4,Math.max(1,Math.round(value*(precise?100:4))/(precise?100:4)));
    zoomButton.textContent=Math.round(zoom*100)+'%';
    minus.disabled=zoom===1;plus.disabled=zoom===4;
    if(zoom===1){pan=false;stopGesture();}
    layout(!anchor);if(anchor){const current=canvas.getBoundingClientRect();view.scrollLeft+=current.left+ux*current.width-anchor.x;view.scrollTop+=current.top+uy*current.height-anchor.y;}panUI();
  }
  function imageBox(){
    const rect=canvas.getBoundingClientRect();
    return {x:rect.left,y:rect.top,w:rect.width,h:rect.height};
  }
  function connecting(){
    announce('Connecting…','connecting');
    reconnectButton.disabled=true;
    startWatchdog('Connection is taking longer. Try Reconnect.');
    requestAnimationFrame(()=>{layout(false);if(savedView){setZoom(savedView.zoom,{precise:true});view.scrollLeft=savedView.left;view.scrollTop=savedView.top;}});
  }
  function metadata(){
    announce('Waiting for screen…','connecting');reconnectButton.disabled=true;
    startWatchdog('No screen image yet. Try Reconnect.');layout();
  }
  function frame(){
    if(!rs.on)return;
    announce('Live','live');
    if(lastRatio!==displayRatio())layout();
    startWatchdog('No new screen image. Try Reconnect.');
  }
  function disconnected(message='Disconnected — reconnecting…'){
    clearWatchdog();announce(message,'disconnected');
  }
  function closed(){
    savedView={zoom,left:view.scrollLeft,top:view.scrollTop};typingPoint=null;
    multi=null;multiHeld=false;wheelRemainder=0;
    fullscreenRequest++;requestedFullscreen=false;
    clearWatchdog();announce('Screen closed','closed');stopGesture();
    setClean(false);screen.classList.remove('screenExpanded','screenPresentation');
    if(document.fullscreenElement===screen)document.exitFullscreen().catch(()=>{});
    setZoom(1);updateFullscreen();
  }
  async function reconnect(){
    if(!rs.on||reconnecting)return;
    reconnecting=true;
    // An input may already have reached Windows. Preserve the draft and start a
    // new context rather than replaying a command with an uncertain outcome.
    rsPauseLive('Reconnecting. Check the PC field, then tap New field before typing.');
    if(g){clearTimeout(g.lp);g=null;}
    mouseDrag=false;qq=[];stopGesture();
    announce('Reconnecting…','connecting');reconnectButton.disabled=true;
    const abort=new AbortController(),timeout=setTimeout(()=>abort.abort(),2000);
    try{
      // Release through the still-open screen session before replacing it. A
      // queued release could otherwise be discarded with the old input queue.
      await api('/api/input',{method:'POST',body:JSON.stringify({cmds:['up l','up r','up m']}),signal:abort.signal});
    }catch{}finally{clearTimeout(timeout);}
    try{if(rs.on){rs.m=null;rsRun();}}
    finally{reconnecting=false;}
  }
  function setClean(enabled){
    screen.classList.toggle('screenClean',enabled);
    document.body.classList.toggle('screenCleanActive',enabled);
    if(enabled){
      rsPrefsClose();rsTypeClose();setZoom(1);stopGesture();
      canvas.focus({preventScroll:true});
    }
    requestAnimationFrame(()=>layout());
  }
  function updateFullscreen(){
    const active=document.fullscreenElement===screen;
    if(active&&!requestedFullscreen){setClean(false);document.exitFullscreen().catch(()=>{});return;}
    if(!active&&!screen.classList.contains('screenExpanded')){setClean(false);if(requestedFullscreen){requestedFullscreen=false;fullscreenRequest++;}}
    fullButton.setAttribute('aria-label',active?'Exit full screen':fullscreenSupported?'Full screen':screen.classList.contains('screenExpanded')?'Show controls':'Expand view');
    fullButton.setAttribute('aria-pressed',String(active||screen.classList.contains('screenExpanded')));
    requestAnimationFrame(()=>layout());
  }
  function restoreControls(){
    multi=null;multiHeld=false;wheelRemainder=0;
    fullscreenRequest++;requestedFullscreen=false;
    setClean(false);screen.classList.remove('screenExpanded','screenPresentation');
    if(document.fullscreenElement===screen)document.exitFullscreen().catch(()=>{});
    updateFullscreen();
  }
  function presentation(){screen.classList.add('screenExpanded','screenPresentation');setClean(true);updateFullscreen();}
  async function fullscreen(){
    if(document.fullscreenElement===screen||screen.classList.contains('screenClean')){restoreControls();return;}
    if(fullscreenSupported){
      const request=++fullscreenRequest;requestedFullscreen=true;setClean(true);
      try{
        await screen.requestFullscreen({navigationUI:'hide'});
        if(request!==fullscreenRequest){if(document.fullscreenElement===screen)await document.exitFullscreen();return;}
      }catch{if(request===fullscreenRequest){requestedFullscreen=false;setClean(false);msg('Full screen is unavailable here. Install PC Remote for a standalone view.');}}
      updateFullscreen();return;
    }
    screen.classList.add('screenExpanded');setClean(true);updateFullscreen();
  }

  // Reserve a local way out before desktop input can forward Escape to Windows.
  document.addEventListener('keydown',event=>{
    if(event.key==='Escape'&&screen.classList.contains('screenClean')){
      event.preventDefault();event.stopImmediatePropagation();restoreControls();
    }
  },true);
  let exitTouch=null;
  view.addEventListener('touchstart',event=>{
    if(!screen.classList.contains('screenClean'))return;
    if(controlTouches(event).length>=3){
      consume(event);
      if(g){clearTimeout(g.lp);if(g.dr)qc('up l');g=null;}
      exitTouch={at:performance.now(),points:Array.from(controlTouches(event),t=>({id:t.identifier,x:t.clientX,y:t.clientY})),moved:false};
    }else if(exitTouch)consume(event);
  },{capture:true,passive:false});
  view.addEventListener('touchmove',event=>{
    if(!exitTouch)return;consume(event);
    for(const touch of controlTouches(event)){const initial=exitTouch.points.find(p=>p.id===touch.identifier);if(initial&&Math.hypot(touch.clientX-initial.x,touch.clientY-initial.y)>20)exitTouch.moved=true;}
  },{capture:true,passive:false});
  view.addEventListener('touchend',event=>{
    if(!exitTouch)return;consume(event);
    if(controlTouches(event).length)return;
    const tap=!exitTouch.moved&&performance.now()-exitTouch.at<700;exitTouch=null;
    if(tap)restoreControls();
  },{capture:true,passive:false});
  view.addEventListener('touchcancel',event=>{if(exitTouch){consume(event);exitTouch=null;}},{capture:true,passive:false});

  // Preserve the phone keyboard while pressing view controls; keyboard users
  // can still focus the buttons through normal Tab navigation.
  toolbar.addEventListener('mousedown',event=>event.preventDefault());
  reconnectButton.addEventListener('click',reconnect);
  fullButton.addEventListener('click',()=>fullscreen().catch(()=>msg('Could not change full-screen mode.')));
  presentButton.addEventListener('click',presentation);restoreButton.addEventListener('click',restoreControls);
  minus.addEventListener('click',()=>setZoom(zoom-.25));
  plus.addEventListener('click',()=>setZoom(zoom+.25));
  zoomButton.addEventListener('click',()=>setZoom(1));
  panButton.addEventListener('click',()=>{
    if(zoom===1)return;
    if((!window.PCRCanAccess||window.PCRCanAccess('control'))&&!rsCanPoint())return;
    pan=!pan;stopGesture();panUI();
  });
  document.addEventListener('fullscreenchange',updateFullscreen);

  function startPan(x,y){gesture={x,y,left:view.scrollLeft,top:view.scrollTop};}
  function movePan(x,y){if(gesture){view.scrollLeft=gesture.left+gesture.x-x;view.scrollTop=gesture.top+gesture.y-y;}}
  function consume(event){event.preventDefault();event.stopImmediatePropagation();}
  // Two-finger gestures belong to the local view until recognized. Suppress
  // the old one-finger tap/drag state so lifting one finger cannot click the PC.
  let multi=null,multiHeld=false,wheelRemainder=0,multiStarted=0,multiTap=false;
  const points=event=>Array.from(controlTouches(event),t=>({id:t.identifier,x:t.clientX,y:t.clientY}));
  function releaseRemoteTouch(){if(g){clearTimeout(g.lp);if(g.dr)qc('up l');g=null;}wheelRemainder=0;}
  view.addEventListener('touchstart',event=>{if(controlTouches(event).length<2&&!multiHeld)return;consume(event);releaseRemoteTouch();multiHeld=true;multiStarted=performance.now();multiTap=controlTouches(event).length===2;multi=controlTouches(event).length===2?window.PCRTouchGestures?.create(points(event),zoom):null;},{capture:true,passive:false});
  view.addEventListener('touchmove',event=>{if(!multiHeld)return;consume(event);if(controlTouches(event).length!==2||!multi)return;const action=multi.update(points(event));if(!action)return;multiTap=false;
    if(action.type==='pinch'){setZoom(action.zoom,{precise:true,anchor:{x:action.x,y:action.y}});return;}
    if(pan||window.PCRCanAccess&&!window.PCRCanAccess('control')){view.scrollLeft-=action.dx;view.scrollTop-=action.dy;return;}
    wheelRemainder+=action.dy*4;const delta=Math.trunc(wheelRemainder);wheelRemainder-=delta;if(delta)qc('wheel '+delta);
  },{capture:true,passive:false});
  view.addEventListener('touchend',event=>{if(!multiHeld)return;consume(event);multi=null;if(!controlTouches(event).length){if(multiTap&&performance.now()-multiStarted<300&&!pan)qc('click r');multiTap=false;multiHeld=false;releaseRemoteTouch();}},{capture:true,passive:false});
  view.addEventListener('touchcancel',event=>{if(!multiHeld)return;consume(event);multi=null;multiHeld=false;releaseRemoteTouch();},{capture:true,passive:false});
  // Capture local pan gestures before the controller's remote pointer handlers.
  view.addEventListener('pointerdown',event=>{
    if(!pan||event.pointerType!=='mouse')return;
    consume(event);view.setPointerCapture(event.pointerId);startPan(event.clientX,event.clientY);
  },true);
  view.addEventListener('pointermove',event=>{if(!pan||event.pointerType!=='mouse')return;consume(event);movePan(event.clientX,event.clientY);},true);
  view.addEventListener('pointerup',event=>{if(!pan||event.pointerType!=='mouse')return;consume(event);stopGesture();},true);
  view.addEventListener('pointercancel',event=>{if(!pan||event.pointerType!=='mouse')return;consume(event);stopGesture();},true);
  view.addEventListener('touchstart',event=>{if(!pan)return;consume(event);const touch=controlTouches(event)[0];if(touch)startPan(touch.clientX,touch.clientY);},{capture:true,passive:false});
  view.addEventListener('touchmove',event=>{if(!pan)return;consume(event);const touch=controlTouches(event)[0];if(touch)movePan(touch.clientX,touch.clientY);},{capture:true,passive:false});
  view.addEventListener('touchend',event=>{if(!pan)return;consume(event);stopGesture();},{capture:true,passive:false});
  view.addEventListener('touchcancel',event=>{if(!pan)return;consume(event);stopGesture();},{capture:true,passive:false});
  view.addEventListener('wheel',event=>{if(!pan)return;consume(event);view.scrollLeft+=event.deltaX;view.scrollTop+=event.deltaY;},{capture:true,passive:false});
  new ResizeObserver(()=>layout()).observe(view);
  new ResizeObserver(()=>{adaptHeight();layout();}).observe(screen);
  window.visualViewport?.addEventListener('resize',()=>{if(typingPoint)requestAnimationFrame(()=>layout());});
  window.addEventListener('pcr:auth',()=>{if(!window.PCRAuth?.signedIn){savedView=null;typingPoint=null;setZoom(1);}});
  window.PCRScreenTools={connecting,metadata,frame,disconnected,closed,imageBox,reconnect,setZoom,focusPoint,restoreControls,presentation};
  setZoom(1);updateFullscreen();
})();
