'use strict';
(()=>{
 const screen=document.getElementById('rs');if(!screen)return;let gesture=null,hold=null;
 const touches=e=>window.PCRHoldControl?.touches(e)||Array.from(e.touches||[]);
 const consume=e=>{e.preventDefault();e.stopImmediatePropagation();};
 function cancel(){clearTimeout(hold);hold=null;if(gesture?.drag)window.qc?.('up l');gesture=null;}
 screen.addEventListener('touchstart',e=>{
  if(!screen.classList.contains('screenClean')||e.target.closest?.('button,input,select,textarea,label,dialog,.ecPadSizing'))return;
  const points=touches(e);if(!gesture){const box=window.PCRScreenTools?.imageBox(),p=points[0];if(!box||!p||typeof rs==='undefined'||!rs.m||!window.rsCanPoint?.())return;const viewport=screen.getBoundingClientRect(),right=viewport.width?viewport.right:window.innerWidth;const scroll=!!e.target.closest?.('.fullscreenScroll')||p.clientX>box.x+box.w||p.clientX>=right-64;if(!scroll&&p.clientX>=box.x&&p.clientX<=box.x+box.w&&p.clientY>=box.y&&p.clientY<=box.y+box.h)return;gesture={scroll,x:p.clientX,y:p.clientY,startX:p.clientX,startY:p.clientY,at:Date.now(),moved:false,multi:false,drag:false,rx:0,ry:0,gain:Math.min(4,rs.m.w/box.w)};hold=setTimeout(()=>{if(gesture&&!gesture.scroll&&!gesture.moved&&!gesture.multi){gesture.drag=true;window.qc?.('down l');}},500);}
  consume(e);if(points.length>=3){cancel();window.PCRScreenTools?.restoreControls();return;}
  if(points.length===2){cancel();}
 },{capture:true,passive:false});
 screen.addEventListener('touchmove',e=>{if(!gesture)return;consume(e);const points=touches(e);if(!points.length)return;if(!window.rsCanPoint?.()){cancel();return;}if(gesture.scroll){gesture.ry+=(points[0].clientY-gesture.y)*4;gesture.y=points[0].clientY;const delta=Math.trunc(gesture.ry);gesture.ry-=delta;if(delta){gesture.moved=true;window.qc?.('wheel '+Math.max(-9999,Math.min(9999,delta)));}return;}if(gesture.multi){if(points.length<2)return;const y=(points[0].clientY+points[1].clientY)/2;gesture.ry+=(y-gesture.y)*4;gesture.y=y;const delta=Math.trunc(gesture.ry);gesture.ry-=delta;if(delta){gesture.moved=true;window.qc?.('wheel '+Math.max(-9999,Math.min(9999,delta)));}return;}const p=points[0],dx=p.clientX-gesture.x,dy=p.clientY-gesture.y;gesture.x=p.clientX;gesture.y=p.clientY;if(!gesture.moved&&Math.hypot(p.clientX-gesture.startX,p.clientY-gesture.startY)<4)return;gesture.moved=true;clearTimeout(hold);gesture.rx+=dx*gesture.gain;gesture.ry+=dy*gesture.gain;const x=Math.trunc(gesture.rx),y=Math.trunc(gesture.ry);gesture.rx-=x;gesture.ry-=y;if(x||y)window.qc?.('mv '+x+' '+y);},{capture:true,passive:false});
 screen.addEventListener('touchend',e=>{if(!gesture)return;consume(e);if(touches(e).length)return;const value=gesture;cancel();if(!value.scroll&&!value.drag&&!value.moved&&Date.now()-value.at<500)window.qc?.(value.multi?'click r':'click l');},{capture:true,passive:false});
 screen.addEventListener('touchcancel',e=>{if(gesture){consume(e);cancel();}},{capture:true,passive:false});
 new MutationObserver(()=>{if(!screen.classList.contains('screenClean'))cancel();}).observe(screen,{attributes:true,attributeFilter:['class']});window.addEventListener('blur',cancel);window.addEventListener('pagehide',cancel);
})();
