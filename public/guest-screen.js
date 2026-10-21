'use strict';
(() => {
  const button=document.createElement('button');button.type='button';button.className='quick wide guestScreenHome';button.hidden=true;button.setAttribute('aria-haspopup','dialog');document.querySelector('.heroactions').append(button);
  const dialog=document.createElement('dialog');dialog.id='guestScreenDialog';dialog.setAttribute('aria-labelledby','guestScreenTitle');
  dialog.innerHTML='<header class="guestScreenHead"><div><span class="guestEyebrow">A SHARED VIEW</span><h2 id="guestScreenTitle">Guest screens</h2></div><button type="button" data-close aria-label="Close shared screen">✕</button></header><p class="guestScreenHint"></p><div class="guestScreenSelect"><label for="guestScreenSelect">Sharing now</label><select id="guestScreenSelect" aria-label="Choose guest screen"></select></div><div class="guestScreenStage"><video muted playsinline hidden></video><img alt="Guest shared screen" hidden><canvas aria-label="Shared screen annotation surface"></canvas><div class="guestScreenEmpty">A little space to see things together.</div></div><div class="guestScreenTools"><div class="guestDrawTools" role="group" aria-label="Annotation tool"><button type="button" data-tool="laser" aria-pressed="true">◉ Laser</button><button type="button" data-tool="pen" aria-pressed="false">✎ Draw</button><button type="button" data-clear>Clear</button></div><button type="button" data-share class="guestShareStart">Share my screen ↗</button><button type="button" data-stop hidden>Stop sharing</button></div><p class="guestScreenStatus" role="status" aria-live="polite"></p>';
  document.body.append(dialog);
  const q=selector=>dialog.querySelector(selector),video=q('video'),image=q('img'),canvas=q('canvas'),stage=q('.guestScreenStage'),ctx=canvas.getContext('2d'),select=q('select'),empty=q('.guestScreenEmpty'),status=q('.guestScreenStatus');
  let socket=null,stream=null,timer=null,owner=false,watching=null,shares=[],marks=[],laser=null,tool='laser',dragging=false,lastPoint=null,lastSent=0,frameUrl=null,frameGeneration=0,dimensions=null,epoch=0,starting=false,sending=false,account='',pendingBlob=null,decoding=false,laserTimer=null,nativePending=false,nativeSharing=false;
  const nativeAvailable=()=>typeof window.PCRAndroid?.postMessage==='function';
  const nativeSend=value=>{try{window.PCRAndroid?.postMessage(JSON.stringify(value));}catch{}};
  const send=value=>{if(nativeSharing&&value.type==='mark'){nativeSend(value);return;}if(socket?.readyState===WebSocket.OPEN&&socket.bufferedAmount<512*1024)socket.send(JSON.stringify(value));};
  if(nativeAvailable())window.PCRAndroid.onmessage=event=>{
    if(owner||!window.PCRAuth?.signedIn||window.PCRAuth.role!=='guest'||(!nativePending&&!nativeSharing))return;
    let value;try{value=JSON.parse(event.data);}catch{return;}
    if(value.type==='sharing'){nativePending=false;nativeSharing=true;starting=false;q('[data-share]').hidden=true;q('[data-stop]').hidden=false;status.textContent='Your Android screen is sharing with Serame. Use Stop sharing here or in the Android notification.';}
    else if(value.type==='frame'&&nativeSharing&&typeof value.data==='string'&&value.data.length<=1400000&&/^[A-Za-z0-9+/]+=*$/.test(value.data)&&Number.isInteger(value.width)&&Number.isInteger(value.height)&&value.width>0&&value.height>0&&value.width<=1920&&value.height<=1920){dimensions={width:value.width,height:value.height};image.src='data:image/jpeg;base64,'+value.data;image.hidden=false;empty.hidden=true;draw();}
    else if(value.type==='mark'&&nativeSharing)applyMark(value);
    else if(value.type==='stopped'){nativePending=false;nativeSharing=false;stop(value.message||'Phone screen sharing stopped.');}
  };
  function wipe(){marks=[];laser=null;draw();}
  function hideFrame(){frameGeneration++;pendingBlob=null;image.hidden=true;image.removeAttribute('src');if(frameUrl){URL.revokeObjectURL(frameUrl);frameUrl=null;}dimensions=null;empty.hidden=false;wipe();}
  function decodeFrame(){
    if(decoding||!pendingBlob||!owner||!watching)return;const blob=pendingBlob;pendingBlob=null;decoding=true;const generation=frameGeneration,current=socket,url=URL.createObjectURL(blob),decoded=new Image();
    const done=()=>{decoding=false;decodeFrame();};decoded.onload=()=>{if(generation!==frameGeneration||socket!==current){URL.revokeObjectURL(url);done();return;}if(frameUrl)URL.revokeObjectURL(frameUrl);frameUrl=url;image.src=url;image.hidden=false;empty.hidden=true;dimensions={width:decoded.naturalWidth,height:decoded.naturalHeight};draw();done();};decoded.onerror=()=>{URL.revokeObjectURL(url);done();};decoded.src=url;
  }
  function stop(message='Screen sharing is off.'){
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
      else if(value.type==='watching'){watching=value.id;marks=value.marks||[];laser=null;status.textContent='Live guest screen · laser and drawings are shared.';draw();}
      else if(value.type==='stopped'){watching=null;hideFrame();status.textContent='The guest stopped sharing.';}
      else if(value.type==='mark')applyMark(value);
    };
    current.onclose=()=>{if(socket!==current)return;socket=null;if(stream||starting)stop('Sharing disconnected. Start again to reconnect.');if(owner){shares=[];watching=null;renderShares();hideFrame();status.textContent='Connection closed. Reopen Guest screens to reconnect.';}};
    return new Promise((resolve,reject)=>{current.addEventListener('open',resolve,{once:true});current.addEventListener('error',()=>reject(Error('Could not connect to screen sharing.')),{once:true});});
  }
  function renderShares(){
    select.replaceChildren();for(const [index,share]of shares.entries()){const option=document.createElement('option');option.value=share.id;option.textContent='Guest '+(index+1)+' · Sharing';select.append(option);}select.disabled=!shares.length;
    if(watching&&shares.some(share=>share.id===watching))select.value=watching;
    else if(shares.length&&dialog.open){watching=shares[0].id;hideFrame();send({type:'watch',id:watching});}
    else{watching=null;hideFrame();}
    button.replaceChildren(document.createTextNode('Guest screens'+(shares.length?' · '+shares.length:'')));const description=document.createElement('span');description.textContent='View a guest’s shared screen and draw together';button.append(description);
  }
  select.addEventListener('change',()=>{watching=select.value;hideFrame();send({type:'watch',id:watching});});
  async function start(){
    if(starting||stream||nativeSharing||owner)return;const version=epoch;starting=true;q('[data-share]').disabled=true;
    if(nativeAvailable()){nativePending=true;q('[data-stop]').hidden=false;status.textContent='Approve Android’s screen-sharing prompt to start.';nativeSend({type:'start'});return;}
    if(!navigator.mediaDevices?.getDisplayMedia){starting=false;q('[data-share]').disabled=false;status.textContent='To share an Android phone screen, use the updated PC Remote Android app. Phone browsers do not support full-screen capture.';return;}
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
  function mark(event,force=false){const p=point(event);if(!p||!(owner?watching:stream||nativeSharing))return;const now=Date.now();if(!force&&now-lastSent<35)return;lastSent=now;const value={type:'mark',tool,points:tool==='pen'&&lastPoint?[lastPoint,p]:[p,p],color:owner?'#66e6bc':'#82b7ff'};lastPoint=p;applyMark(value);send(value);}
  canvas.addEventListener('pointerdown',event=>{if(event.button!==0)return;dragging=true;lastPoint=null;canvas.setPointerCapture(event.pointerId);mark(event,true);});canvas.addEventListener('pointermove',event=>{if(dragging)mark(event);});const end=event=>{if(dragging)mark(event,true);dragging=false;lastPoint=null;};canvas.addEventListener('pointerup',end);canvas.addEventListener('pointercancel',()=>{dragging=false;lastPoint=null;});
  for(const item of dialog.querySelectorAll('[data-tool]'))item.addEventListener('click',()=>{tool=item.dataset.tool;for(const other of dialog.querySelectorAll('[data-tool]'))other.setAttribute('aria-pressed',String(other===item));});
  q('[data-clear]').addEventListener('click',()=>{const value={type:'mark',tool:'clear'};applyMark(value);send(value);});q('[data-share]').addEventListener('click',start);q('[data-stop]').addEventListener('click',()=>stop('You stopped screen sharing.'));q('[data-close]').addEventListener('click',()=>dialog.close());
  button.addEventListener('click',()=>{dialog.showModal();draw();if(owner)void connect().then(renderShares).catch(error=>{status.textContent=error.message;});});
  dialog.addEventListener('close',()=>{if(!owner)stop();else{send({type:'watch',id:''});watching=null;hideFrame();}});
  new ResizeObserver(draw).observe(stage);window.addEventListener('pagehide',()=>{stop();socket?.close();});
  function authChanged(){const auth=window.PCRAuth||{},next=auth.signedIn?(auth.role==='owner'?'owner':'guest:'+auth.guestId):'';if(next===account)return;account=next;epoch++;stop();socket?.close();socket=null;dialog.close();shares=[];watching=null;owner=auth.role==='owner';button.hidden=!auth.signedIn;
    q('h2').textContent=owner?'Guest screens':'Share your screen';q('.guestScreenHint').textContent=owner?'Guests choose what to share. Use the laser or draw on this preview together.':'Choose a screen or window for Serame to see. No microphone or remote control is shared. Laser marks and drawings appear on this preview.';q('.guestScreenSelect').hidden=!owner;q('[data-share]').hidden=owner;
    button.textContent=owner?'Guest screens':'Share my screen';const small=document.createElement('span');small.textContent=owner?'View guest screens and draw together':'Choose a window to show Serame';button.append(small);if(owner&&auth.signedIn)void connect().catch(()=>{});
  }
  window.addEventListener('pcr:auth',authChanged);authChanged();
})();
