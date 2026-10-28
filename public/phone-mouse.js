'use strict';
(() => {
  const clamp=value=>Math.max(0,Math.min(1,value));
  function wheelGesture(point,deltaX,deltaY){
    if(!point||!Number.isFinite(point.x)||!Number.isFinite(point.y)||!Number.isFinite(deltaX)||!Number.isFinite(deltaY)||(!deltaX&&!deltaY))return null;
    const horizontal=Math.abs(deltaX)>Math.abs(deltaY),delta=horizontal?deltaX:deltaY;
    const distance=Math.min(.55,Math.max(.012,Math.abs(delta)/1100)),axis=horizontal?'x':'y';
    const start={x:clamp(point.x),y:clamp(point.y)},end={...start};
    // Move a finger opposite to the requested content-scroll direction.
    start[axis]=Math.max(distance,Math.min(1-distance,start[axis]));
    end[axis]=clamp(start[axis]-Math.sign(delta)*distance);
    return {action:'swipe',points:[start,end],duration:180};
  }
  function create({canvas,button,ready,point,sendPointer,sendGesture,busy,status,onRelease}){
    let position={x:.5,y:.5},lastSent=0,pointerVisible=false,pendingWheel=null,wheelTimer=null,heartbeat=null,request=0;
    const locked=()=>document.pointerLockElement===canvas;
    const available=()=>ready()&&(!window.PCRHoldControl||window.PCRHoldControl.can('phone'));
    function emit(force=false){
      if(!available())return;
      const now=performance.now();if(!force&&now-lastSent<32)return;
      lastSent=now;pointerVisible=true;sendPointer({action:'pointer',points:[position]});
    }
    function hide(){if(pointerVisible)sendPointer({action:'hide-pointer'});pointerVisible=false;}
    function release(){
      const wasUsing=locked()||pointerVisible;
      request++;clearInterval(heartbeat);heartbeat=null;clearTimeout(wheelTimer);wheelTimer=null;pendingWheel=null;
      hide();if(locked())document.exitPointerLock?.();button.textContent='Use PC mouse';button.setAttribute('aria-pressed','false');if(wasUsing)onRelease?.();
    }
    function refresh(){
      button.disabled=!ready();if(!available()){release();return;}
      if(pendingWheel&&!busy()){const value=pendingWheel;pendingWheel=null;sendGesture(value);}
    }
    button.addEventListener('click',()=>{
      if(locked()){release();return;}if(!available())return;
      if(!canvas.requestPointerLock){status('Mouse capture is unavailable here. Click and scroll directly over the phone preview.');return;}
      const version=++request;
      try{Promise.resolve(canvas.requestPointerLock()).catch(()=>{if(version===request)status('Click and scroll over the phone preview, or try mouse mode again.');});}
      catch{status('Mouse capture was declined. Click and scroll directly over the phone preview.');}
    });
    document.addEventListener('pointerlockchange',()=>{
      if(!locked()){release();return;}
      if(!available()){release();return;}
      button.textContent='Release mouse · Esc';button.setAttribute('aria-pressed','true');canvas.focus({preventScroll:true});
      status('Mouse controls the phone. Click, drag or scroll. Press Esc to return to your PC.');emit(true);
      clearInterval(heartbeat);heartbeat=setInterval(()=>{if(available()&&locked())emit(true);else release();},1000);
    });
    canvas.addEventListener('pointermove',event=>{
      if(!available()||event.pointerType==='touch')return;
      if(locked()){
        const box=canvas.getBoundingClientRect(),scale=Math.max(240,Math.min(box.width,box.height));
        position={x:clamp(position.x+event.movementX/scale),y:clamp(position.y+event.movementY/scale)};
      }else{const next=point(event);if(!next)return;position=next;}
      emit();
    },true);
    canvas.addEventListener('pointerleave',()=>{if(!locked())hide();});
    canvas.addEventListener('wheel',event=>{
      if(!available())return;
      const here=locked()?position:point(event);if(!here)return;event.preventDefault();
      const factor=event.deltaMode===1?20:event.deltaMode===2?400:1;
      pendingWheel=wheelGesture(here,event.deltaX*factor,event.deltaY*factor);
      clearTimeout(wheelTimer);wheelTimer=setTimeout(refresh,65);
    },{passive:false});
    document.addEventListener('keydown',event=>{if(event.key==='Escape'&&locked()){event.preventDefault();event.stopImmediatePropagation();release();}},true);
    window.addEventListener('blur',release);
    document.addEventListener('visibilitychange',()=>{if(document.hidden)release();});
    window.addEventListener('pcr:hold-release',event=>{if(event.detail.scope==='phone')release();});
    window.addEventListener('pagehide',release);
    return {release,refresh,setPoint:value=>{if(Number.isFinite(value.x)&&Number.isFinite(value.y))position={x:clamp(value.x),y:clamp(value.y)};},point:event=>locked()?position:point(event),get locked(){return locked();}};
  }
  if(typeof module==='object'&&module.exports)module.exports={wheelGesture};
  else window.PCRPhoneMouse={create,wheelGesture};
})();
