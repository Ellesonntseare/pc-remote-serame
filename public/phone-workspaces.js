'use strict';
(()=>{
 function mountTransparency(){
  const settings=document.getElementById('workspaceSettings');if(!settings||settings.querySelector('.remoteTransparencySettings'))return;
  const card=document.createElement('section');card.className='workspaceSettingsCard remoteTransparencySettings';card.innerHTML='<h3>Floating Remote control</h3><label>Opacity <output data-opacity-value>100%</output><input type="range" min="40" max="100" step="5" value="100" data-overlay-opacity aria-label="Floating control opacity"></label><label class="remoteFadeChoice"><input type="checkbox" data-overlay-fade>Fade when idle</label><p>Fade the floating mode icon after three seconds without touching it. Touch it to restore your chosen opacity.</p>';
  (settings.querySelector('[data-settings-section=appearance] .settingsGroupContent')||settings).append(card);
  const root=document.documentElement,slider=card.querySelector('[data-overlay-opacity]'),fade=card.querySelector('[data-overlay-fade]'),output=card.querySelector('output');let timer=null,prefs={opacity:100,idleFade:false};
  const key=()=> 'pcr_remote_overlay:'+location.origin+':'+(window.PCRAuth?.workspaceId||(window.PCRAuth?.role==='guest'?'guest:'+window.PCRAuth.guestId:'owner'));
  function wake(){clearTimeout(timer);root.classList.remove('remoteOverlayIdle');if(!window.PCRAuth?.signedIn||!prefs.idleFade)return;timer=setTimeout(()=>{const rail=document.querySelector('.ecRemoteRail');if(!rail||!rail.getBoundingClientRect().width)return;if(rail.querySelector(':focus-visible')||rail.classList.contains('ecRailDragging')||rail.querySelector('[aria-expanded=true]')){wake();return;}root.classList.add('remoteOverlayIdle');},3000);}
  function render(){root.style.setProperty('--remote-overlay-opacity',String(prefs.opacity/100));slider.value=String(prefs.opacity);output.value=prefs.opacity+'%';fade.checked=prefs.idleFade;card.hidden=!window.PCRAuth?.signedIn;wake();}
  function load(){clearTimeout(timer);prefs={opacity:100,idleFade:false};if(window.PCRAuth?.signedIn)try{const saved=JSON.parse(localStorage.getItem(key())||'null');if(saved&&Number.isFinite(saved.opacity))prefs.opacity=Math.max(40,Math.min(100,saved.opacity));prefs.idleFade=saved?.idleFade===true;}catch{}render();}
  function save(){if(!window.PCRAuth?.signedIn)return;try{localStorage.setItem(key(),JSON.stringify(prefs));}catch{}render();}
  slider.oninput=()=>{prefs.opacity=Number(slider.value);save();};fade.onchange=()=>{prefs.idleFade=fade.checked;save();};
  for(const type of ['pointerdown','pointermove','pointerenter','focusin'])document.addEventListener(type,event=>{if(event.target.closest?.('.ecRemoteRail'))wake();},true);
  document.addEventListener('focusout',event=>{if(event.target.closest?.('.ecRemoteRail'))wake();});document.addEventListener('visibilitychange',wake);window.addEventListener('pcr:page',wake);window.addEventListener('pcr:auth',load);window.addEventListener('pagehide',()=>clearTimeout(timer));load();
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(mountTransparency,0),{once:true});else setTimeout(mountTransparency,0);
})();
(()=>{
 function mount(){
  if(window.PCRPhoneWorkspaces)return;
  const presentation=window.PCRWindowPresentation,page=document.getElementById('windowPresentation');
  const presets=document.createElement('dialog');presets.id='phoneWorkspacePresets';presets.className='workspacePage phoneWorkspacePresets';
  presets.innerHTML='<header><div><small>YOUR PHONE</small><h2>Workspace presets</h2></div><button type="button" data-close>Back</button></header><p>Choose a workspace or save your current controls. Presets stay on this device for this account and PC.</p><div data-builtins></div><h3>Saved workspaces</h3><div data-saved></div><form><label>Save current workspace<input name="name" maxlength="32" required placeholder="For example: My typing layout"></label><button>Save current</button></form><p data-status role="status"></p>';
  document.body.append(presets);const q=s=>presets.querySelector(s);let saved=[];
  const allowed=()=>window.PCRAuth?.signedIn&&window.PCRAuth.role==='owner';
  const storageKey=()=> 'elleson_phone_presets_v1:'+location.origin+':'+(window.PCRAuth?.workspaceId||'owner');
  const builtins=[{name:'Mouse control',mode:'mouse',quality:4,sensitivity:1,cursor:110},{name:'Typing',mode:'keyboard',quality:4,sensitivity:.8,cursor:120},{name:'Files',mode:'files',quality:4},{name:'Second screen',mode:'second',quality:4}];
  function say(text){q('[data-status]').textContent=text;}
  function load(){try{const value=JSON.parse(localStorage.getItem(storageKey())||'[]');saved=Array.isArray(value)?value.filter(v=>v&&typeof v.name==='string'&&v.name.length<=32&&['mouse','keyboard','files','second'].includes(v.mode)).slice(0,8):[];}catch{saved=[];}}
  function persist(){try{localStorage.setItem(storageKey(),JSON.stringify(saved));return true;}catch{say('Device storage is full. This workspace could not be saved.');return false;}}
  function capture(name){return{name,mode:window.PCRSecondScreen?.active?'second':window.PCRPages?.current==='filesDialog'?'files':document.getElementById('rs')?.classList.contains('typing')?'keyboard':'mouse',quality:typeof rs!=='undefined'?rs.qi:4,sensitivity:typeof sens!=='undefined'?sens:1,cursor:window.PCRCursor?.getSize(),split:window.PCRWorkspaceSplit?.get(),rail:window.PCRRemoteMode?.getPosition(),layout:window.PCRWorkspace?.getLayout(),second:Object.fromEntries(['side','orientation','quality'].map(key=>[key,document.querySelector('#secondScreenPage [data-'+key+']')?.value]))};}
  function apply(value){
   if(!allowed())return;
   if(typeof rsTypingDirty==='function'&&rsTypingDirty()){say('Finish or pause typing before applying a workspace.');return;}
   if(window.PCRSecondScreen?.active){say('Disconnect the second screen before changing workspaces.');return;}
   if(Number.isInteger(value.quality)&&value.quality>=0&&value.quality<=4){localStorage.setItem('pcr_q',String(value.quality));if(typeof rs!=='undefined')rs.qi=value.quality;}
   if(Number.isFinite(value.sensitivity)&&value.sensitivity>=.3&&value.sensitivity<=3){localStorage.setItem('pcr_sensitivity',String(value.sensitivity));if(typeof sens!=='undefined')sens=value.sensitivity;const input=document.getElementById('sensitivity');if(input)input.value=value.sensitivity;}
   if(Number.isFinite(value.cursor))window.PCRCursor?.setSize(value.cursor);
   if(value.split)window.PCRWorkspaceSplit?.set(value.split);
   if(value.layout)window.PCRWorkspace?.setLayout(value.layout);
   if(value.rail)window.PCRRemoteMode?.setPosition(value.rail);
   presets.close();
   if(value.mode==='second'){for(const [key,setting]of Object.entries(value.second||{})){if(!['side','orientation','quality'].includes(key))continue;const field=document.querySelector('#secondScreenPage [data-'+key+']');if(field&&[...field.options].some(option=>option.value===setting)){field.value=setting;field.dispatchEvent(new Event('change'));}}window.PCRSecondScreen?.open();return;}
   if(value.mode==='files'){window.EllesonFlow?.navigate('files');window.PCRFileManager?.setView('details');return;}
   window.EllesonFlow?.navigate('remote');if(typeof rs!=='undefined'&&rs.on)window.rsRun?.();
   window.PCRRemoteMode?.select(value.mode==='keyboard'?'keyboard':'mouse');
  }
  function render(){q('[data-builtins]').replaceChildren();q('[data-saved]').replaceChildren();for(const [list,items]of [[q('[data-builtins]'),builtins],[q('[data-saved]'),saved]])for(const value of items){const row=document.createElement('div');row.className='phonePresetRow';const use=document.createElement('button');use.type='button';use.textContent=value.name;use.onclick=()=>apply(value);row.append(use);if(items===saved){const remove=document.createElement('button');remove.type='button';remove.textContent='Remove';remove.setAttribute('aria-label','Remove '+value.name);remove.onclick=()=>{saved=saved.filter(item=>item!==value);persist();render();};row.append(remove);}list.append(row);}if(!saved.length)q('[data-saved]').textContent='Your saved layouts will appear here.';}
  function open(){if(!allowed())return;load();render();say('');if(!presets.open)presets.showModal();}
  q('[data-close]').onclick=()=>presets.close();q('form').onsubmit=e=>{e.preventDefault();if(!allowed())return;const name=q('input').value.trim();if(!name)return;if(saved.length>=8&&!saved.some(v=>v.name===name)){say('You can save up to eight workspaces. Remove one first.');return;}const value=capture(name);saved=saved.filter(v=>v.name!==name);saved.push(value);if(persist()){q('input').value='';render();say('Workspace saved.');}};
  const launchers=document.createElement('div');launchers.className='phoneWorkspaceLaunchers';
  for(const [label,action]of [['Control one app',()=>presentation?.openControl()],['Workspace presets',open]]){const button=document.createElement('button');button.type='button';button.textContent=label;button.onclick=()=>{if(allowed())action();};launchers.append(button);}
  document.querySelector('.ecHomeDestinations')?.after(launchers);
  const settings=document.querySelector('#workspaceSettings [data-settings-section=controls] .settingsGroupContent')||document.getElementById('workspaceSettings');if(settings){const button=document.createElement('button');button.type='button';button.className='settingsQuietButton';button.textContent='Phone workspace presets';button.onclick=open;settings.append(button);}
  function auth(){launchers.hidden=!allowed();if(!allowed()){saved=[];if(presets.open)presets.close();}}
  window.addEventListener('pcr:auth',auth);auth();window.PCRPhoneWorkspaces={open,capture,apply};
  if(!page||!presentation)return;
  const stage=page.querySelector('.presentationStage'),canvas=stage.querySelector('canvas');
  const control=document.createElement('section');control.className='oneAppControls';control.innerHTML='<p>Tap to click. Drag to move or select. Hold for right-click. Interaction brings this app to the front on the PC.</p><div data-keys></div><form><label>Type in the selected app<input maxlength="2000" autocomplete="off" placeholder="Tap a field above, then type here"></label><button>Send text</button></form><p data-control-status role="status"></p>';
  page.querySelector('.presentationPlayback').append(control);let pending=Promise.resolve(),queued=0,gesture=null;
  function enabled(){return allowed()&&page.dataset.control==='true'&&presentation.playing;}
  function send(command){if(!enabled())return Promise.resolve(false);if(queued>=12)return Promise.resolve(false);const id=presentation.selection?.id;queued++;pending=pending.catch(()=>{}).then(async()=>{if(!enabled()||presentation.selection?.id!==id)return false;try{const response=await fetch('/api/apps/control',{method:'POST',headers:{'Content-Type':'application/json','X-PCR':'1'},body:JSON.stringify({id,...command})});const result=await response.json();if(!response.ok||!result.ok)throw Error(result.error||'App control failed.');control.querySelector('[data-control-status]').textContent='';return true;}catch(e){control.querySelector('[data-control-status]').textContent=e.message;return false;}finally{}}).finally(()=>queued--);return pending;}
  for(const [label,key]of [['Esc',27],['Tab',9],['←',37],['↑',38],['↓',40],['→',39],['Backspace',8],['Enter',13]]){const button=document.createElement('button');button.type='button';button.textContent=label;button.onclick=()=>send({action:'key',key});control.querySelector('[data-keys]').append(button);}
  control.querySelector('form').onsubmit=async e=>{e.preventDefault();const input=control.querySelector('input'),text=input.value;if(text&&await send({action:'text',text})&&input.value===text)input.value='';};
  function point(e){const surface=canvas.hidden?stage.querySelector('video'):canvas,rect=surface.getBoundingClientRect(),w=canvas.hidden?surface.videoWidth:canvas.width,h=canvas.hidden?surface.videoHeight:canvas.height;if(!w||!h)return null;const scale=Math.min(rect.width/w,rect.height/h),width=w*scale,height=h*scale;const x=(e.clientX-rect.left-(rect.width-width)/2)/width,y=(e.clientY-rect.top-(rect.height-height)/2)/height;return x>=0&&x<=1&&y>=0&&y<=1?{x,y}:null;}
  stage.addEventListener('pointerdown',e=>{if(!enabled())return;const p=point(e);if(!p)return;e.preventDefault();stage.setPointerCapture?.(e.pointerId);gesture={id:e.pointerId,points:[p],at:Date.now(),right:e.button===2};});
  stage.addEventListener('pointermove',e=>{if(gesture?.id!==e.pointerId)return;const p=point(e);if(p){if(gesture.points.length>=32)gesture.points.splice(1,1);gesture.points.push(p);}});
  stage.addEventListener('pointerup',e=>{if(gesture?.id!==e.pointerId)return;const g=gesture;gesture=null;const first=g.points[0],last=point(e)||g.points.at(-1),moved=Math.hypot(last.x-first.x,last.y-first.y)>.015;if(moved)void send({action:'drag',points:[...g.points.slice(0,31),last]});else void send({action:g.right||Date.now()-g.at>600?'right':'tap',...last});});
  stage.addEventListener('pointercancel',()=>gesture=null);stage.addEventListener('contextmenu',e=>{if(enabled())e.preventDefault();});
  stage.addEventListener('wheel',e=>{if(!enabled())return;const p=point(e);if(p){e.preventDefault();void send({action:'wheel',...p,delta:Math.max(-1200,Math.min(1200,Math.round(-e.deltaY)))});}},{passive:false});
  const sync=()=>{control.hidden=page.dataset.control!=='true'||!allowed();stage.classList.toggle('oneAppInteractive',!control.hidden);};new MutationObserver(sync).observe(page,{attributes:true,attributeFilter:['data-control']});window.addEventListener('pcr:auth',sync);page.addEventListener('close',()=>{gesture=null;control.querySelector('input').value='';});sync();
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
})();


'use strict';
(()=>{
  const root=document.documentElement,viewport=window.visualViewport;
  let baseline=0,lastWidth=0,frame=0;
  const editable=element=>element?.matches('textarea,input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=button]):not([type=submit]),[contenteditable=true]');
  function fit(){
    frame=0;const width=viewport?.width||innerWidth,height=viewport?.height||innerHeight,scale=viewport?.scale||1;
    if(Math.abs(scale-1)>.05)return; // Pinch zoom must remain under the user's control.
    if(Math.abs(width-lastWidth)>40){baseline=height;lastWidth=width;}else baseline=Math.max(baseline,height);
    const keyboard=!!editable(document.activeElement)&&baseline-height>140;
    root.style.setProperty('--phone-viewport-height',height+'px');
    root.style.setProperty('--phone-viewport-top',Math.max(0,viewport?.offsetTop||0)+'px');
    const home=document.getElementById('ecHome'),navigation=document.querySelector('.ecNavigation[data-environment="home"]');
    if(home&&navigation&&!navigation.hidden){
      const top=home.getBoundingClientRect().top,bar=navigation.getBoundingClientRect(),viewportBottom=(viewport?.offsetTop||0)+height;
      const floating=navigation.dataset.navCustom==='true'&&viewportBottom-bar.bottom>22;
      const bottom=floating?viewportBottom-20:bar.top;
      home.style.setProperty('--phone-home-height',Math.max(100,bottom-top-12)+'px');
    }
    root.classList.toggle('phoneKeyboardOpen',keyboard);
    if(keyboard&&document.activeElement?.id!=='typeText')document.activeElement?.scrollIntoView?.({block:'nearest',inline:'nearest'});
  }
  function schedule(){if(!frame)frame=requestAnimationFrame(fit);}
  viewport?.addEventListener('resize',schedule);viewport?.addEventListener('scroll',schedule);
  window.addEventListener('resize',schedule);document.addEventListener('focusin',schedule);document.addEventListener('focusout',schedule);fit();
  function mount(){
    const home=document.getElementById('ecHome'),footer=home?.querySelector('.ecHomeFoot');
    if(home&&footer&&!home.querySelector('.phoneHomeContent')){const content=document.createElement('div');content.className='phoneHomeContent';while(home.firstElementChild&&home.firstElementChild!==footer)content.append(home.firstElementChild);home.prepend(content);}
    const navigation=document.querySelector('.ecNavigation');if(navigation&&window.ResizeObserver)new ResizeObserver(schedule).observe(navigation);window.addEventListener('pcr:page',schedule);window.addEventListener('pcr:navigation-layout',schedule);schedule();
    const files=document.getElementById('filesDialog'),commands=files?.querySelector('.explorerCommands'),sidebar=files?.querySelector('.explorerSidebar');
    if(!commands||!sidebar||commands.querySelector('.phoneFoldersToggle'))return;
    sidebar.id='phoneExplorerFolders';const toggle=document.createElement('button');toggle.type='button';toggle.className='phoneFoldersToggle';
    toggle.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 5h7l2 3h9v12H3Z"/></svg><span>Folders</span>';
    toggle.setAttribute('aria-controls',sidebar.id);toggle.setAttribute('aria-expanded','false');toggle.setAttribute('aria-label','Show folders');
    function close(){files.classList.remove('phoneFoldersOpen');toggle.setAttribute('aria-expanded','false');toggle.setAttribute('aria-label','Show folders');}
    toggle.onclick=()=>{const open=!files.classList.contains('phoneFoldersOpen');files.classList.toggle('phoneFoldersOpen',open);toggle.setAttribute('aria-expanded',String(open));toggle.setAttribute('aria-label',open?'Hide folders':'Show folders');};
    commands.prepend(toggle);sidebar.addEventListener('click',event=>{if(event.target.closest('button'))close();});
    files.addEventListener('keydown',event=>{if(event.key==='Escape'&&files.classList.contains('phoneFoldersOpen')){event.preventDefault();event.stopPropagation();close();toggle.focus();}});
    files.querySelector('.explorerContent')?.addEventListener('click',close);files.addEventListener('close',close);
    window.addEventListener('pcr:page',close);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
})();
