'use strict';
(()=>{
 const policy=window.PCRSecondScreenPolicy;if(!policy)return;
 const page=document.createElement('dialog');page.id='secondScreenPage';page.className='workspacePage';page.innerHTML='<header><div><h2>Second screen</h2><small>Your phone becomes an extra Windows display.</small></div><button type="button" data-close>Back</button></header><section class="secondScreenSetup"><label>Phone position<select data-side><option value="right">Right of PC</option><option value="left">Left of PC</option><option value="top">Above PC</option><option value="bottom">Below PC</option></select></label><label>Orientation lock<select data-orientation><option value="landscape">Landscape</option><option value="portrait">Portrait</option></select></label><label>Stream<select data-quality><option value="auto">Automatic</option><option value="hd">Sharp text · 30 fps</option><option value="smooth">Smooth motion</option><option value="low">Save battery</option></select></label><label class="secondScreenFast"><input type="checkbox" data-fast checked>Prefer the fastest verified connection</label></section><section class="secondScreenDriver" hidden><strong>One-time Windows setup</strong><p>Install Virtual Display Driver on your PC and keep the physical monitor as the main display. Elleson Connect will attach the phone display when you connect and disconnect it when you finish.</p><button type="button" data-setup>Open setup on PC</button><button type="button" data-refresh>Check again</button></section><div class="secondScreenStage"><canvas hidden></canvas><video muted playsinline hidden></video><div class="secondScreenEmpty"><strong>More room for your PC.</strong><span>Connect, then drag a Windows window across the chosen screen edge.</span></div><svg class="secondScreenCursor" viewBox="0 0 17 23" hidden aria-hidden="true"><path d="M1 1v19l5-5 4 7 3-2-4-7 7-1Z" fill="white" stroke="#10212c" stroke-width="1.4" stroke-linejoin="round"/></svg></div><div class="secondScreenActions"><p data-status role="status" aria-live="polite">Checking Windows display support…</p><button type="button" data-start disabled>Connect second screen</button><button type="button" data-fullscreen hidden>Full screen</button><button type="button" data-stop hidden>Disconnect</button></div><p class="secondScreenMetrics" data-metrics hidden></p>';
 document.body.append(page);const q=selector=>page.querySelector(selector),stage=q('.secondScreenStage'),canvas=q('canvas'),video=q('video'),cursor=q('.secondScreenCursor'),status=text=>q('[data-status]').textContent=text;
 const icon='<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="3" y="5" width="26" height="18" rx="3"/><path d="M11 29h10M16 23v6M12 11l-4 4 4 4m8-8 4 4-4 4"/></svg>';
 const home=document.createElement('button');home.type='button';home.className='quick wide secondScreenHome';home.dataset.dashboardTile='second-screen';home.hidden=true;home.innerHTML='<span class="dashboardTileIcon">'+icon+'</span><span class="dashboardTileCopy"><strong>Second screen</strong></span>';document.querySelector('.heroactions')?.append(home);
 let preferences={side:'right',orientation:'landscape',quality:'auto',fast:true};try{preferences={...preferences,...JSON.parse(localStorage.getItem('elleson_second_screen_v1')||'{}')};}catch{}for(const key of ['side','orientation','quality'])if(q('[data-'+key+']').querySelector('option[value="'+String(preferences[key]).replace(/[^a-z]/g,'')+'"]'))q('[data-'+key+']').value=preferences[key];q('[data-fast]').checked=preferences.fast!==false;
 let socket=null,viewer=null,connected=false,starting=false,routePending=false,routeTimer,epoch=0,monitor=null,profile='hd',format=null,frames=0,priorFrames=0,lastMeasure=0,lastChange=0,retries=0,roundTrip=0,probeReady=false,pulse=null,qualityTimer=null,lastPointer=null,hold=null,scrollY=null,wake=null,autoOpened=false,inputFrame=null,pendingInput=null;const touches=new Map();
 const native=value=>{try{window.PCRAndroid?.postMessage(JSON.stringify(value));}catch{}};
 function save(){for(const key of ['side','orientation','quality'])preferences[key]=q('[data-'+key+']').value;preferences.fast=q('[data-fast]').checked;try{localStorage.setItem('elleson_second_screen_v1',JSON.stringify(preferences));}catch{}native({type:'second-screen-preferences',...preferences});}
 for(const input of page.querySelectorAll('.secondScreenSetup select,.secondScreenSetup input'))input.addEventListener('change',save);

 const placement=document.createElement('section');placement.className='secondScreenPlacement';placement.setAttribute('aria-label','Screen placement');
 placement.innerHTML='<div class="secondScreenDiagram"><span class="secondScreenPC">PC screen</span></div><p data-placement-hint></p>';
 const diagram=placement.querySelector('.secondScreenDiagram');
 const directions={left:['Left','left'],right:['Right','right'],top:['Above','top'],bottom:['Below','bottom']};
 for(const [side,[label]]of Object.entries(directions)){
  const button=document.createElement('button');button.type='button';button.dataset.placement=side;button.setAttribute('aria-label','Place phone '+label.toLowerCase()+' of PC');
  button.innerHTML='<span class="secondScreenPhone" aria-hidden="true"></span><span>'+label+'</span>';
  button.onclick=()=>{if(starting||monitor)return;q('[data-side]').value=side;save();drawPlacement();};
  diagram.append(button);
 }
 q('.secondScreenSetup').prepend(placement);
 function drawPlacement(){
  const side=q('[data-side]').value,orientation=q('[data-orientation]').value;
  for(const button of diagram.querySelectorAll('button')){button.setAttribute('aria-pressed',String(button.dataset.placement===side));button.disabled=starting||!!monitor;}
  diagram.dataset.orientation=orientation;
  placement.querySelector('[data-placement-hint]').textContent='Drag a window past the '+directions[side][1]+' edge of your PC screen to move it onto your phone.';
  for(const key of ['side','orientation'])q('[data-'+key+']').disabled=starting||!!monitor;
 }
 q('[data-side]').addEventListener('change',drawPlacement);q('[data-orientation]').addEventListener('change',drawPlacement);drawPlacement();
 const keyboard=document.createElement('section');keyboard.className='secondScreenKeyboard';keyboard.hidden=true;
 keyboard.innerHTML='<label for="secondScreenText">Tap a text field on the extended display, then type here</label><textarea id="secondScreenText" rows="2" placeholder="Text to send" maxlength="1024"></textarea><div><button type="button" data-send-text>Send text</button><button type="button" data-key="Enter">Enter</button><button type="button" data-key="Backspace">Backspace</button><button type="button" data-key="Tab">Tab</button><button type="button" data-close-keyboard>Close keyboard</button></div><p data-keyboard-status role="status"></p>';
 q('.secondScreenActions').before(keyboard);
 const keyboardButton=document.createElement('button');keyboardButton.type='button';keyboardButton.dataset.keyboard='';keyboardButton.textContent='Keyboard';keyboardButton.hidden=true;q('.secondScreenActions').append(keyboardButton);
 const editor=keyboard.querySelector('textarea');let keyboardPending=null,keyboardSequence=0,composing=false;
 function closeKeyboard(){keyboard.hidden=true;editor.blur();native({type:'keyboard-hide'});keyboardButton.setAttribute('aria-expanded','false');}
 editor.addEventListener('compositionstart',()=>composing=true);editor.addEventListener('compositionend',()=>composing=false);
 keyboardButton.setAttribute('aria-expanded','false');
 keyboardButton.onclick=()=>{if(!monitor)return;keyboard.hidden=false;keyboardButton.setAttribute('aria-expanded','true');editor.focus({preventScroll:true});native({type:'keyboard'});editor.scrollIntoView?.({block:'nearest'});};
 keyboard.querySelector('[data-close-keyboard]').onclick=closeKeyboard;
 function keyboardCommand(value){
  if(!monitor||keyboardPending||socket?.readyState!==WebSocket.OPEN||socket.bufferedAmount>=65536)return;
  const id=++keyboardSequence;keyboardPending={id,text:editor.value};send({type:'input',id,...value});
  for(const button of keyboard.querySelectorAll('button:not([data-close-keyboard])'))button.disabled=true;
  keyboard.querySelector('[data-keyboard-status]').textContent='Sending…';
 }
 keyboard.querySelector('[data-send-text]').onclick=()=>{if(editor.value&&!composing)keyboardCommand({action:'text',text:editor.value});};
 for(const button of keyboard.querySelectorAll('[data-key]'))button.onclick=()=>keyboardCommand({action:'key',key:button.dataset.key});
 function keyboardResult(value){
  if(!keyboardPending||value.id!==keyboardPending.id)return;
  if(value.ok&&value.action==='text'&&editor.value===keyboardPending.text)editor.value='';
  keyboardPending=null;for(const button of keyboard.querySelectorAll('button'))button.disabled=false;
  keyboard.querySelector('[data-keyboard-status]').textContent=value.ok?'Sent to the extended display.':value.message||'Tap a text field on the extended display and try again.';
 }
 function send(value){if(socket?.readyState===WebSocket.OPEN&&socket.bufferedAmount<65536)socket.send(JSON.stringify(value));}
 function flushInput(){if(inputFrame!==null)cancelAnimationFrame(inputFrame);inputFrame=null;if(pendingInput){send(pendingInput);pendingInput=null;}}
 function queueInput(value){if(pendingInput&&pendingInput.action!==value.action)flushInput();if(pendingInput?.action==='wheel'&&value.action==='wheel')value.delta=Math.max(-1200,Math.min(1200,pendingInput.delta+value.delta));pendingInput=value;if(inputFrame===null)inputFrame=requestAnimationFrame(flushInput);}
 function fit(){return monitor?policy.fit(stage.clientWidth,stage.clientHeight,monitor.width,monitor.height):null;}
 function pointer(value){lastPointer=value;const box=fit();cursor.toggleAttribute('hidden',!box||!value.visible);if(box&&value.visible){cursor.style.left=box.left+value.x*box.width+'px';cursor.style.top=box.top+value.y*box.height+'px';}}
 new ResizeObserver(()=>{if(lastPointer)pointer(lastPointer);}).observe(stage);
 function stop(message='Second screen disconnected. Windows return to your PC.'){const wasActive=starting||connected||routePending||!!monitor;cancelTouch();closeKeyboard();keyboardPending=null;for(const button of keyboard.querySelectorAll('button'))button.disabled=false;keyboardButton.hidden=true;epoch++;if(inputFrame!==null)cancelAnimationFrame(inputFrame);inputFrame=null;pendingInput=null;canvas.width=canvas.height=0;clearTimeout(routeTimer);clearTimeout(hold);clearInterval(pulse);clearInterval(qualityTimer);routePending=false;starting=false;connected=false;monitor=null;touches.clear();scrollY=null;if(wasActive){native({type:'second-screen-route-cancel'});native({type:'second-screen-orientation',active:false});}viewer?.stop(true);viewer=null;if(socket){const previous=socket;socket=null;previous.onclose=previous.onerror=previous.onmessage=null;try{previous.send(JSON.stringify({type:'stop'}));}catch{}previous.close();}wake?.release?.().catch(()=>{});wake=null;page.classList.remove('secondScreenRunning');q('[data-start]').hidden=false;q('[data-start]').disabled=!probeReady;q('[data-stop]').hidden=true;q('[data-fullscreen]').hidden=true;q('.secondScreenEmpty').hidden=false;canvas.hidden=true;video.hidden=true;cursor.setAttribute('hidden','');lastPointer=null;drawPlacement();status(message);}
 function videoState(value){if(value.state==='playing'){connected=true;starting=false;retries=0;q('.secondScreenEmpty').hidden=true;status(location.protocol==='http:'?'Connected directly to your PC.':'Connected to your PC.');return;}if(value.state==='connecting')return;if(!['error','unavailable'].includes(value.state)||!monitor)return;if(++retries<=3){const next=policy.preset({current:profile,stalled:true});setTimeout(()=>{if(monitor)startVideo(next);},700);}else stop(value.message||'Video could not connect. Your windows have returned to the PC.');}
 function startVideo(preset){viewer?.stop(true);profile=preset;lastChange=Date.now();frames=priorFrames=0;lastMeasure=Date.now();format=null;const sourceId=monitor?.id;if(!sourceId)return;canvas.hidden=video.hidden=true;
  if(window.VideoDecoder&&window.EncodedVideoChunk&&window.isSecureContext){canvas.hidden=false;viewer=new window.PCRNativeVideo.NativeVideoSession({onState:videoState,onFrame:(frame,metadata)=>{if(!monitor||monitor.id!==sourceId)return;format=metadata;frames++;if(canvas.width!==frame.displayWidth||canvas.height!==frame.displayHeight){canvas.width=frame.displayWidth;canvas.height=frame.displayHeight;}canvas.getContext('2d',{alpha:false,desynchronized:true}).drawImage(frame,0,0,canvas.width,canvas.height);}});}
  else{video.hidden=false;viewer=new window.PCRMseVideo.MseVideoSession({video,onState:videoState,onFormat:value=>format=value});}
  viewer.start(preset,{monitorId:sourceId});
 }
 function measure(){if(!monitor||!connected)return;const now=Date.now(),count=video.hidden?frames:video.getVideoPlaybackQuality?.().totalVideoFrames||0,elapsed=(now-lastMeasure)/1000,actual=(count-priorFrames)/Math.max(1,elapsed);lastMeasure=now;priorFrames=count;q('[data-metrics]').textContent=(format?.engine||'H.264')+' · '+Math.round(actual)+' fps · '+Math.round(roundTrip)+' ms';if(preferences.quality==='auto'&&now-lastChange>=15000){const next=policy.preset({current:profile,actualFps:actual,rtt:roundTrip,hardware:!!format?.hardware,smooth60:!!window.PCRNativeCapabilities?.smooth60,stableMs:now-lastChange});if(next!==profile)startVideo(next);}}
 function begin(){if(!starting||!page.open||document.hidden)return;routePending=false;clearTimeout(routeTimer);const serial=++epoch;native({type:'second-screen-orientation',active:true,orientation:preferences.orientation});if(typeof rs!=='undefined'&&rs.on)window.rsClose?.();const dimensions=policy.dimensions(window.PCRNativeCapabilities?.displayWidth||screen.width*devicePixelRatio,window.PCRNativeCapabilities?.displayHeight||screen.height*devicePixelRatio,preferences.orientation);
  socket=new WebSocket((location.protocol==='https:'?'wss:':'ws:')+'//'+location.host+'/api/second-screen');const current=socket;current.onopen=()=>send({type:'start',...dimensions,side:preferences.side});current.onerror=()=>{if(epoch===serial)stop('The PC could not start the second screen. Check the driver setup.');};current.onclose=()=>{if(epoch===serial)stop('Connection ended. Your windows are back on the PC.');};current.onmessage=event=>{if(epoch!==serial)return;try{const value=JSON.parse(event.data);if(value.type==='ready'){monitor={id:value.monitorId,width:value.width,height:value.height};page.classList.add('secondScreenRunning');keyboardButton.hidden=false;drawPlacement();q('[data-stop]').hidden=false;q('[data-fullscreen]').hidden=false;const selected=preferences.quality==='auto'?'hd':preferences.quality==='smooth'?(window.PCRNativeCapabilities?.smooth60?'fluid':'smooth'):preferences.quality;startVideo(selected);pulse=setInterval(()=>send({type:'ping',at:Date.now()}),2000);qualityTimer=setInterval(measure,3000);navigator.wakeLock?.request('screen').then(value=>wake=value).catch(()=>{});}else if(value.type==='input-result')keyboardResult(value);else if(value.type==='pointer')pointer(value);else if(value.type==='pong')roundTrip=Math.max(0,Date.now()-value.at);else if(value.type==='files')native({type:'phone-file-offer',offers:value.offers});else if(value.type==='status')status(value.message);else if(value.type==='error')stop(value.message);}catch{stop('The display connection returned an invalid response.');}};
 }
 async function probe(attempt=0){probeReady=false;q('[data-start]').disabled=true;try{const response=await fetch('/api/second-screen',{headers:{'X-PCR':'1'}}),value=await response.json();if(!response.ok)throw Error(value.error||'The PC host needs an update.');q('.secondScreenDriver').hidden=!!value.installed;const capable=!!window.PCRNativeCapabilities?.secondScreen;if(value.installed&&capable&&!value.phoneRegistered&&attempt<3&&page.open&&window.PCRAuth?.signedIn){status('Connecting this phone to your account…');await new Promise(resolve=>setTimeout(resolve,600));return probe(attempt+1);}probeReady=!!value.installed&&capable&&!!value.phoneRegistered;q('[data-start]').disabled=!probeReady;status(!value.installed?'Install the virtual display driver on your PC once.':!capable?'Install the latest Elleson Connect APK to connect this phone.':!value.phoneRegistered?'Wait for this phone to finish connecting to your account, then check again.':'Ready. Windows will extend onto your phone.');return probeReady;}catch(error){status(error.message);return false;}}
 async function start(){if(starting||connected)return;save();if(!probeReady&&!await probe())return;starting=true;drawPlacement();q('[data-start]').disabled=true;q('[data-start]').hidden=true;q('[data-stop]').hidden=false;status('Preparing your second screen…');if(preferences.fast&&window.PCRNativeCapabilities?.fastLocal){routePending=true;status('Checking for a faster direct connection…');native({type:'second-screen-route'});routeTimer=setTimeout(()=>{if(routePending){native({type:'second-screen-route-cancel'});begin();}},9000);}else begin();}

 // Keep a gesture's ownership until every finger lifts. A remaining finger
 // after a two-finger scroll must never turn into a Windows drag.
 let gesture=null,wheelRemainder=0;
 function point(event,clamp=false){
  const box=fit();if(!box)return null;
  const rect=stage.getBoundingClientRect(),x=(event.clientX-rect.left-box.left)/box.width,y=(event.clientY-rect.top-box.top)/box.height;
  if(!clamp&&(x<0||x>1||y<0||y>1))return null;
  return{x:Math.max(0,Math.min(1,x)),y:Math.max(0,Math.min(1,y))};
 }
 function cancelTouch(){
  flushInput();clearTimeout(hold);
  if(gesture?.down)send({type:'input',action:'up',...gesture.last});
  gesture=null;touches.clear();scrollY=null;wheelRemainder=0;
 }
 stage.addEventListener('pointerdown',event=>{
  const p=point(event);if(!p||!monitor)return;
  event.preventDefault();
  try{stage.setPointerCapture?.(event.pointerId);}catch{}
  if(event.button===2){send({type:'input',action:'right',...p});return;}
  if(event.button!==0)return;
  touches.set(event.pointerId,{cy:event.clientY});
  if(touches.size===1){
   gesture={id:event.pointerId,startX:event.clientX,startY:event.clientY,last:p,down:true,mode:'touch'};
   send({type:'input',action:'down',...p});
   hold=setTimeout(()=>{
    if(gesture?.mode!=='touch'||!gesture.down)return;
    flushInput();send({type:'input',action:'up',...gesture.last});gesture.down=false;gesture.mode='context';
    send({type:'input',action:'right',...gesture.last});
   },650);
  }else{
   flushInput();clearTimeout(hold);
   if(gesture?.down){send({type:'input',action:'up',...gesture.last});gesture.down=false;}
   if(gesture)gesture.mode='scroll';
   scrollY=[...touches.values()].reduce((sum,item)=>sum+item.cy,0)/touches.size;wheelRemainder=0;
  }
 });
 stage.addEventListener('pointermove',event=>{
  if(!touches.has(event.pointerId)||!gesture)return;
  const p=point(event,true);if(!p)return;
  event.preventDefault();touches.set(event.pointerId,{cy:event.clientY});
  if(gesture.mode==='scroll'){
   if(touches.size<2)return;
   const y=[...touches.values()].reduce((sum,item)=>sum+item.cy,0)/touches.size;
   wheelRemainder+=(y-scrollY)*3;scrollY=y;
   const delta=Math.max(-1200,Math.min(1200,Math.trunc(wheelRemainder)));wheelRemainder-=delta;
   if(delta)queueInput({type:'input',action:'wheel',...gesture.last,delta});
  }else if(gesture.down&&gesture.id===event.pointerId){
   if(Math.hypot(event.clientX-gesture.startX,event.clientY-gesture.startY)>8){clearTimeout(hold);gesture.mode='drag';}
   gesture.last=p;queueInput({type:'input',action:'move',...p});
  }
 });
 function release(event){
  if(!touches.has(event.pointerId))return;
  flushInput();clearTimeout(hold);
  if(gesture?.down&&gesture.id===event.pointerId){
   const p=point(event,true)||gesture.last;send({type:'input',action:'up',...p});gesture.down=false;
  }
  touches.delete(event.pointerId);
  if(!touches.size){gesture=null;scrollY=null;wheelRemainder=0;}
  else if(gesture?.mode==='scroll')scrollY=[...touches.values()].reduce((sum,item)=>sum+item.cy,0)/touches.size;
 }
 stage.addEventListener('pointerup',release);
 stage.addEventListener('pointercancel',cancelTouch);
 stage.addEventListener('lostpointercapture',event=>{if(touches.has(event.pointerId))cancelTouch();});
 window.addEventListener('blur',cancelTouch);
 stage.addEventListener('contextmenu',event=>event.preventDefault());
 stage.addEventListener('wheel',event=>{
  const p=point(event);if(!p||!monitor)return;event.preventDefault();
  const scale=event.deltaMode===1?20:event.deltaMode===2?stage.clientHeight:1;
  queueInput({type:'input',action:'wheel',...p,delta:Math.max(-1200,Math.min(1200,Math.round(-event.deltaY*scale)))});
 },{passive:false});
 const hint=document.createElement('p');hint.className='secondScreenTouchHint';hint.textContent='Tap to click · Drag with one finger · Scroll with two fingers · Hold for right click';q('.secondScreenActions').after(hint);
 q('[data-close]').onclick=()=>page.close();q('[data-stop]').onclick=()=>stop();q('[data-start]').onclick=()=>void start();q('[data-refresh]').onclick=()=>void probe();q('[data-fullscreen]').onclick=()=>stage.requestFullscreen?.().catch(()=>status('Full screen is unavailable on this phone.'));q('[data-setup]').onclick=async()=>{try{const response=await fetch('/api/second-screen/setup',{method:'POST',headers:{'X-PCR':'1'}}),value=await response.json();status(response.ok?'The setup page is open on your PC. Install the driver, then Check again.':value.error);}catch{status('Open Virtual Display Driver setup on your PC.');}};
 page.addEventListener('close',()=>stop());document.addEventListener('visibilitychange',()=>{if(document.hidden&&(starting||connected))stop('Second screen paused. Your windows are back on the PC.');});window.addEventListener('pagehide',()=>stop());window.addEventListener('pcr:local-route',()=>{if(routePending&&starting)begin();});window.addEventListener('pcr:second-screen-files',event=>status(event.detail?.message||'File transfer updated.'));
 function open(){if(!window.PCRAuth?.signedIn)return;if(!page.open)page.showModal();void probe().then(ready=>{if(ready&&location.hash==='#second-screen')void start();});}home.onclick=open;
 function auth(){home.hidden=!window.PCRAuth?.signedIn||window.PCRAuth?.role!=='owner';const tool=document.querySelector('[data-second-screen]');if(tool)tool.hidden=home.hidden;if(window.PCRNativeCapabilities?.secondScreenPreferences&&!starting&&!connected){const saved=window.PCRNativeCapabilities.secondScreenPreferences;for(const key of ['side','orientation','quality'])if([...q('[data-'+key+']').options].some(option=>option.value===saved[key]))q('[data-'+key+']').value=preferences[key]=saved[key];q('[data-fast]').checked=preferences.fast=saved.fast!==false;drawPlacement();}if(!window.PCRAuth?.signedIn||window.PCRAuth?.role!=='owner'){stop();if(page.open)page.close();autoOpened=false;}else if(!autoOpened&&(location.hash==='#second-screen'||new URLSearchParams(location.search).get('second-screen')==='1')){autoOpened=true;setTimeout(open,900);}}
 function tools(){const grid=document.querySelector('#remoteOptions .workspaceMenuGrid');if(!grid||grid.querySelector('[data-second-screen]'))return;const button=document.createElement('button');button.type='button';button.dataset.secondScreen='';button.innerHTML='<span class="workspaceMenuIcon">'+icon+'</span><span>Second screen</span>';button.onclick=open;grid.append(button);}
 window.PCRSecondScreen={open,stop,get active(){return !!monitor;}};window.addEventListener('pcr:auth',auth);window.addEventListener('pcr:native-ready',auth);if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{tools();auth();},{once:true});else{tools();auth();}
})();
