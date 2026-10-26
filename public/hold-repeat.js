'use strict';
// Repetition is limited to reversible adjustment/navigation controls. Each
// repetition goes through the original click handler and its permission gate.
(()=>{
  let held=null,timer=null,generated=false,suppressed=null;
  function target(node){const button=node?.closest?.('button');if(!button||button.disabled)return null;
    if(button.matches('[data-remote-key="8"],#rsZoomIn,#rsZoomOut,[data-a="volup"],[data-a="voldown"]'))return button;
    return /^key (8|33|34|35|36|37|38|39|40|46)$/.test(button.dataset.remoteCommand||'')?button:null;
  }
  function stop(){clearTimeout(timer);timer=null;if(held?.repeated)suppressed={button:held.button,until:performance.now()+700};held?.button.classList.remove('holdRepeating');held=null;}
  function tick(){if(!held||document.hidden||!held.button.isConnected||held.button.closest('[hidden],.hide,[data-pcr-denied="true"]')){stop();return;}
    if(!held.button.disabled&&(!held.button.matches('[data-remote-key],[data-remote-command]')||(!typeBusy&&!qb&&!qq.length&&!live.keys.length))){generated=true;held.repeated=true;held.button.classList.add('holdRepeating');held.button.click();generated=false;}
    if(held)timer=setTimeout(tick,held.button.matches('[data-a]')?180:110);
  }
  document.addEventListener('pointerdown',event=>{if(event.button!==0||event.isPrimary===false)return;const button=target(event.target);if(!button)return;stop();suppressed=null;event.preventDefault();held={button,id:event.pointerId,x:event.clientX,y:event.clientY,repeated:false};button.setPointerCapture?.(event.pointerId);timer=setTimeout(tick,420);},true);
  document.addEventListener('pointermove',event=>{if(held&&held.id===event.pointerId&&Math.hypot(event.clientX-held.x,event.clientY-held.y)>16)stop();},true);
  for(const name of ['pointerup','pointercancel','lostpointercapture'])document.addEventListener(name,event=>{if(held?.id===event.pointerId)stop();},true);
  document.addEventListener('click',event=>{if(generated)return;if(suppressed&&performance.now()<suppressed.until&&suppressed.button.contains(event.target)){event.preventDefault();event.stopImmediatePropagation();suppressed=null;}},true);
  document.addEventListener('contextmenu',event=>{if(target(event.target))event.preventDefault();},true);
  window.addEventListener('blur',stop);window.addEventListener('pagehide',stop);window.addEventListener('pcr:page',stop);window.addEventListener('pcr:auth',stop);window.addEventListener('pcr:hold-release',stop);document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();});
  window.PCRHoldRepeat={stop};
})();
