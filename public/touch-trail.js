'use strict';
(()=>{
  function mount(){
    const pad=document.getElementById('remoteSwipePad'),screen=document.getElementById('rs');if(!pad||!screen)return;
    const key='pcr_touch_trail',reduced=window.matchMedia?.('(prefers-reduced-motion: reduce)');
    const read=()=>{try{const value=localStorage.getItem(key);return value===null?!reduced?.matches:value==='true';}catch{return !reduced?.matches;}};
    let enabled=read(),frame=0,width=0,height=0,dpr=1;
    const traces=new Map(),duration=450,canvas=document.createElement('canvas');canvas.className='remoteTouchTrail';canvas.setAttribute('aria-hidden','true');canvas.width=canvas.height=1;pad.append(canvas);
    const context=canvas.getContext('2d',{alpha:true,desynchronized:true});if(!context){canvas.remove();return;}
    const light=()=>window.PCRAppearance?.light||document.documentElement.dataset.appearance==='light';
    const allowed=()=>enabled&&!light()&&!document.hidden&&!screen.classList.contains('hide')&&!screen.classList.contains('screenClean')&&!document.body.classList.contains('pcrMiniWindow')&&(typeof rs==='undefined'||!!rs.on);
    function stop(){if(frame)cancelAnimationFrame(frame);frame=0;traces.clear();context.clearRect(0,0,width,height);canvas.width=canvas.height=1;width=height=0;}
    function size(){const rect=pad.getBoundingClientRect();if(rect.width<=0||rect.height<=0)return null;const ratio=Math.min(2,window.devicePixelRatio||1);if(rect.width!==width||rect.height!==height||ratio!==dpr){width=rect.width;height=rect.height;dpr=ratio;canvas.width=Math.ceil(width*dpr);canvas.height=Math.ceil(height*dpr);context.setTransform(dpr,0,0,dpr,0,0);}return rect;}
    function pump(){if(!frame)frame=requestAnimationFrame(draw);}
    function draw(time){
      frame=0;if(!allowed()){stop();return;}context.clearRect(0,0,width,height);context.lineCap='round';context.lineJoin='round';
      for(const [id,points]of traces){while(points.length&&time-points[0].at>=duration)points.shift();if(!points.length){traces.delete(id);continue;}
        for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i],fade=Math.max(0,1-(time-a.at)/duration);context.strokeStyle='rgba(78,226,207,'+(fade*fade*.64)+')';context.lineWidth=(a.size+b.size)/2;context.beginPath();context.moveTo(a.x,a.y);context.lineTo(b.x,b.y);context.stroke();}
        const tip=points.at(-1),fade=Math.max(0,1-(time-tip.at)/duration);context.fillStyle='rgba(125,244,224,'+(fade*fade*.38)+')';context.beginPath();context.ellipse(tip.x,tip.y,tip.w/2,tip.h/2,0,0,Math.PI*2);context.fill();
      }
      if(traces.size)pump();
    }
    function sample(event,id=event.pointerId??1){
      if(!allowed()||event.pointerType==='mouse'||event.buttons===0&&event.pressure===0)return;
      const bounds=size();if(!bounds)return;const pressure=Number.isFinite(event.pressure)&&event.pressure>0?Math.min(1,event.pressure):.4;
      const contactWidth=event.width>2?event.width:32,contactHeight=event.height>2?event.height:contactWidth,factor=.8+pressure*.5;
      const w=Math.max(10,Math.min(80,contactWidth*factor)),h=Math.max(10,Math.min(80,contactHeight*factor));
      let points=traces.get(id);if(!points){if(traces.size>=4)traces.delete(traces.keys().next().value);traces.set(id,points=[]);}
      points.push({x:Math.max(0,Math.min(width,event.clientX-bounds.left)),y:Math.max(0,Math.min(height,event.clientY-bounds.top)),w,h,size:Math.sqrt(w*h),at:performance.now()});if(points.length>96)points.shift();pump();
    }
    // Passive decoration: pointer capture, gestures and PC input remain owned by the pad.
    for(const name of ['pointerdown','pointermove'])pad.addEventListener(name,event=>sample(event),{passive:true});
    if(!('PointerEvent'in window))for(const name of ['touchstart','touchmove'])pad.addEventListener(name,event=>{for(const touch of event.touches)sample({clientX:touch.clientX,clientY:touch.clientY,width:(touch.radiusX||16)*2,height:(touch.radiusY||16)*2,pressure:touch.force||.4},touch.identifier);},{passive:true});
    const row=document.createElement('label');row.className='devicePreference touchTrailSetting';row.innerHTML='<span><strong>Finger trail</strong><small></small></span><input type="checkbox" data-touch-trail aria-label="Fading finger trail on the touchpad">';
    (document.querySelector('.appearanceSettings')||document.getElementById('workspaceSettingsPreferences'))?.append(row);const toggle=row.querySelector('input'),hint=row.querySelector('small');
    function update(){toggle.checked=enabled;toggle.disabled=!!light();hint.textContent=light()?'Paused in Lightweight appearance.':'Fades behind your finger. Uses contact size and pressure when available.';if(!allowed())stop();}
    function set(value){enabled=!!value;try{localStorage.setItem(key,String(enabled));}catch{}update();}
    toggle.onchange=()=>set(toggle.checked);window.addEventListener('pcr:appearance',update);window.addEventListener('pcr:settings-sync',event=>{if(event.detail?.key===key){enabled=read();update();}});reduced?.addEventListener?.('change',()=>{enabled=read();update();});
    window.addEventListener('pcr:page',event=>{if(event.detail?.id!=='rs')stop();});window.addEventListener('pcr:mini-window',event=>{if(event.detail?.active)stop();});window.addEventListener('pcr:auth',()=>{if(!window.PCRAuth?.signedIn)stop();});document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();});window.addEventListener('pagehide',stop);new MutationObserver(update).observe(screen,{attributes:true,attributeFilter:['class']});
    window.PCRTouchTrail={set,get enabled(){return enabled;}};update();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
})();
