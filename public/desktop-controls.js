'use strict';
(() => {
  const canvas=document.getElementById('rsc');
  const screen=document.getElementById('rs');
  const view=document.getElementById('rsv');
  const input=document.getElementById('typeText');
  if(!canvas||!screen||!view||!input)return;
  const hint=document.createElement('div');
  hint.id='desktopKeyboardHint';
  hint.className='desktopKeyboardHint';
  hint.innerHTML='<span>Click the picture, then type. Ctrl+V pastes the PC clipboard.</span><button type="button">Keyboard / clipboard</button>';
  view.before(hint);
  hint.querySelector('button').addEventListener('click',()=>rsKb());
  canvas.addEventListener('focus',()=>{hint.dataset.active='true';});
  canvas.addEventListener('blur',()=>{hint.dataset.active='false';});
  const special={Backspace:8,Tab:9,Enter:13,Escape:27,ArrowLeft:37,ArrowUp:38,ArrowRight:39,ArrowDown:40,Delete:46,Home:36,End:35,PageUp:33,PageDown:34,Insert:45,Pause:19,PrintScreen:44,ScrollLock:145};
  const punctuation={Semicolon:186,Equal:187,Comma:188,Minus:189,Period:190,Slash:191,Backquote:192,BracketLeft:219,Backslash:220,BracketRight:221,Quote:222};
  function virtualKey(event){
    if(special[event.key])return special[event.key];
    const extra={CapsLock:20,NumLock:144,ContextMenu:93,MetaLeft:91,MetaRight:92,NumpadMultiply:106,NumpadAdd:107,NumpadSubtract:109,NumpadDecimal:110,NumpadDivide:111,NumpadEnter:13};
    if(extra[event.code]||extra[event.key])return extra[event.code]||extra[event.key];
    if(/^Numpad[0-9]$/.test(event.code))return 96+Number(event.code.slice(6));
    if(/^F([1-9]|1\d|2[0-4])$/.test(event.key))return 111+Number(event.key.slice(1));
    if(/^Key[A-Z]$/.test(event.code))return event.code.charCodeAt(3);
    if(/^Digit[0-9]$/.test(event.code))return event.code.charCodeAt(5);
    if(punctuation[event.code])return punctuation[event.code];
    if(event.key===' ')return 32;
    if(/^[a-z0-9]$/i.test(event.key))return event.key.toUpperCase().charCodeAt(0);
    return null;
  }
  function mayControl(){
    if(window.PCRHoldControl&&!window.PCRHoldControl.can('pc'))return false;
    if(window.PCRCanAccess&&!window.PCRCanAccess('control'))return false;
    return document.activeElement===canvas&&rs.on&&!screen.classList.contains('hide')&&
      document.getElementById('rsSettings').classList.contains('hide')&&
      !document.getElementById('modal').classList.contains('on')&&
      !document.querySelector('dialog[open]');
  }
  function ensureHardwareContext(){
    if(!rs.m)return;
    // A deliberate hardware key starts a fresh context, without replaying a
    // paused draft whose delivery may be uncertain.
    if(!liveTyping||live.paused){
      if(input.value)window.PCRAccountWorkspace?.set('drafts.compose',input.value);
      rsResetTypingContext(false);liveTyping=true;
    }
  }
  function typeCharacter(character){
    if(!rs.m)return;ensureHardwareContext();
    if(input.value.length+character.length>16000){
      msg('Start a new field or use compose mode for a longer message.');return;
    }
    input.value+=character;
    input.setSelectionRange(input.value.length,input.value.length);
    rsScheduleLive();
  }
  canvas.addEventListener('keydown',event=>{
    if(!mayControl())return;
    if(['Control','Alt','Shift'].includes(event.key))return;
    if(event.key==='Meta'){event.preventDefault();if(!event.repeat)metaKey=virtualKey(event)||91;return;}
    if(event.isComposing||event.key==='Process'||event.key==='Dead'){
      event.preventDefault();rsKb();
      rsTypeStatus('Use this typing field for language input and composition.');return;
    }
    const altGraph=event.getModifierState?.('AltGraph');
    ensureHardwareContext();
    const chord=(event.ctrlKey||event.altKey||event.metaKey)&&!altGraph;
    const vk=virtualKey(event);
    if(chord){
      metaKey=null;
      if(vk===null)return;
      event.preventDefault();
      const keys=[];
      if(event.ctrlKey)keys.push(17);
      if(event.altKey)keys.push(18);
      if(event.metaKey)keys.push(91);
      if(event.shiftKey)keys.push(16);
      keys.push(vk);
      if(keys.length>4){msg('This shortcut has too many modifiers.');return;}
      void rsQueueRemoteCommand('combo '+keys.join(','));return;
    }
    if(event.key==='Enter'&&event.shiftKey){event.preventDefault();void rsQueueRemoteCommand('combo 16,13');return;}
    if(event.key==='Backspace'||event.key==='Enter'){
      event.preventDefault();void rsTypeKey(special[event.key]);
      // Keep hardware keys on the canvas without touching the phone editor.
      return;
    }
    if((vk!==null&&(special[event.key]||['CapsLock','NumLock','ContextMenu'].includes(event.key)))||/^F([1-9]|1\d|2[0-4])$/.test(event.key)){
      event.preventDefault();
      const command=event.shiftKey?'combo 16,'+vk:'key '+vk;
      void rsQueueRemoteCommand(command);return;
    }
    if(Array.from(event.key).length===1){event.preventDefault();typeCharacter(event.key);}
  });
  let metaKey=null;
  canvas.addEventListener('keyup',event=>{if(event.key!=='Meta')return;const key=metaKey;metaKey=null;if(key&&mayControl()){event.preventDefault();qc('key '+key);}});
  canvas.addEventListener('blur',()=>{metaKey=null;});
  window.PCRDesktopControls={virtualKey};
})();

// A separate relative touch surface leaves the picture clear while controlling.
(()=>{
  function mountDock(){
    const view=document.getElementById('rsv'),screen=document.getElementById('rs');if(!view||!screen)return;
    const dock=document.createElement('section');dock.id='remoteSwipeDock';dock.className='remoteSwipeDock';dock.setAttribute('aria-label','Mouse trackpad');
    dock.innerHTML='<div class="remoteSwipeDockHeader"></div><div class="remoteSwipeSurfaces"><div id="remoteSwipePad" class="remoteSwipePad" tabindex="0" role="application" aria-label="Mouse trackpad. Swipe to move, tap to click, hold to drag. Two fingers scroll or tap to right-click. Arrow keys move the pointer."><span class="dockGrip" aria-hidden="true"></span><i class="dockContact" aria-hidden="true"></i></div><div id="remoteScrollRail" class="remoteScrollRail" tabindex="0" role="application" aria-label="Scroll the PC screen. Swipe up or down with one finger. Use arrow keys to scroll; Page Up and Page Down for larger steps."><svg class="remoteScrollArrow" viewBox="0 0 16 16" aria-hidden="true"><path d="m4 10 4-4 4 4"/></svg><span class="remoteScrollTrack" aria-hidden="true"><i class="remoteScrollThumb"></i></span><svg class="remoteScrollArrow" viewBox="0 0 16 16" aria-hidden="true"><path d="m4 6 4 4 4-4"/></svg></div></div>';
    view.after(dock);const pad=dock.querySelector('.remoteSwipePad'),rail=dock.querySelector('.remoteScrollRail'),points=new Map();let state=null,holdTimer=null,rx=0,ry=0,padBounds=null,railPointer=null,wheelRemainder=0,railTimer=null;
    const mayPoint=()=>rs.on&&rs.m&&!screen.classList.contains('hide')&&!document.hidden&&rsCanPoint();
    const clicks=document.createElement('div');clicks.className='dockMouseButtons';
    for(const side of ['l','r']){const button=document.createElement('button');button.type='button';button.className='dockMouseButton';button.dataset.mouseButton=side;button.setAttribute('aria-label',side==='l'?'Left mouse click':'Right mouse click');const selected=side==='l'?'M5 11V9a7 7 0 0 1 7-7v9Z':'M12 2a7 7 0 0 1 7 7v2h-7Z';button.innerHTML='<svg viewBox="0 0 24 28" aria-hidden="true"><path class="mouseShell" d="M12 2a7 7 0 0 1 7 7v9a7 7 0 0 1-14 0V9a7 7 0 0 1 7-7Z"/><path class="mouseSelected" d="'+selected+'"/><path class="mouseSplit" d="M12 2v9M5 11h14"/><path class="mouseWheel" d="M12 6v2"/></svg><span>'+(side==='l'?'Left':'Right')+'</span>';button.addEventListener('click',()=>{if(!mayPoint()){if(window.PCRHoldControl&&!window.PCRHoldControl.can('pc'))msg('Hold to control.');return;}qc('click '+side);});clicks.append(button);}dock.insertBefore(clicks,dock.querySelector('.remoteSwipeSurfaces'));
    const options=document.createElement('details');options.id='remoteOptions';options.className='remoteOptions';options.innerHTML='<summary aria-label="Remote options" title="Remote options" aria-expanded="false"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M5 12h14M5 17h14"/></svg></summary><div class="remoteOptionsPanel"><strong>Remote options</strong></div>';
    const menu=options.querySelector('.remoteOptionsPanel'),bar=screen.querySelector('.rsbot');for(const button of bar.querySelectorAll('button'))if(["qc('click l')","qc('click r')"].includes(button.getAttribute('onclick')))button.remove();menu.append(bar,document.getElementById('rsk'));document.querySelector('.screenTools').append(options);
    const quickKeys=document.createElement('div');quickKeys.className='dockQuickKeys';quickKeys.setAttribute('aria-label','Keyboard and common keys');quickKeys.addEventListener('mousedown',event=>event.preventDefault());
    quickKeys.setAttribute('aria-label','Everyday remote controls');quickKeys.append(document.getElementById('rsKeyboard'));
    for(const [key,label,title]of [[13,'Enter','Send Enter to the PC'],[8,'Backspace','Send Backspace to the PC']]){const button=document.createElement('button');button.type='button';button.className='dockDirectKey';button.dataset.remoteKey=key;button.textContent=label;button.title=title;button.setAttribute('aria-label',title);button.addEventListener('click',()=>{if(rs.on&&rs.m&&(!window.PCRHoldControl||window.PCRHoldControl.can('pc'))&&(!window.PCRCanAccess||window.PCRCanAccess('control')))void rsTypeKey(key);});quickKeys.append(button);}
    const files=bar.querySelector('[data-files-button]'),fullscreen=document.getElementById('rsFullscreen');if(files)quickKeys.append(files);if(fullscreen)quickKeys.append(fullscreen);dock.append(quickKeys);
    const keyPaths={keyboard:'M3 6h18v12H3ZM7 10h1m3 0h1m3 0h1M7 14h10',enter:'M19 5v9H5m5-5-5 5 5 5',backspace:'m9 5-7 7 7 7h12V5ZM12 9l6 6m0-6-6 6',file:'M4 5h6l2 3h8v11H4Z',fullscreen:'M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5'};
    for(const button of quickKeys.children){const glyph=button.id==='rsKeyboard'?'keyboard':button.dataset.remoteKey==='13'?'enter':button.dataset.remoteKey==='8'?'backspace':button===files?'file':'fullscreen',label=button===files?'Files':button===fullscreen?'Fullscreen':button.textContent;button.replaceChildren();button.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="'+keyPaths[glyph]+'"/></svg>';const copy=document.createElement('span');copy.textContent=label;button.append(copy);}
    // Advanced actions share one place. Move controls intact to preserve their
    // listeners and permission gates; everyday actions have no duplicate here.
    const keys=document.getElementById('rsk'),keyToggle=document.getElementById('keyToggle');if(keyToggle){bar.append(keyToggle);keyToggle.setAttribute('aria-controls','rsk');const syncKeys=()=>keyToggle.setAttribute('aria-expanded',String(!keys.classList.contains('hide')));new MutationObserver(syncKeys).observe(keys,{attributes:true,attributeFilter:['class']});syncKeys();}menu.append(keys);
    const viewTools=document.createElement('div');viewTools.className='remoteAdvancedView';const viewGroup=document.querySelector('.screenViewGroup');if(viewGroup)viewTools.append(viewGroup);const quality=document.getElementById('rsq');if(quality)viewTools.append(quality);menu.insertBefore(viewTools,bar);
    options.querySelector('summary').setAttribute('aria-label','Advanced remote tools');options.querySelector('summary').insertAdjacentHTML('beforeend','<span>Tools</span>');
    function syncQuickKeys(){const denied=!!window.PCRCanAccess&&!window.PCRCanAccess('control');for(const button of quickKeys.querySelectorAll('#rsKeyboard,[data-remote-key]'))button.dataset.pcrDenied=String(denied);}window.addEventListener('pcr:auth',syncQuickKeys);syncQuickKeys();
    options.addEventListener('toggle',()=>options.querySelector('summary').setAttribute('aria-expanded',String(options.open)));menu.addEventListener('click',event=>{const button=event.target.closest('button');if(button&&!viewTools.contains(button)&&!button.matches('[data-remote-command]')&&!['keyToggle','rsm'].includes(button.id))options.open=false;});
    document.addEventListener('pointerdown',event=>{if(options.open&&!options.contains(event.target))options.open=false;});document.addEventListener('keydown',event=>{if(event.key==='Escape'&&options.open){options.open=false;options.querySelector('summary').focus({preventScroll:true});event.preventDefault();}});
    function releaseRail(){clearTimeout(railTimer);railTimer=null;railPointer=null;wheelRemainder=0;rail.classList.remove('active');rail.style.removeProperty('--scroll-thumb');}
    function release(){clearTimeout(holdTimer);holdTimer=null;if(state?.drag)qc('up l');state=null;points.clear();rx=0;ry=0;padBounds=null;pad.classList.remove('active','dragging');releaseRail();}
    function contact(event){const rect=padBounds;pad.style.setProperty('--pad-x',Math.max(0,Math.min(rect.width,event.clientX-rect.left))+'px');pad.style.setProperty('--pad-y',Math.max(0,Math.min(rect.height,event.clientY-rect.top))+'px');}
    function scroll(delta,horizontal=false){if(!Number.isFinite(delta))return;wheelRemainder+=delta;const amount=Math.trunc(wheelRemainder);wheelRemainder-=amount;if(amount)qc((horizontal?'hwheel ':'wheel ')+Math.max(-9999,Math.min(9999,amount)));}
    function wheel(event){event.preventDefault();if(!mayPoint()){release();return;}const horizontal=Math.abs(event.deltaX)>Math.abs(event.deltaY);scroll(horizontal?event.deltaX*(event.deltaMode===1?16:event.deltaMode===2?screen.clientWidth||800:1):window.PCRTouchGestures?.wheelDelta(event,screen.clientHeight)||-event.deltaY,horizontal);}
    pad.addEventListener('pointerdown',event=>{
      event.preventDefault();if(!mayPoint())return;if(![0,2].includes(event.button))return;
      if(railPointer)return;padBounds=padBounds||pad.getBoundingClientRect();pad.setPointerCapture?.(event.pointerId);points.set(event.pointerId,{x:event.clientX,y:event.clientY});contact(event);pad.classList.add('active');
      if(points.size===1){state={at:performance.now(),x:event.clientX,y:event.clientY,startX:event.clientX,startY:event.clientY,moved:false,drag:false,multi:false,right:event.button===2};rx=0;ry=0;
        if(!state.right)holdTimer=setTimeout(()=>{if(state&&!state.moved&&!state.multi&&points.size===1&&mayPoint()){state.drag=true;qc('down l');pad.classList.add('dragging');}},450);
      }else if(points.size===2&&state){clearTimeout(holdTimer);if(state.drag){qc('up l');state.moved=true;}state.drag=false;state.multi=true;state.y=Array.from(points.values()).reduce((sum,p)=>sum+p.y,0)/2;state.scrollStart=state.y;state.scroll=0;state.scrolling=false;pad.classList.remove('dragging');}
      else release();
    });
    pad.addEventListener('pointermove',event=>{
      if(!points.has(event.pointerId)||!state)return;event.preventDefault();if(!mayPoint()){release();return;}
      const old=points.get(event.pointerId);points.set(event.pointerId,{x:event.clientX,y:event.clientY});contact(event);
      if(state.multi){if(points.size!==2)return;const [first,second]=points.values(),y=(first.y+second.y)/2;if(!state.scrolling&&Math.abs(y-state.scrollStart)<4)return;state.scrolling=true;state.scroll+=(y-state.y)*4;state.y=y;state.moved=true;if(Math.abs(state.scroll)>=1){const amount=Math.trunc(state.scroll);state.scroll-=amount;qc('wheel '+Math.max(-9999,Math.min(9999,amount)));}return;}
      if(!state.moved&&Math.hypot(event.clientX-state.startX,event.clientY-state.startY)>3){state.moved=true;clearTimeout(holdTimer);}if(!state.moved)return;
      const dx=event.clientX-old.x,dy=event.clientY-old.y;const gain=rs.m.w/Math.max(320,padBounds.width)*(1+Math.min(Math.hypot(dx,dy),30)/30)*sens;
      const movement=window.PCRPrecisionLens?.scaleMovement(dx*gain,dy*gain)||{dx:dx*gain,dy:dy*gain};rx+=movement.dx;ry+=movement.dy;const x=Math.trunc(rx),y=Math.trunc(ry);rx-=x;ry-=y;if(x||y)qc('mv '+x+' '+y);
    });
    pad.addEventListener('pointerup',event=>{if(!points.has(event.pointerId))return;event.preventDefault();points.delete(event.pointerId);clearTimeout(holdTimer);if(points.size)return;const ended=state;if(!ended?.drag&&ended&&!ended.moved&&performance.now()-ended.at<350&&mayPoint())qc('click '+(ended.multi||ended.right?'r':'l'));release();});
    for(const name of ['pointercancel','lostpointercapture'])pad.addEventListener(name,event=>{if(points.has(event.pointerId))release();});
    pad.addEventListener('contextmenu',event=>event.preventDefault());pad.addEventListener('wheel',wheel,{passive:false});
    pad.addEventListener('keydown',event=>{const directions={ArrowLeft:[-8,0],ArrowRight:[8,0],ArrowUp:[0,-8],ArrowDown:[0,8]};if(!directions[event.key]&&!['Enter',' '].includes(event.key))return;event.preventDefault();if(!mayPoint())return;const direction=directions[event.key];if(direction)qc('mv '+direction[0]+' '+direction[1]);else qc('click l');});
    rail.addEventListener('pointerdown',event=>{event.preventDefault();if(event.button!==0||railPointer||points.size||!mayPoint())return;rail.setPointerCapture?.(event.pointerId);const bounds=rail.getBoundingClientRect(),fraction=bounds.height?(event.clientY-bounds.top)/bounds.height:.5;railPointer={id:event.pointerId,startX:event.clientX,x:event.clientX,startY:event.clientY,y:event.clientY,axis:null,moved:false,repeated:false,step:fraction<.3?120:fraction>.7?-120:0};wheelRemainder=0;rail.classList.add('active');const repeat=()=>{if(!railPointer||railPointer.moved||!mayPoint())return;if(railPointer.step){railPointer.repeated=true;scroll(railPointer.step);railTimer=setTimeout(repeat,140);}};if(railPointer.step)railTimer=setTimeout(repeat,420);});
    rail.addEventListener('pointermove',event=>{if(railPointer?.id!==event.pointerId)return;event.preventDefault();if(!mayPoint()){releaseRail();return;}const dx=event.clientX-railPointer.startX,dy=event.clientY-railPointer.startY;if(!railPointer.axis){if(Math.hypot(dx,dy)<3)return;railPointer.axis=Math.abs(dx)>Math.abs(dy)?'x':'y';clearTimeout(railTimer);railTimer=null;}railPointer.moved=true;const horizontal=railPointer.axis==='x';scroll(horizontal?-(event.clientX-railPointer.x)*4:(event.clientY-railPointer.y)*4,horizontal);railPointer.x=event.clientX;railPointer.y=event.clientY;rail.dataset.axis=railPointer.axis;rail.style.setProperty('--scroll-thumb',Math.max(-12,Math.min(12,dy/3))+'px');});
    for(const name of ['pointerup','pointercancel','lostpointercapture'])rail.addEventListener(name,event=>{if(railPointer?.id===event.pointerId){event.preventDefault();if(name==='pointerup'&&!railPointer.moved&&!railPointer.repeated&&mayPoint())scroll(railPointer.step);releaseRail();}});
    rail.addEventListener('contextmenu',event=>event.preventDefault());rail.addEventListener('wheel',wheel,{passive:false});
    rail.setAttribute('aria-label','Scroll the PC screen. Swipe up, down, left or right with one finger. Arrow keys also scroll.');rail.title='Swipe to scroll. Hold the top or bottom arrow to keep scrolling.';
    rail.addEventListener('keydown',event=>{const steps={ArrowUp:120,ArrowDown:-120,PageUp:720,PageDown:-720,ArrowLeft:-120,ArrowRight:120};if(!steps[event.key])return;event.preventDefault();if(mayPoint())scroll(steps[event.key],event.key==='ArrowLeft'||event.key==='ArrowRight');});
    window.addEventListener('pcr:page',event=>{if(event.detail?.id!=='rs')release();});
    window.addEventListener('blur',release);window.addEventListener('pcr:auth',()=>{release();options.open=false;});window.addEventListener('pcr:hold-release',event=>{if(event.detail.scope==='pc')release();});document.addEventListener('visibilitychange',()=>{if(document.hidden)release();});new MutationObserver(()=>{if(screen.classList.contains('hide')){release();options.open=false;}}).observe(screen,{attributes:true,attributeFilter:['class']});
    const hold=document.querySelector('.holdControlButton[data-hold-scope=pc]');if(hold)dock.querySelector('.remoteSwipeDockHeader').append(hold);
    window.PCRSwipeDock={release};
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mountDock,{once:true});else mountDock();
})();

// Optional input clutch. It is a user interaction preference, not an access grant.
(()=>{
  function mount(){
    let enabled=false;try{enabled=localStorage.getItem('pcr_hold_control')==='true';}catch{}
    const pressed=new Set(),touchIds=new Set(),buttons=[],choices=[];let shift=false;
    const allowed=scope=>!enabled||shift||pressed.has(scope);
    function notify(scope){window.dispatchEvent(new CustomEvent('pcr:hold-release',{detail:{scope}}));}
    function sync(){
      for(const input of choices)input.checked=enabled;
      for(const{scope,button}of buttons){button.hidden=!enabled||(scope==='phone'?window.PCRAuth?.role!=='owner':!window.PCRCanAccess?.('control'));const active=enabled&&allowed(scope);button.classList.toggle('holding',active);button.setAttribute('aria-pressed',String(active));button.textContent=active?'Control active':'Hold to control';}
    }
    function release(scope){if(pressed.delete(scope)){if(!shift)notify(scope);sync();}}
    function releaseAll(){const active=[...pressed];if(shift)active.push('pc','phone');pressed.clear();shift=false;for(const scope of new Set(active))notify(scope);sync();}
    function preference(parent){if(!parent)return;const label=document.createElement('label');label.className='holdPreference';const input=document.createElement('input');input.type='checkbox';input.addEventListener('change',()=>{const next=input.checked;releaseAll();enabled=next;if(enabled)for(const scope of ['pc','phone'])notify(scope);try{localStorage.setItem('pcr_hold_control',String(enabled));}catch{}sync();});choices.push(input);label.append(input,document.createTextNode('Hold-to-control'));parent.append(label);}
    function button(scope,parent){if(!parent)return;const b=document.createElement('button');b.type='button';b.className='holdControlButton';b.dataset.holdScope=scope;b.title='Hold this button or the Shift key to send input.';b.setAttribute('aria-label','Hold to control');
      b.addEventListener('pointerdown',event=>{if(event.button!==0)return;event.preventDefault();event.stopPropagation();b.setPointerCapture?.(event.pointerId);pressed.add(scope);sync();});
      for(const event of ['pointerup','pointercancel','lostpointercapture'])b.addEventListener(event,()=>release(scope));
      b.addEventListener('blur',()=>release(scope));
      b.addEventListener('touchstart',event=>{for(const touch of event.changedTouches)touchIds.add(touch.identifier);},{passive:true});
      b.addEventListener('keydown',event=>{if(event.key===' '||event.key==='Enter'){event.preventDefault();pressed.add(scope);sync();}});b.addEventListener('keyup',event=>{if(event.key===' '||event.key==='Enter'){event.preventDefault();release(scope);}});b.addEventListener('contextmenu',event=>event.preventDefault());parent.append(b);buttons.push({scope,button:b});return b;
    }
    preference(document.querySelector('#rsSettings .controlSheet'));const phone=document.querySelector('.phoneControlTools');preference(phone);button('pc',document.querySelector('.remoteSwipeDockHeader')||document.getElementById('rs'));button('phone',phone);
    document.addEventListener('keydown',event=>{if(enabled&&event.key==='Shift'&&!shift){shift=true;sync();}},true);
    document.addEventListener('keyup',event=>{if(event.key==='Shift'&&shift){shift=false;for(const scope of ['pc','phone'])if(!pressed.has(scope))notify(scope);sync();}},true);
    for(const event of ['touchend','touchcancel'])document.addEventListener(event,event=>{for(const touch of event.changedTouches)touchIds.delete(touch.identifier);},{capture:true,passive:true});
    window.addEventListener('blur',releaseAll);document.addEventListener('visibilitychange',()=>{if(document.hidden)releaseAll();});window.addEventListener('pcr:auth',()=>{releaseAll();sync();});
    window.addEventListener('pcr:settings-sync',event=>{if(event.detail?.key!=='pcr_hold_control')return;let next=false;try{next=localStorage.getItem('pcr_hold_control')==='true';}catch{}if(next!==enabled){releaseAll();enabled=next;sync();}});
    window.addEventListener('pcr:hold-release',event=>{
      if(event.detail.scope!=='pc'||!rs.on)return;
      if(g){clearTimeout(g.lp);if(g.dr)qc('up l');g=null;}releaseMouse();qq=qq.filter(command=>/^up [lrm]$/.test(command));
      if(rsTypingDirty())rsPauseLive('Control released. Select the PC field and tap New field to resume typing.');
    });
    window.PCRHoldControl={attach:(scope,parent)=>{const b=button(scope,parent);sync();return b;},can:allowed,touches:event=>Array.from(event.touches||[]).filter(touch=>!touchIds.has(touch.identifier)),release:releaseAll};sync();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
})();

// Dashboard layout uses the existing feature buttons and their permission gates.
(()=>{
  function mountDashboard(){
    const app=document.querySelector('.app'),hero=document.querySelector('.hero'),grid=document.querySelector('.heroactions');if(!app||!hero||!grid)return;
    const paths={screen:'<rect x="3" y="4" width="26" height="19" rx="3"/><path d="M11 29h10M16 23v6M13 10l9 4-4 2-2 5Z"/>',monitor:'<rect x="3" y="4" width="26" height="19" rx="3"/><path d="M11 29h10M16 23v6"/>',power:'<path d="M16 3v12M9 7a12 12 0 1 0 14 0"/>',file:'<path d="M9 3h10l6 6v20H9Z M19 3v7h6M13 15h8M13 20h8M13 25h5"/>',guest:'<rect x="12" y="4" width="17" height="16" rx="2"/><path d="M18 25h8M22 20v5"/><circle cx="9" cy="16" r="4"/><path d="M2 29v-3a7 7 0 0 1 14 0v3"/>',audio:'<path d="M4 12h5l7-6v20l-7-6H4Z M21 10a9 9 0 0 1 0 12M25 6a15 15 0 0 1 0 20"/>',video:'<rect x="3" y="7" width="19" height="19" rx="3"/><path d="m22 13 7-4v17l-7-4M10 12l7 5-7 5Z"/>',collaborate:'<path d="M26 14c0 6-5 10-12 10H6l-4 4v-9C-2 8 8 2 18 5c5 1 8 5 8 9ZM27 17c6 4 3 12-3 12h-5l-4-4"/>',devices:'<rect x="2" y="4" width="20" height="16" rx="2"/><path d="M8 26h8M12 20v6"/><rect x="23" y="14" width="7" height="15" rx="1"/>',chat:'<path d="M27 14c0 6-5 10-12 10H8l-5 4V18C-1 8 8 2 18 5c6 1 9 5 9 9Z"/>',person:'<circle cx="16" cy="9" r="6"/><path d="M4 29v-3a12 12 0 0 1 24 0v3Z"/>'};
    const icon=name=>'<svg viewBox="0 0 32 32" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'+(paths[name]||paths.screen)+'</svg>';
    function tile(button,name,title,description){if(!button)return;button.dataset.dashboardTile=name;const glyph=document.createElement('span');glyph.className='dashboardTileIcon';glyph.innerHTML=icon(name);const copy=document.createElement('span');copy.className='dashboardTileCopy';const strong=document.createElement('strong');strong.textContent=title;copy.append(strong);if(description){const small=document.createElement('small');small.textContent=description;copy.append(small);}button.replaceChildren(glyph,copy);}
    app.classList.add('referenceDashboard');document.querySelector('.brandtext>span').textContent='remote.teamtrader.co.za';
    const connected=document.createElement('div');connected.className='connectedSummary';const device=document.createElement('div');device.className='connectedDeviceIcon';device.innerHTML=icon('monitor');const copy=document.createElement('div');copy.className='connectedDeviceCopy';copy.append(hero.querySelector('.eyebrow'),document.getElementById('name'),hero.querySelector('.online'));copy.querySelector('.eyebrow').textContent='Connected to:';connected.append(device,copy);hero.prepend(connected);
    for(const old of grid.querySelectorAll(':scope>.quick:not(.wide)'))old.remove();
    const screen=document.getElementById('screenBtn'),audio=document.getElementById('pcAudioHome'),video=document.getElementById('webrtcVideoHome'),files=grid.querySelector('.filesHome'),guest=grid.querySelector('.guestScreenHome');const extras=Array.from(grid.children);const devices=extras.find(button=>button.textContent.startsWith('Devices')),collaborate=extras.find(button=>button.textContent.startsWith('Collaborate'));
    tile(screen,'screen','Remote screen');tile(audio,'audio','PC audio','Listen to your PC');tile(video,'video','Live video','Connect to your PC');tile(files,'file','Files & text','Send files and text');tile(devices,'devices','Devices','Wake a PC · continue a session');tile(collaborate,'collaborate','Collaborate','Voice & whiteboard');
    const drawer=document.getElementById('powerDrawer');drawer.open=true;const power=document.createElement('button');power.type='button';power.className='quick wide dashboardPowerTile';power.setAttribute('aria-controls','powerDrawer');power.setAttribute('aria-expanded',String(drawer.open));tile(power,'power','Power controls');const arrow=document.createElement('i');arrow.className='dashboardPowerChevron';arrow.textContent='⌄';power.append(arrow);power.addEventListener('click',()=>{drawer.open=!drawer.open;if(drawer.open)drawer.scrollIntoView?.({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'nearest'});});drawer.addEventListener('toggle',()=>power.setAttribute('aria-expanded',String(drawer.open)));grid.append(power);
    const audioStack=document.createElement('div');audioStack.className='dashboardAudioStack';if(audio)audioStack.append(audio);if(video)audioStack.append(video);grid.append(audioStack);
    const stats=document.querySelector('.stats'),statsHeading=stats.previousElementSibling;if(statsHeading?.matches('.section'))stats.prepend(statsHeading);stats.classList.add('dashboardStatus');
    for(const [index,stat]of Array.from(stats.querySelectorAll('.stat')).entries()){if(index>1)continue;const ring=document.createElement('div');ring.className='dashboardRing';ring.id=index?'memoryDial':'cpuDial';ring.setAttribute('role','img');ring.setAttribute('aria-label',index?'Memory usage':'CPU usage');const value=document.createElement('div');value.className='dashboardStatCopy';value.append(stat.querySelector('.statlabel'),stat.querySelector('.statvalue'));stat.prepend(ring,value);}
    const media=document.querySelector('.mediaWrap'),mediaHeading=media.previousElementSibling,activity=document.querySelector('.activity'),activityHeading=activity.previousElementSibling;const main=document.getElementById('main');drawer.after(media,activity);if(mediaHeading?.matches('.section'))media.prepend(mediaHeading);if(activityHeading?.matches('.section'))activityHeading.remove();activity.querySelector('.activityHead strong').textContent='Activity history';drawer.classList.add('dashboardPower');
    const labels={prev:'Prev',playpause:'Play/Pause',next:'Next',voldown:'Volume down',mute:'Mute',volup:'Volume up'};const marks={prev:'|◀',playpause:'▶',next:'▶|',voldown:'↓',mute:'◈',volup:'◖'};for(const button of media.querySelectorAll('[data-a]')){const action=button.dataset.a;button.replaceChildren();const mark=document.createElement('span');mark.className='mediaGlyph';mark.setAttribute('aria-hidden','true');mark.textContent=marks[action];const label=document.createElement('small');label.textContent=labels[action];button.append(mark,label);if(action==='volup'||action==='voldown')button.title='Change PC volume by 1%';}
    const powerGlyphs={shutdown:'⏻',restart:'↻',sleep:'☾',lock:'▣',logoff:'⇥'};for(const button of drawer.querySelectorAll('.power [data-a]')){if(powerGlyphs[button.dataset.a])button.querySelector('.ico').textContent=powerGlyphs[button.dataset.a];}
    function auth(){const native=typeof window.PCRAndroid?.postMessage==='function',owner=window.PCRAuth?.role==='owner';app.classList.toggle('guestDashboard',window.PCRAuth?.role==='guest');tile(guest,'guest',native?'PC mouse on phone':owner?'Phone control':'Share screen',native?'Use your PC mouse and keyboard in other phone apps':owner?'Control your phone':'Share your display');power.dataset.pcrDenied=String(!window.PCRCanAccess?.('power'));window.PCRGuestAccess?.applyPermissions();}
    function updateStats(data){for(const [id,key,label]of [['cpuDial','cpu','CPU'],['memoryDial','mem','Memory']]){const ring=document.getElementById(id);if(!ring)continue;const percent=Number.isFinite(data[key])?Math.max(0,Math.min(100,data[key])):0;ring.style.setProperty('--usage',percent+'%');ring.setAttribute('aria-label',label+' '+(Number.isFinite(data[key])?percent+'%':'unavailable'));}}
    window.PCRDashboard={updateStats,icon};window.addEventListener('pcr:auth',auth);window.addEventListener('pcr:native-ready',auth);auth();updateStats({cpu:parseFloat(document.getElementById('t-cpu').textContent),mem:parseFloat(document.getElementById('t-mem').textContent)});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mountDashboard,{once:true});else mountDashboard();
})();

// Decorative login motion never receives input or runs behind a signed-in screen.
(()=>{
  const gate=document.getElementById('pairGate');if(!gate)return;const ambient=document.createElement('div');ambient.className='loginAmbient';ambient.setAttribute('aria-hidden','true');
  const orbs=[[7,14,5,13],[16,32,8,19],[29,8,4,17],[68,18,6,22],[88,11,5,15],[94,42,8,20],[9,69,6,16],[25,88,9,24],[46,78,5,18],[71,91,7,21],[85,71,5,14],[59,49,4,23],[3,47,5,20],[79,36,6,17]];
  for(const [index,[x,y,size,duration]]of orbs.entries()){const orb=document.createElement('i');orb.style.cssText='--orb-x:'+x+'%;--orb-y:'+y+'%;--orb-size:'+size+'px;--orb-time:'+duration+'s;--orb-delay:-'+index*1.7+'s;--orb-drift:'+(index%2?-1:1)+';';ambient.append(orb);}gate.prepend(ambient);
  const pause=()=>ambient.classList.toggle('paused',document.hidden||gate.classList.contains('hide'));document.addEventListener('visibilitychange',pause);new MutationObserver(pause).observe(gate,{attributes:true,attributeFilter:['class']});pause();
})();

// Page layouts share a navigation language while retaining their live controls.
(()=>{
  const local={key:'<circle cx="10" cy="16" r="7"/><path d="M17 16h13M25 16v5M21 16v4M7 16h1"/>',gear:'<path d="m13 3-1 4-4 2-4-1-2 5 3 3-1 4 4 4 4-1 3 3 5-2v-4l3-3-1-5-4-1-2-4Z"/><circle cx="14" cy="15" r="5"/>',keyboard:'<rect x="2" y="6" width="28" height="21" rx="3"/><path d="M7 12h2m4 0h2m4 0h2m4 0h1M7 17h2m4 0h2m4 0h2m4 0h1M8 22h16"/>',pointer:'<path d="M6 3v25l7-7 5 9 5-3-5-8 10-2Z"/>',phone:'<rect x="8" y="2" width="16" height="28" rx="3"/><path d="M13 6h6M14 26h4"/>',image:'<rect x="3" y="3" width="26" height="26" rx="3"/><circle cx="11" cy="11" r="3"/><path d="m4 25 8-8 5 5 5-8 7 11"/>'};
  function icon(name){return local[name]?'<svg viewBox="0 0 32 32" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">'+local[name]+'</svg>':window.PCRDashboard?.icon(name)||'';}
  function badge(name,className='pageSymbol'){const node=document.createElement('span');node.className=className;node.setAttribute('aria-hidden','true');node.innerHTML=icon(name);return node;}
  function heading(dialog,name){const head=dialog.querySelector('.nativeDialogHead,.filesHeader,.guestDialogHead,.guestScreenHead,header');if(!head||head.querySelector('.pageHeading'))return;const content=head.firstElementChild;if(!content)return;const wrap=document.createElement('div');wrap.className='pageHeading';head.prepend(wrap);wrap.append(badge(name),content);head.classList.add('workspacePageHeader');}
  const pageIcons={filesDialog:'file',guestApprovalDialog:'guest',guestScreenDialog:'monitor',webrtcVideoDialog:'video',sessionTools:'devices',collaborationDialog:'collaborate',screenTextDialog:'file',imageClipboardDialog:'image',pcAppsDialog:'devices',pcAudioDialog:'audio',filePreviewDialog:'file'};
  function decorate(dialog){if(!dialog||!pageIcons[dialog.id])return;dialog.classList.add('workspacePage');heading(dialog,pageIcons[dialog.id]);}
  for(const dialog of document.querySelectorAll('dialog'))decorate(dialog);
  const files=document.getElementById('filesDialog');if(files){files.querySelector('#filesTitle>span')?.remove();for(const [id,name]of [['filesTab','file'],['textTab','keyboard']])document.getElementById(id)?.prepend(badge(name,'tabSymbol'));
    const pane=document.getElementById('filesPane'),library=document.createElement('section');library.className='filesLibrary workspaceCard';for(const selector of ['.filesListHeader','.filesSearch','#filesList','#filesFolderPath']){const element=pane.querySelector(selector);if(element)library.append(element);}pane.append(library);const drop=document.getElementById('filesDrop');drop.querySelector('.filesUploadIcon').innerHTML=icon('file');drop.querySelector('strong').textContent='Send a file';drop.querySelector('strong+span').textContent='Drag it here or choose from your device';
    const preview=files.querySelector('.filesTextIntro');if(preview){preview.classList.add('textWorkspaceIntro');preview.querySelector('span').innerHTML=icon('keyboard');preview.querySelector('h3').textContent='Your clipboard, connected';preview.querySelector('p').textContent='Copy between devices or save a note.';}const actions=files.querySelector('.clipboardActions');if(actions){actions.classList.add('clipboardActionCards');for(const button of actions.querySelectorAll('button'))button.prepend(badge(/Get|from PC/i.test(button.textContent)?'monitor':'file','actionSymbol'));}
  }
  const devices=document.getElementById('sessionTools');if(devices){devices.classList.add('deviceWorkspace');for(const[index,section]of Array.from(devices.querySelectorAll(':scope>section')).entries()){section.classList.add('workspaceCard',index?'handoffWorkspace':'wakeWorkspace');section.prepend(badge(index?'devices':'power','workspaceCardSymbol'));}devices.querySelector('[data-wake]')?.classList.add('workspacePrimary');devices.querySelector('[data-create]')?.classList.add('workspacePrimary');}
  const collaboration=document.getElementById('collaborationDialog');if(collaboration){collaboration.querySelector('.voiceCard').prepend(badge('audio','voiceAvatar'));collaboration.querySelector('.boardCard').classList.add('workspaceCard');}
  const audio=document.getElementById('pcAudioDialog');if(audio){const console=document.createElement('section');console.className='audioConsole workspaceCard';console.append(badge('audio','audioConsoleSymbol'));for(const selector of ['.nativeAudioStatus','.nativeVolume','.nativeAudioActions']){const item=audio.querySelector(selector);if(item)console.append(item);}audio.append(console);}
  const apps=document.getElementById('pcAppsDialog');if(apps&&window.PCRHoldControl){const hold=window.PCRHoldControl.attach('pc',apps);hold?.classList.add('pageHoldControl');}
  const controls=document.querySelector('#rsSettings .controlSheet');if(controls){controls.classList.add('workspaceControls');const head=controls.querySelector('.controlHead');head?.firstElementChild?.prepend(badge('gear','settingsSymbol'));}
  function install(){const dialog=document.getElementById('installHelp');if(!dialog||!dialog.querySelector('#installHelpTitle')||dialog.querySelector('.installWorkspace'))return;dialog.classList.add('workspacePage');const title=dialog.querySelector('#installHelpTitle'),paragraphs=Array.from(dialog.querySelectorAll(':scope>p')),close=dialog.querySelector(':scope>button');const hero=document.createElement('header');hero.className='installWorkspace';hero.append(badge('phone','installPhoneSymbol'),title);const steps=document.createElement('section');steps.className='installWorkspaceSteps';for(const[index,paragraph]of paragraphs.entries()){const row=document.createElement('div');row.className='installWorkspaceStep';const number=document.createElement('b');number.textContent=index+1;row.append(number,paragraph);steps.append(row);}dialog.replaceChildren(hero,steps,...close?[close]:[]);}
  const installDialog=document.getElementById('installHelp');if(installDialog)new MutationObserver(install).observe(installDialog,{childList:true});install();new MutationObserver(records=>{for(const record of records)for(const node of record.addedNodes)if(node.nodeType===1&&node.matches('dialog'))decorate(node);}).observe(document.body,{childList:true});
  const bar=document.querySelector('.rsbot');function menu(){if(!bar)return;if(!bar.querySelector('.menuGroupTitle'))for(const [order,label]of [[9,'Pointer & keyboard'],[19,'System & presentation'],[29,'External actions & files']]){const title=document.createElement('div');title.className='menuGroupTitle';title.style.order=order;title.dataset.group=order<29?'controls':'tools';title.textContent=label;bar.append(title);}for(const button of bar.querySelectorAll(':scope>button')){const label=button.textContent.trim();button.style.order=/Trackpad|Touch/i.test(label)?10:/Keyboard/i.test(label)?11:/Lens/i.test(label)?12:/keys/i.test(label)?20:/Controls/i.test(label)?21:/Present/i.test(label)?22:/Audio/i.test(label)?30:/Apps/i.test(label)?31:/Devices/i.test(label)?32:/Files/i.test(label)?33:34;if(button.querySelector('.menuTileIcon'))continue;const name=/keyboard/i.test(label)?'keyboard':/keys/i.test(label)?'key':/control/i.test(label)?'gear':/trackpad|touch|lens/i.test(label)?'pointer':/audio/i.test(label)?'audio':/files|text/i.test(label)?'file':/devices|apps/i.test(label)?'devices':'screen';const copy=document.createElement('span');copy.className='menuTileLabel';copy.textContent=label;button.replaceChildren(badge(name,'menuTileIcon'),copy);}bar.classList.add('workspaceMenuGrid');}menu();if(bar)new MutationObserver(menu).observe(bar,{childList:true,subtree:true});
})();

