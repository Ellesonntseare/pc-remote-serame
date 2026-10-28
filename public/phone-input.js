'use strict';
(() => {
  class InputQueue {
    constructor({ready,busy,send,overflow=()=>{}}){Object.assign(this,{ready,busy,send,overflow});this.items=[];}
    clear(){this.items.length=0;}
    push(command){
      const tail=this.items.at(-1);
      if(command.action==='touch-cancel'){this.items=this.items.filter(item=>!item.action.startsWith('touch-'));this.items.unshift(command);}
      else if(command.action==='touch-move'&&tail?.action==='touch-move')this.items[this.items.length-1]=command;
      else if(command.action==='insert'&&tail?.action==='insert'&&tail.text.length+command.text.length<=256)tail.text+=command.text;
      else this.items.push(command);
      if(this.items.length>128){this.clear();this.overflow();return;}this.flush();
    }
    flush(){if(!this.items.length||!this.ready()||this.busy())return;const command=this.items.shift();if(this.send(command)===false)this.items.unshift(command);}
  }
  function create({canvas,controls,mouse,ready,busy,send,sendPointer,sendDesktop,state,point,status,upload}){
    let held=false,heldPoint=null,holdTimer=null,desktop='off',lastGrant='',grantAttempt='',wheelPixels={x:0,y:0},wheelTimer=null,dragId=null;
    let settings={side:'right',sensitivity:1,edge:false};try{settings={...settings,...JSON.parse(localStorage.getItem('pcr_phone_desk_v1')||'{}')};}catch{}
    if(!['left','right','top','bottom'].includes(settings.side))settings.side='right';settings.sensitivity=Number.isFinite(settings.sensitivity)?Math.min(3,Math.max(.3,settings.sensitivity)):1;
    const panel=document.createElement('details');panel.className='phoneDeskSettings';panel.innerHTML='<summary>Arrange phone &amp; PC</summary><div class="phoneDeskLayout" role="group" aria-label="Phone position relative to PC"><button type="button" data-side="top">Phone above</button><button type="button" data-side="left">Phone left</button><span aria-hidden="true">▣ PC</span><button type="button" data-side="right">Phone right</button><button type="button" data-side="bottom">Phone below</button></div><label class="phoneEdgeSwitch"><input type="checkbox" data-phone-edge>Move mouse across the screen edge</label><label class="phoneSpeed">Mouse speed <input type="range" min="0.3" max="3" step="0.1" data-phone-speed></label><p data-edge-status role="status">Approve phone control to enable.</p><small>Escape returns the mouse to your PC. Your PC keyboard follows the pointer onto the phone.</small>';
    controls.append(panel);const edge=panel.querySelector('[data-phone-edge]'),speed=panel.querySelector('[data-phone-speed]'),edgeStatus=panel.querySelector('[data-edge-status]');edge.checked=!!settings.edge;speed.value=settings.sensitivity;
    const queue=new InputQueue({ready,busy,send:command=>send(command,desktop==='active'),overflow:()=>{stop();status('Input stopped because the connection could not keep up. Start control again.');}});
    function save(){try{localStorage.setItem('pcr_phone_desk_v1',JSON.stringify(settings));}catch{}for(const item of panel.querySelectorAll('[data-side]'))item.setAttribute('aria-pressed',String(item.dataset.side===settings.side));}
    function clearTouch(){held=false;heldPoint=null;dragId=null;clearInterval(holdTimer);holdTimer=null;clearTimeout(wheelTimer);wheelTimer=null;wheelPixels={x:0,y:0};}
    function cancel(){const touching=held;clearTouch();queue.clear();if(touching&&ready())queue.push({action:'touch-cancel'});}
    function stop(){cancel();mouse.release();sendPointer({action:'hide-pointer'});if(desktop!=='off')sendDesktop({type:'desktop-stop'});desktop='off';}
    function startDesktop(){
      const current=state();if(!ready()||!current.advancedInput||!current.desktopAvailable)return;
      mouse.release();cancel();grantAttempt=current.id;sendDesktop({type:'desktop-start',side:settings.side,sensitivity:settings.sensitivity});edgeStatus.textContent='Starting screen-edge switching…';
    }
    function refresh(){
      const current=state();edge.disabled=!current.canControl||!current.advancedInput||!current.desktopAvailable;
      panel.hidden=!current.canControl;
      if(current.id!==lastGrant){lastGrant=current.id||'';clearTouch();queue.clear();desktop='off';}
      if(!current.canControl){clearTouch();queue.clear();desktop='off';edgeStatus.textContent='Approve phone control to enable.';return;}
      if(settings.edge&&current.id!==grantAttempt&&ready()&&!edge.disabled)startDesktop();
      if(!current.advancedInput)edgeStatus.textContent='Install the latest APK for screen-edge switching and direct typing.';
      queue.flush();
    }
    for(const item of panel.querySelectorAll('[data-side]'))item.onclick=()=>{settings.side=item.dataset.side;save();if(desktop!=='off')startDesktop();};
    speed.onchange=()=>{settings.sensitivity=Number(speed.value);save();if(desktop!=='off')startDesktop();};
    edge.onchange=()=>{settings.edge=edge.checked;save();if(settings.edge)startDesktop();else stop();};save();
    function begin(p){if(!ready()||!p||held)return;held=true;heldPoint=p;queue.push({action:'touch-start',points:[p]});holdTimer=setInterval(()=>{if(held&&heldPoint&&ready())queue.push({action:'touch-move',points:[heldPoint]});},250);}
    function move(p){if(!held||!p||!ready())return;heldPoint=p;queue.push({action:'touch-move',points:[p]});}
    function end(p){if(!held)return;const last=p||heldPoint;clearTouch();if(last&&ready())queue.push({action:'touch-end',points:[last]});}
    function wheel(p,dx,dy){
      if(!ready()||!p||held)return;wheelPixels.x=Math.max(-1200,Math.min(1200,wheelPixels.x+dx));wheelPixels.y=Math.max(-1200,Math.min(1200,wheelPixels.y+dy));
      clearTimeout(wheelTimer);wheelTimer=setTimeout(()=>{
        const value=window.PCRPhoneMouse.wheelGesture(p,wheelPixels.x,wheelPixels.y);wheelPixels={x:0,y:0};
        if(value){const tail=queue.items.at(-1);if(tail?.action==='swipe')queue.items[queue.items.length-1]=value;else queue.push(value);queue.flush();}
      },24);
    }
    function keyboard(event){
      if(!ready()||event.isComposing||event.key==='Escape')return false;
      const modifiers=(event.shiftKey?1:0)|((event.ctrlKey||event.metaKey)?2:0)|(event.altKey?4:0);
      if(event.key.length===1&&!event.ctrlKey&&!event.metaKey&&!event.altKey)queue.push({action:'insert',text:event.key});
      else if(['Enter','Backspace','Delete','Tab','ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End','PageUp','PageDown'].includes(event.key)||modifiers&2&&['a','c','x','v','z','y'].includes(event.key.toLowerCase()))queue.push({action:'key',key:event.key.length===1?event.key.toLowerCase():event.key,modifiers});
      else return false;event.preventDefault();event.stopImmediatePropagation();return true;
    }
    canvas.addEventListener('pointerdown',event=>{if(!state().advancedInput||!ready())return;event.preventDefault();event.stopImmediatePropagation();const p=point(event);if(!p)return;canvas.focus({preventScroll:true});if(event.button===2)queue.push({action:'longpress',points:[p]});else if(event.button===0){dragId=event.pointerId;begin(p);if(!mouse.locked)canvas.setPointerCapture?.(event.pointerId);}},true);
    canvas.addEventListener('pointermove',event=>{if(!state().advancedInput||!held)return;event.preventDefault();event.stopImmediatePropagation();move(point(event));},true);
    canvas.addEventListener('pointerup',event=>{if(!state().advancedInput)return;event.preventDefault();event.stopImmediatePropagation();if(dragId===event.pointerId)end(point(event));},true);
    canvas.addEventListener('pointercancel',cancel,true);
    canvas.addEventListener('wheel',event=>{if(!state().advancedInput||!ready())return;const p=point(event);if(!p)return;event.preventDefault();event.stopImmediatePropagation();const scale=event.deltaMode===1?20:event.deltaMode===2?400:1;wheel(p,event.deltaX*scale,event.deltaY*scale);},{passive:false,capture:true});
    canvas.addEventListener('keydown',keyboard,true);
    canvas.addEventListener('compositionend',event=>{if(ready()&&event.data){for(let i=0;i<event.data.length;i+=256)queue.push({action:'insert',text:event.data.slice(i,i+256)});}});
    canvas.addEventListener('dragover',event=>{if(upload&&state().canControl&&event.dataTransfer?.types.includes('Files')){event.preventDefault();canvas.parentElement.classList.add('phoneFileDrop');event.dataTransfer.dropEffect='copy';}});
    canvas.addEventListener('dragleave',()=>canvas.parentElement.classList.remove('phoneFileDrop'));
    canvas.addEventListener('drop',event=>{if(!upload)return;event.preventDefault();canvas.parentElement.classList.remove('phoneFileDrop');const files=Array.from(event.dataTransfer?.files||[]);if(files.length)void upload(files);});
    window.addEventListener('blur',()=>{if(desktop==='off')cancel();});
    document.addEventListener('visibilitychange',()=>{if(document.hidden&&desktop==='off')cancel();});
    return {refresh,stop,cancel,rotate:()=>{clearTouch();queue.clear();},result:ok=>{if(!ok){cancel();sendDesktop({type:'desktop-release'});}else queue.flush();},get external(){return desktop==='active';},get armed(){return desktop!=='off';},desktopState(value){
      const previous=desktop;desktop=value.state;edgeStatus.textContent=desktop==='active'?'Mouse and keyboard control your phone · Esc to return':desktop==='armed'?'Ready · move past the '+settings.side+' edge of your PC screen':value.message||'Screen-edge switching is off.';
      if(previous==='active'&&desktop!=='active'){cancel();sendPointer({action:'hide-pointer'});}
    },native(event){if(!state().advancedInput||!ready())return;
      const p={x:event.x,y:event.y};switch(event.kind){
        case 'pointer':mouse.setPoint(p);sendPointer({action:'pointer',points:[p]});break;
        case 'drag':mouse.setPoint(p);sendPointer({action:'pointer',points:[p]});move(p);break;
        case 'down':begin(p);break;case 'up':end(p);break;case 'longpress':queue.push({action:'longpress',points:[p]});break;
        case 'wheel':wheel(p,event.deltaX,event.deltaY);break;
        case 'text':queue.push({action:'insert',text:event.text});break;
        case 'key':queue.push({action:'key',key:event.key,modifiers:event.modifiers});break;
      }
    }};
  }
  if(typeof module==='object'&&module.exports)module.exports={InputQueue};else window.PCRPhoneInput={create,InputQueue};
})();
