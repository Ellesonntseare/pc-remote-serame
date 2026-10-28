'use strict';
(() => {
  const button=document.createElement('button');button.type='button';button.className='quick wide guestScreenHome';button.hidden=true;button.setAttribute('aria-haspopup','dialog');document.querySelector('.heroactions').append(button);
  const dialog=document.createElement('dialog');dialog.id='guestScreenDialog';dialog.setAttribute('aria-labelledby','guestScreenTitle');
  dialog.innerHTML='<header class="guestScreenHead"><div><span class="guestEyebrow">A SHARED VIEW</span><h2 id="guestScreenTitle">Guest screens</h2></div><button type="button" data-close aria-label="Close shared screen">✕</button></header><p class="guestScreenHint"></p><div class="guestScreenSelect"><label for="guestScreenSelect">Sharing now</label><select id="guestScreenSelect" aria-label="Choose guest screen"></select></div><div class="guestScreenStage"><video muted playsinline hidden></video><img alt="Guest shared screen" hidden><canvas aria-label="Shared screen annotation surface"></canvas><div class="guestScreenEmpty">A little space to see things together.</div></div><div class="guestScreenTools"><div class="guestDrawTools" role="group" aria-label="Annotation tool"><button type="button" data-tool="laser" aria-pressed="true">◉ Laser</button><button type="button" data-tool="pen" aria-pressed="false">✎ Draw</button><button type="button" data-clear>Clear</button></div><button type="button" data-share class="guestShareStart">Share my screen ↗</button><button type="button" data-stop hidden>Stop sharing</button></div><p class="guestScreenStatus" role="status" aria-live="polite"></p>';
  document.body.append(dialog);
  const q=selector=>dialog.querySelector(selector),video=q('video'),image=q('img'),canvas=q('canvas'),stage=q('.guestScreenStage'),ctx=canvas.getContext('2d'),select=q('select'),empty=q('.guestScreenEmpty'),status=q('.guestScreenStatus');
  const controls=document.createElement('section');controls.className='phoneControlTools';controls.hidden=true;
  controls.innerHTML='<div class="phoneControlHead"><button type="button" data-request-control>Request phone control</button><span data-control-status role="status">View only</span></div><div data-phone-actions hidden><div class="phoneNavigation"><button type="button" data-phone-key="back">← Back</button><button type="button" data-phone-key="home">⌂ Home</button><button type="button" data-phone-key="recents">▣ Recent apps</button></div><div class="phoneText"><input type="text" maxlength="2000" placeholder="Text for the selected phone field" aria-label="Text for the selected phone field" autocomplete="off"><button type="button" data-phone-text>Set text</button></div><small>Tap or drag the live screen. Right-click for a long press. Set text replaces the selected field.</small></div><button type="button" data-phone-stop hidden>Stop control</button>';
  q('.guestScreenTools').after(controls);
  const controlTool=document.createElement('button');controlTool.type='button';controlTool.dataset.tool='control';controlTool.setAttribute('aria-pressed','false');controlTool.textContent='↖ Control';controlTool.hidden=true;q('.guestDrawTools').prepend(controlTool);
  let control={state:'off',supported:false,canControl:false},capture=null,displayedGeneration=0,controlSeq=0,controlPending=null,controlTimeout=null,controlTouch=null,mouse=null;
  const mouseButton=document.createElement('button');mouseButton.type='button';mouseButton.dataset.pcMouse='';mouseButton.textContent='Use PC mouse';mouseButton.setAttribute('aria-pressed','false');q('.phoneNavigation').prepend(mouseButton);canvas.tabIndex=0;
  function controlUI(){
    controls.hidden=owner?!watching||!control.supported:!nativeSharing||control.state!=='active';
    q('[data-request-control]').hidden=!owner;q('[data-phone-stop]').hidden=owner||control.state!=='active';
    q('[data-request-control]').disabled=control.state==='pending';q('[data-request-control]').textContent=control.canControl?'Stop phone control':'Request phone control';
    q('[data-phone-actions]').hidden=!owner||!control.canControl;controlTool.hidden=!owner||!control.canControl;
    q('[data-control-status]').textContent=control.state==='pending'?'Waiting for approval on the phone':control.canControl?'Phone control active':control.state==='active'?'Phone control active':'View only';
    for(const item of controls.querySelectorAll('[data-phone-key],[data-phone-text]'))item.disabled=!!controlPending;
    mouseButton.hidden=!owner||!control.canControl;mouseButton.title=control.mouseSupported?'Capture your mouse; press Escape to release':'Install the latest APK for mouse mode';
    mouse?.refresh();
    if(!control.canControl&&tool==='control'){tool='laser';for(const item of dialog.querySelectorAll('[data-tool]'))item.setAttribute('aria-pressed',String(item.dataset.tool==='laser'));}
  }
  function resetControl(clearCapture=true){mouse?.release();clearTimeout(controlTimeout);controlTimeout=null;controlPending=null;controlTouch=null;control={state:'off',supported:false,canControl:false};if(clearCapture){capture=null;displayedGeneration=0;}controlUI();}
  function sendPointer(command){
    if(!owner||!watching||!control.canControl||!control.mouseSupported||!control.id||!capture||capture.generation!==displayedGeneration)return;
    send({type:'pointer',id:control.id,seq:++controlSeq,generation:capture.generation,command});
  }
  function sendControl(command){if(window.PCRHoldControl&&!window.PCRHoldControl.can('phone'))return;
    if(!owner||!watching||!control.canControl||!control.id||!capture||capture.generation!==displayedGeneration||controlPending)return;
    const seq=++controlSeq;controlPending=seq;send({type:'control',id:control.id,seq,generation:capture.generation,command});controlUI();
    controlTimeout=setTimeout(()=>{if(controlPending===seq){send({type:'control-stop'});resetControl(false);status.textContent='Phone action timed out. Request control again; actions are never replayed.';}},6500);
  }
  window.addEventListener('pcr:hold-release',event=>{if(event.detail.scope==='phone')controlTouch=null;});
  q('[data-request-control]').addEventListener('click',()=>{if(control.canControl){send({type:'control-stop'});resetControl(false);}else{send({type:'control-request'});q('[data-control-status]').textContent='Sending control request…';}});
  q('[data-phone-stop]').addEventListener('click',()=>{nativeSend({type:'control-stop'});resetControl();});
  for(const item of controls.querySelectorAll('[data-phone-key]'))item.addEventListener('click',()=>sendControl({action:item.dataset.phoneKey}));
  q('[data-phone-text]').addEventListener('click',()=>sendControl({action:'text',text:controls.querySelector('input').value}));
  let socket=null,stream=null,timer=null,owner=false,watching=null,shares=[],marks=[],laser=null,tool='laser',dragging=false,lastPoint=null,lastSent=0,frameUrl=null,frameGeneration=0,dimensions=null,epoch=0,starting=false,sending=false,account='',pendingBlob=null,decoding=false,laserTimer=null,nativePending=false,nativeSharing=false;
  const nativeAvailable=()=>typeof window.PCRAndroid?.postMessage==='function';
  const nativeSend=value=>{try{window.PCRAndroid?.postMessage(JSON.stringify(value));}catch{}};
  const send=value=>{if(nativeSharing&&value.type==='mark'){nativeSend(value);return;}if(socket?.readyState===WebSocket.OPEN&&socket.bufferedAmount<512*1024)socket.send(JSON.stringify(value));};
  if(nativeAvailable())window.PCRAndroid.onmessage=event=>{
    if(!window.PCRAuth?.signedIn||(!nativePending&&!nativeSharing))return;
    let value;try{value=JSON.parse(event.data);}catch{return;}
    if(value.type==='sharing'){nativePending=false;nativeSharing=true;starting=false;q('[data-share]').hidden=true;q('[data-stop]').hidden=false;status.textContent='Your entire phone screen is live.';}
    else if(value.type==='frame'&&nativeSharing&&typeof value.data==='string'&&value.data.length<=1400000&&/^[A-Za-z0-9+/]+=*$/.test(value.data)&&Number.isInteger(value.width)&&Number.isInteger(value.height)&&value.width>0&&value.height>0&&value.width<=1920&&value.height<=1920){dimensions={width:value.width,height:value.height};image.src='data:image/jpeg;base64,'+value.data;image.hidden=false;empty.hidden=true;draw();}
    else if(value.type==='mark'&&nativeSharing)applyMark(value);
    else if(value.type==='control-state'&&nativeSharing){control={...value,canControl:false};controlUI();}
    else if(value.type==='stopped'){nativePending=false;nativeSharing=false;stop(value.message||'Phone screen sharing stopped.');}
  };
  function wipe(){marks=[];laser=null;draw();}
  function hideFrame(){frameGeneration++;pendingBlob=null;image.hidden=true;image.removeAttribute('src');if(frameUrl){URL.revokeObjectURL(frameUrl);frameUrl=null;}dimensions=null;empty.hidden=false;wipe();}
  function decodeFrame(){
    if(decoding||!pendingBlob||!owner||!watching)return;const blob=pendingBlob;pendingBlob=null;decoding=true;const generation=frameGeneration,current=socket,url=URL.createObjectURL(blob),decoded=new Image();
    const captureVersion=capture?.generation||0;
    const done=()=>{decoding=false;decodeFrame();};decoded.onload=()=>{if(generation!==frameGeneration||socket!==current){URL.revokeObjectURL(url);done();return;}if(frameUrl)URL.revokeObjectURL(frameUrl);frameUrl=url;image.src=url;image.hidden=false;empty.hidden=true;dimensions={width:decoded.naturalWidth,height:decoded.naturalHeight};displayedGeneration=captureVersion;draw();controlUI();done();};decoded.onerror=()=>{URL.revokeObjectURL(url);done();};decoded.src=url;
  }
  function stop(message='Screen sharing is off.'){
    if(owner&&control.canControl)send({type:'control-stop'});resetControl();
    if(nativePending||nativeSharing)nativeSend({type:'stop'});nativePending=false;nativeSharing=false;
    starting=false;clearTimeout(timer);timer=null;send({type:'stop'});const previous=stream;stream=null;for(const track of previous?.getTracks()||[])track.stop();video.srcObject=null;video.hidden=true;sending=false;q('[data-share]').disabled=false;q('[data-share]').hidden=owner;q('[data-stop]').hidden=true;hideFrame();status.textContent=message;
  }
  function connect(){
    if(socket?.readyState===WebSocket.OPEN)return Promise.resolve();
    if(socket?.readyState===WebSocket.CONNECTING)return new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true});});
    const current=socket=new WebSocket((location.protocol==='https:'?'wss:':'ws:')+'//'+location.host+'/api/guest-screen');current.binaryType='blob';
    current.onmessage=event=>{
      if(socket!==current)return;
      if(event.data instanceof Blob){if(!owner||!watching)return;pendingBlob=event.data;decodeFrame();return;}
      let value;try{value=JSON.parse(event.data);}catch{return;}
      if(value.type==='shares'&&owner){shares=value.shares||[];renderShares();}
      else if(value.type==='watching'){watching=value.id;capture=value.capture||null;marks=value.marks||[];laser=null;status.textContent='Live guest screen · request phone control or draw together.';draw();}
      else if(value.type==='capture'){mouse?.release();capture=value;hideFrame();controlUI();}
      else if(value.type==='control-state'){const activated=!control.canControl&&value.canControl;control=value;if(value.state!=='active'){mouse?.release();clearTimeout(controlTimeout);controlPending=null;}if(activated){controlSeq=0;tool='control';for(const item of dialog.querySelectorAll('[data-tool]'))item.setAttribute('aria-pressed',String(item.dataset.tool==='control'));}controlUI();if(value.message)status.textContent=value.message;}
      else if(value.type==='control-result'&&value.seq===controlPending){clearTimeout(controlTimeout);controlPending=null;controlUI();status.textContent=value.ok?'Phone action completed.':value.message||'The phone could not perform that action.';}
      else if(value.type==='stopped'){watching=null;resetControl();hideFrame();status.textContent='The guest stopped sharing.';}
      else if(value.type==='mark')applyMark(value);
    };
    current.onclose=()=>{if(socket!==current)return;socket=null;resetControl();if(stream||starting)stop('Sharing disconnected. Start again to reconnect.');if(owner){shares=[];watching=null;renderShares();hideFrame();status.textContent='Connection closed. Reopen Guest screens to reconnect.';}};
    return new Promise((resolve,reject)=>{current.addEventListener('open',resolve,{once:true});current.addEventListener('error',()=>reject(Error('Could not connect to screen sharing.')),{once:true});});
  }
  function renderShares(){
    select.replaceChildren();for(const [index,share]of shares.entries()){const option=document.createElement('option');option.value=share.id;option.textContent=share.device||'Shared device '+(index+1);select.append(option);}select.disabled=!shares.length;
    if(watching&&shares.some(share=>share.id===watching))select.value=watching;
    else if(shares.length&&dialog.open){watching=shares[0].id;hideFrame();send({type:'watch',id:watching});}
    else{watching=null;hideFrame();}
    button.textContent='Phone control'+(shares.length?' · '+shares.length:'');
    if(!shares.length&&owner)status.textContent='On your phone, open PC Remote and tap Use PC mouse. Approve screen sharing, then request control here.';
  }
  select.addEventListener('change',()=>{resetControl();watching=select.value;hideFrame();send({type:'watch',id:watching});});
  async function start(){
    if(starting||stream||nativeSharing||owner)return;const version=epoch;starting=true;q('[data-share]').disabled=true;
    if(nativeAvailable()){nativePending=true;q('[data-stop]').hidden=false;status.textContent='Approve sharing your entire phone screen in Android’s prompt. If asked, choose Entire screen.';nativeSend({type:'start'});return;}
    if(!navigator.mediaDevices?.getDisplayMedia){starting=false;q('[data-share]').disabled=false;status.textContent='Open the Android app to share your phone.';return;}
    let chosen;
    try{
      chosen=await navigator.mediaDevices.getDisplayMedia({video:{frameRate:{ideal:10,max:12}},audio:false});
      if(version!==epoch||!starting){for(const track of chosen.getTracks())track.stop();return;}
      await connect();if(version!==epoch||!starting)throw Error('Sharing cancelled.');
      stream=chosen;video.srcObject=chosen;await video.play();if(version!==epoch||!starting)throw Error('Sharing cancelled.');
      starting=false;video.hidden=false;empty.hidden=true;image.hidden=true;dimensions={width:video.videoWidth,height:video.videoHeight};send({type:'start'});wipe();
      q('[data-share]').hidden=true;q('[data-stop]').hidden=false;status.textContent='Sharing with Serame · no microphone or PC control. Close this panel to stop.';
      for(const track of chosen.getVideoTracks())track.addEventListener('ended',()=>{if(stream===chosen)stop('You stopped screen sharing.');},{once:true});
      const capture=document.createElement('canvas'),captureCtx=capture.getContext('2d',{alpha:false});
      const frame=()=>{if(stream!==chosen)return;timer=setTimeout(frame,110);if(sending||socket?.readyState!==WebSocket.OPEN||socket.bufferedAmount>256*1024||video.readyState<2)return;
        const scale=Math.min(1,1280/video.videoWidth,720/video.videoHeight);capture.width=Math.max(1,Math.round(video.videoWidth*scale));capture.height=Math.max(1,Math.round(video.videoHeight*scale));captureCtx.drawImage(video,0,0,capture.width,capture.height);dimensions={width:video.videoWidth,height:video.videoHeight};sending=true;
        capture.toBlob(blob=>{sending=false;if(stream===chosen&&socket?.readyState===WebSocket.OPEN&&blob&&blob.size<=1024*1024&&socket.bufferedAmount<256*1024)socket.send(blob);},'image/jpeg',.68);
      };frame();
    }catch(error){for(const track of chosen?.getTracks()||[])track.stop();if(version===epoch)stop(error.name==='NotAllowedError'?'Screen sharing was cancelled.':error.message||'Screen sharing is unavailable.');}
  }
  function bounds(){if(!dimensions)return null;const width=stage.clientWidth,height=stage.clientHeight,scale=Math.min(width/dimensions.width,height/dimensions.height);return {x:(width-dimensions.width*scale)/2,y:(height-dimensions.height*scale)/2,w:dimensions.width*scale,h:dimensions.height*scale};}
  function draw(){
    clearTimeout(laserTimer);laserTimer=null;
    const dpr=Math.min(devicePixelRatio||1,2),width=stage.clientWidth,height=stage.clientHeight;if(canvas.width!==Math.round(width*dpr)||canvas.height!==Math.round(height*dpr)){canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);}ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,width,height);const rect=bounds();if(!rect)return;ctx.lineCap='round';ctx.lineJoin='round';ctx.lineWidth=3;
    for(const mark of marks){ctx.strokeStyle=mark.color||'#66e6bc';ctx.beginPath();for(let i=0;i<mark.points.length;i++){const p=mark.points[i],x=rect.x+p.x*rect.w,y=rect.y+p.y*rect.h;i?ctx.lineTo(x,y):ctx.moveTo(x,y);}ctx.stroke();}
    if(laser&&Date.now()-laser.at<1100){const p=laser.points.at(-1),x=rect.x+p.x*rect.w,y=rect.y+p.y*rect.h;ctx.shadowBlur=15;ctx.shadowColor=laser.color;ctx.fillStyle=laser.color;ctx.beginPath();ctx.arc(x,y,6,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;laserTimer=setTimeout(draw,100);}
  }
  function applyMark(mark){if(mark.tool==='clear')marks=[];else if(mark.tool==='pen'){marks.push(mark);marks=marks.slice(-160);}else laser={...mark,at:Date.now()};draw();}
  function point(event){const rect=bounds();if(!rect)return null;const box=canvas.getBoundingClientRect(),x=(event.clientX-box.left-rect.x)/rect.w,y=(event.clientY-box.top-rect.y)/rect.h;return x>=0&&x<=1&&y>=0&&y<=1?{x,y}:null;}
  mouse=window.PCRPhoneMouse.create({canvas,button:mouseButton,ready:()=>owner&&tool==='control'&&control.canControl&&control.mouseSupported&&capture?.generation===displayedGeneration,point,sendPointer,sendGesture:sendControl,busy:()=>!!controlPending,status:message=>{status.textContent=message;},onRelease:()=>{controlTouch=null;}});
  function mark(event,force=false){const p=point(event);if(!p||!(owner?watching:stream||nativeSharing))return;const now=Date.now();if(!force&&now-lastSent<35)return;lastSent=now;const value={type:'mark',tool,points:tool==='pen'&&lastPoint?[lastPoint,p]:[p,p],color:owner?'#66e6bc':'#82b7ff'};lastPoint=p;applyMark(value);send(value);}
  canvas.addEventListener('pointerdown',event=>{
    if(tool==='control'&&window.PCRHoldControl&&!window.PCRHoldControl.can('phone')){event.preventDefault();event.stopImmediatePropagation();return;}
    if(tool!=='control')return;event.preventDefault();event.stopImmediatePropagation();const p=mouse.point(event);if(!p||!control.canControl||controlPending||capture?.generation!==displayedGeneration)return;
    controlTouch={point:p,at:performance.now(),button:event.button,id:event.pointerId};if(!mouse.locked)canvas.setPointerCapture(event.pointerId);
  },true);
  canvas.addEventListener('pointermove',event=>{if(tool==='control'){event.preventDefault();event.stopImmediatePropagation();}},true);
  canvas.addEventListener('pointerup',event=>{
    if(tool!=='control')return;event.preventDefault();event.stopImmediatePropagation();const start=controlTouch;controlTouch=null;const p=mouse.point(event);if(!start||start.id!==event.pointerId||!p)return;
    const elapsed=performance.now()-start.at;
    if(Math.hypot(p.x-start.point.x,p.y-start.point.y)>.015)sendControl({action:'swipe',points:[start.point,p],duration:Math.max(100,Math.min(1500,Math.round(elapsed)))});
    else sendControl({action:start.button===2||elapsed>500?'longpress':'tap',points:[p]});
  },true);
  canvas.addEventListener('contextmenu',event=>{if(tool==='control')event.preventDefault();});canvas.addEventListener('pointercancel',()=>{controlTouch=null;});
  canvas.addEventListener('pointerdown',event=>{if(event.button!==0)return;dragging=true;lastPoint=null;canvas.setPointerCapture(event.pointerId);mark(event,true);});canvas.addEventListener('pointermove',event=>{if(dragging)mark(event);});const end=event=>{if(dragging)mark(event,true);dragging=false;lastPoint=null;};canvas.addEventListener('pointerup',end);canvas.addEventListener('pointercancel',()=>{dragging=false;lastPoint=null;});
  for(const item of dialog.querySelectorAll('[data-tool]'))item.addEventListener('click',()=>{mouse?.release();tool=item.dataset.tool;for(const other of dialog.querySelectorAll('[data-tool]'))other.setAttribute('aria-pressed',String(other===item));controlUI();});
  q('[data-clear]').addEventListener('click',()=>{const value={type:'mark',tool:'clear'};applyMark(value);send(value);});q('[data-share]').addEventListener('click',start);q('[data-stop]').addEventListener('click',()=>stop('You stopped screen sharing.'));q('[data-close]').addEventListener('click',()=>dialog.close());
  button.addEventListener('click',()=>{dialog.showModal();draw();if(owner)void connect().then(renderShares).catch(error=>{status.textContent=error.message;});else if(nativeAvailable()&&!nativeSharing)void start();});
  dialog.addEventListener('close',()=>{window.PCRHoldControl?.release();if(!owner)stop();else{send({type:'watch',id:''});watching=null;resetControl();hideFrame();}});
  new ResizeObserver(draw).observe(stage);window.addEventListener('pagehide',()=>{stop();socket?.close();});
  function authChanged(){const auth=window.PCRAuth||{},next=auth.signedIn?(auth.role==='owner'?'owner':'guest:'+auth.guestId):'';if(next===account)return;account=next;epoch++;stop();socket?.close();socket=null;dialog.close();shares=[];watching=null;owner=auth.role==='owner'&&!nativeAvailable();button.hidden=!auth.signedIn;
    q('h2').textContent=owner?'Phone control':nativeAvailable()?'Use your PC mouse':'Share your screen';q('.guestScreenHint').textContent=owner?'Control your phone with the mouse. Right-click to long-press; use the wheel to scroll.':nativeAvailable()?'Approve sharing, then open Phone control on your PC. You can open other phone apps while control is active.':'Choose a screen or window to share.';q('.guestScreenSelect').hidden=!owner;q('[data-share]').hidden=owner;
    q('[data-share]').textContent=nativeAvailable()?'Share phone screen':'Share my screen';q('.guestEyebrow').textContent='YOUR DEVICES';
    button.textContent=owner?'Phone control':nativeAvailable()?'Use PC mouse':'Share my screen';if(owner&&auth.signedIn)void connect().catch(()=>{});
  }
  window.addEventListener('pcr:auth',authChanged);authChanged();
})();
