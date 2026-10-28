'use strict';
(()=>{
  function mount(){
    const screen=document.getElementById('rs'),view=document.getElementById('rsv'),group=document.querySelector('.remoteAdvancedView')||document.querySelector('.rsbot')||document.querySelector('.screenViewGroup');if(!screen||!view||!group)return;
    const button=document.createElement('button');button.type='button';button.id='rsMinimise';button.textContent='Minimise';button.title='Keep the PC screen in a floating window';button.setAttribute('aria-label','Minimise to floating window');button.hidden=true;group.append(button);
    let saved=null,timer=0,active=false,lastState='',backgroundTimer=0,backgroundExpired=false;
    const eligible=()=>available()&&typeof rs!=='undefined'&&!!rs.on&&(!!rs.m||active)&&!screen.classList.contains('hide')&&!document.querySelector('dialog[open]');
    const available=()=>!!window.PCRNativeCapabilities?.miniWindow&&!!window.PCRAuth?.signedIn&&(!window.PCRCanAccess||window.PCRCanAccess('screen'));
    function restore(message=''){
      clearTimeout(timer);clearTimeout(backgroundTimer);backgroundTimer=0;timer=0;active=false;document.body.classList.remove('pcrMiniWindow');
      const previous=saved;saved=null;if(previous)requestAnimationFrame(()=>{window.PCRScreenTools?.setZoom(previous.zoom,{precise:true});view.scrollLeft=previous.left;view.scrollTop=previous.top;});
      if(message)window.msg?.(message);
    }
    function prepare(){
      if(saved)return;
      saved={zoom:(parseFloat(document.getElementById('rsZoomReset')?.textContent)||100)/100,left:view.scrollLeft,top:view.scrollTop};
      window.PCRPointerSafety?.release?.();window.rsTypeClose?.();document.body.classList.add('pcrMiniWindow');view.scrollLeft=0;view.scrollTop=0;
    }
    function minimise(){
      if(!available()||typeof rs==='undefined'||!rs.on||!rs.m||screen.classList.contains('hide')||saved)return;
      prepare();
      timer=setTimeout(()=>restore('The floating window could not open. Check Picture-in-picture in Android app settings.'),4000);
      try{window.PCRAndroid.postMessage(JSON.stringify({type:'minimise',width:rs.m.w,height:rs.m.h}));}catch{restore('The floating window needs the updated Android app.');}
    }
    function background(){if(!window.PCRNativeCapabilities?.homeMiniWindow&&!saved||backgroundExpired||!eligible())return false;if(active)return true;prepare();if(!backgroundTimer)backgroundTimer=setTimeout(()=>{backgroundExpired=true;restore();window.dispatchEvent(new Event('pcr:mini-background'));},1800);return true;}
    button.addEventListener('click',minimise);
    window.addEventListener('pcr:mini-window',event=>{if(event.detail?.active){prepare();clearTimeout(timer);clearTimeout(backgroundTimer);backgroundTimer=0;timer=0;active=true;backgroundExpired=false;}else{restore(event.detail?.message);if(document.hidden){backgroundExpired=true;window.dispatchEvent(new Event('pcr:mini-background'));}}update();});
    function update(){button.hidden=!available();if(!available()&&saved)restore();if(!window.PCRNativeCapabilities?.homeMiniWindow)return;const ready=eligible();const state=JSON.stringify({type:'mini-window-state',active:!!ready,width:ready?(rs.m?.w||16):16,height:ready?(rs.m?.h||9):9});if(state!==lastState){lastState=state;window.PCRAndroid?.postMessage(state);}}
    for(const event of ['pcr:auth','pcr:native-ready'])window.addEventListener(event,update);
    window.addEventListener('pcr:page',event=>{if(event.detail?.id!=='rs')restore();update();});window.addEventListener('pagehide',()=>{restore();if(window.PCRNativeCapabilities?.homeMiniWindow)window.PCRAndroid?.postMessage(JSON.stringify({type:'mini-window-state',active:false}));});document.addEventListener('visibilitychange',()=>{if(!document.hidden){backgroundExpired=false;clearTimeout(backgroundTimer);backgroundTimer=0;if(saved&&!active)restore();}update();});
    new MutationObserver(update).observe(screen,{attributes:true,attributeFilter:['class']});const status=document.getElementById('screenConnection');if(status)new MutationObserver(update).observe(status,{attributes:true,attributeFilter:['data-state']});
    window.PCRMiniWindow={minimise,prepare,update,background,get keepAlive(){return !!(window.PCRNativeCapabilities?.homeMiniWindow||saved||active)&&!backgroundExpired&&eligible();},get active(){return active;}};update();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
})();
