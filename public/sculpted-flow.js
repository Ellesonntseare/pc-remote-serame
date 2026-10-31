'use strict';
// Presentation owns no sockets or media players. Existing feature nodes retain
// their event handlers, account permissions, drafts and transfer state.
(()=>{
 function mount(){
  const app=document.querySelector('.app'),home=document.getElementById('spatialHome'),grid=document.querySelector('.heroactions'),remote=document.getElementById('rs');
  if(!app||!home||!grid||window.EllesonFlow)return;
  document.documentElement.classList.add('ecFlow');
  const paths={home:'m3 10 9-7 9 7v10h-6v-7H9v7H3Z',screen:'M3 4h18v13H3ZM8 21h8m-4-4v4',file:'M3 5h7l2 3h9v12H3Z',audio:'M3 14v-3a9 9 0 0 1 18 0v3M3 12h4v8H3Zm18 0h-4v8h4Z',settings:'m9 3-1 3-3 1v4l-2 1 2 2v3l3 1 1 3h6l1-3 3-1v-3l2-2-2-1V7l-3-1-1-3ZM9 12a3 3 0 1 0 6 0 3 3 0 1 0-6 0',controls:'M3 3h7v7H3Zm11 0h7v7h-7ZM3 14h7v7H3Zm11 0h7v7h-7Z',arrow:'M4 12h16m-6-6 6 6-6 6',mouse:'M6 8a6 6 0 0 1 12 0v8a6 6 0 0 1-12 0Zm6-6v7M6 9h12',keyboard:'M2 5h20v14H2ZM6 9h.1m4 0h.1m4 0h.1m4 0h.1M7 15h10',power:'M12 2v10M6 5a9 9 0 1 0 12 0',close:'m6 6 12 12M6 18 18 6',chevron:'m8 10 4 4 4-4',wave:'M3 9v6m4-10v14m5-17v20m5-17v14m4-10v6'};
  const icon=name=>'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="'+(paths[name]||paths.controls)+'"/></svg>';
  const action=(id,label,glyph,extra='')=>'<button type="button" data-ec-go="'+id+'" '+extra+'>'+icon(glyph||id)+'<span>'+label+'</span></button>';
  const controls=document.createElement('dialog');controls.id='ecControlsPage';controls.className='workspacePage ecControlsPage';controls.innerHTML='<header><div><span class="ecEyebrow">YOUR WORKSPACE</span><h2>Controls</h2></div><button type="button" data-close>Back</button></header><div class="ecControlsIntro"><p>Everything, within reach.</p><button type="button" data-ec-dashboard>Connection overview '+icon('arrow')+'</button></div>';
  controls.querySelector('[data-close]').onclick=()=>controls.close();controls.append(grid);document.body.append(controls);
  for(const node of [document.getElementById('homePanels'),document.querySelector('.spatialAllControls .workspaceHomeEmpty')])if(node)controls.append(node);
  const surface=document.createElement('section');surface.id='ecHome';surface.setAttribute('aria-label','Your connected workspace');
  surface.innerHTML='<div class="ecHomeIdentity"><div><span class="ecEyebrow">CONNECTED PC</span><h1 data-ec-name>Your PC</h1><p class="ecConnection" data-ec-connection data-state="checking"><i></i><span>Checking connection</span></p></div>'+action('power','Power','power','class="ecPower" aria-label="PC power controls"')+'</div><div class="ecWorkspaceSculpture"><div class="ecSculptureLines" aria-hidden="true"><svg viewBox="0 0 600 350" preserveAspectRatio="none"><path d="M-30 180C90 26 170 330 370 180S530 0 650 70M-30 200C90 46 170 350 370 200S530 20 650 90M-30 220C90 66 170 370 370 220S530 40 650 110"/></svg></div><span class="ecHomeChapter">01 / YOUR WORKSPACE</span><h2>One connection.<br><em>Every possibility.</em></h2><p class="ecHomeLead">Your PC. Right here.</p><button type="button" class="ecRemoteLaunch" data-ec-go="remote"><span>'+icon('screen')+'<span>Remote screen<small>Continue on your PC</small></span></span><b aria-hidden="true">'+icon('arrow')+'</b></button></div><div class="ecHomeDestinations">'+action('files','Files','file')+action('audio','Audio','audio')+action('controls','Controls','controls')+'</div><div class="ecHomeFoot"><span data-ec-route>Connected to your own PC</span><button type="button" data-ec-go="devices">Devices '+icon('arrow')+'</button></div>';
  home.prepend(surface);
  const nav=document.createElement('nav');nav.className='ecNavigation';nav.setAttribute('aria-label','Main pages');
  nav.innerHTML='<svg class="ecNavSurface" viewBox="0 0 600 100" preserveAspectRatio="none" aria-hidden="true"><path d="M1 42C70 -9 104 15 170 27S270 47 330 29S490 12 599 35V99H1Z"/></svg><span class="ecNavCurrent" aria-hidden="true"></span>'+[['home','Home'],['remote','Remote'],['files','Files'],['audio','Audio'],['settings','Settings']].map(([id,label])=>action(id,label,id==='remote'?'screen':id==='files'?'file':id)).join('');app.append(nav);
  const liquid=document.createElement('span');liquid.className='ecNavLiquid';liquid.innerHTML='<svg viewBox="0 0 120 100" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="ecLiquidOrange" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#ff962f" stop-opacity=".82"/><stop offset=".5" stop-color="#f56622" stop-opacity=".5"/><stop offset="1" stop-color="#e74817" stop-opacity=".12"/></linearGradient></defs><path fill="url(#ecLiquidOrange)" d="M0 44C12 56 22 51 31 34C41 12 53 4 65 11C83 20 83 51 101 48C110 46 115 40 120 44V100H0Z"/><path class="ecNavCrest" d="M0 44C12 56 22 51 31 34C41 12 53 4 65 11C83 20 83 51 101 48C110 46 115 40 120 44"/></svg>';
  const ripple=document.createElement('span');ripple.className='ecNavRipple';const navCurrent=nav.querySelector('.ecNavCurrent');navCurrent.append(liquid,ripple);
  let environment='home',lastPage='home',entrance=null,liquidIndex=null,liquidAnimations=[];
  function moveLiquid(index,reduced){
   for(const animation of liquidAnimations)animation.cancel();liquidAnimations=[];
   const previous=liquidIndex;liquidIndex=index;
   if(index===undefined||previous===null||previous===undefined||previous===index||reduced||!liquid.animate)return;
   const direction=index>previous?1:-1;liquid.style.transformOrigin=direction>0?'25% 70%':'75% 70%';
   liquidAnimations.push(navCurrent.animate([{transform:'translateX('+(previous*100)+'%)'},{transform:'translateX('+(index*100)+'%)'}],{duration:680,easing:'cubic-bezier(.22,.75,.25,1)'}));
   liquidAnimations.push(liquid.animate([{transform:'scale(1,1) skewX(0deg)'},{transform:'scale(1.65,.68) skewX('+(-direction*14)+'deg)',offset:.32},{transform:'scale(.9,1.14) skewX('+(direction*6)+'deg)',offset:.72},{transform:'scale(1,1) skewX(0deg)'}],{duration:680,easing:'cubic-bezier(.22,.75,.25,1)'}));
   liquidAnimations.push(ripple.animate([{opacity:0,transform:'scale(.45)'},{opacity:.6,transform:'scale(.8)',offset:.25},{opacity:0,transform:'scale(1.45)'}],{duration:500,delay:220,easing:'ease-out'}));
  }
  const feature=name=>grid.querySelector('[data-dashboard-tile="'+name+'"]');
  function launch(name){const node=feature(name);if(!node||node.hidden||node.classList.contains('hide')||node.dataset.pcrDenied==='true'){window.msg?.('This control is unavailable for this connection.');return false;}node.click();return true;}
  function navigate(destination){
   if(!window.PCRAuth?.signedIn)return;
   const page={remote:'rs',files:'filesDialog',audio:'audioPage',settings:'workspaceSettings',controls:'ecControlsPage'}[destination];
   if(page===window.PCRPages?.current)return;
   window.PCRDeviceInput?.haptic?.();
   // Ordinary file browsing, live audio and remote capture stay alive. Only
   // explicit Close/Disconnect runs the feature's teardown.
   window.PCRPages?.park();
   if(destination==='home'){window.PCRMission?.setView('workspace');applyPage('home');return;}
   if(page&&window.PCRPages?.resume(page))return;
   if(destination==='remote'){if(typeof rs!=='undefined'&&rs.on){remote.classList.remove('hide');window.dispatchEvent(new CustomEvent('pcr:page',{detail:{id:'rs'}}));}else launch('screen');}
   else if(destination==='files')launch('file');
   else if(destination==='audio')window.PCRAudioHub?.open();
   else if(destination==='settings')window.PCRWorkspaceSettings?.open();
   else if(destination==='controls')controls.showModal();
   else launch(destination);
  }
  document.addEventListener('click',event=>{const node=event.target.closest('[data-ec-go]');if(node)navigate(node.dataset.ecGo);});
  controls.querySelector('[data-ec-dashboard]').onclick=()=>{controls.close();window.PCRMission?.setView('dashboard');};
  function applyPage(id){
   document.body.style.overflow=id==='rs'?'hidden':'';
   lastPage=id;const mode=id==='home'?'home':id==='rs'?'remote':id==='filesDialog'||id==='filePreviewDialog'?'files':['audioPage','pcAudioDialog','phoneAudioPage'].includes(id)?'audio':id==='workspaceSettings'||id==='rsSettings'?'settings':'controls';
   environment=mode;document.body.dataset.ecEnvironment=mode;nav.dataset.environment=mode;
   const index={home:0,remote:1,files:2,audio:3,settings:4}[mode];nav.style.setProperty('--ec-nav-index',String(index??0));nav.classList.toggle('ecNavSecondary',index===undefined);
   for(const button of nav.querySelectorAll('button')){const active=button.dataset.ecGo===mode;button.setAttribute('aria-current',active?'page':'false');}
   const page=document.getElementById(id),target=id==='remoteOptions'?page?.querySelector('.remoteOptionsPanel'):page||app;
   if(target&&nav.parentElement!==target)target.append(nav);
   const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches||window.PCRAppearance?.light;
   moveLiquid(index,reduced);
   entrance?.cancel();if(!reduced&&page&&id!=='rs'&&page.animate)entrance=page.querySelector('.pcrPageHeader,header')?.animate([{opacity:.2,transform:'translateY(9px)'},{opacity:1,transform:'translateY(0)'}],{duration:280,easing:'cubic-bezier(.2,.8,.2,1)'});
   if(id==='rs')window.dispatchEvent(new Event('resize'));
  }
  window.addEventListener('pcr:page',event=>applyPage(event.detail?.id||'home'));
  const originalKeyboard=window.rsKb;if(originalKeyboard)window.rsKb=function(...args){if(remote.dataset.pcrParked==='true'){window.PCRPages?.park();window.PCRPages?.resume('rs');}return originalKeyboard.apply(this,args);};
  function homeAvailability(){for(const [id,name]of [['remote','screen'],['files','file'],['audio','audio'],['power','power'],['devices','devices']]){const tile=window.PCRWorkspace?.getTiles().find(item=>item.id===name);for(const button of surface.querySelectorAll('[data-ec-go="'+id+'"]'))button.hidden=!!tile&&(!tile.available||!tile.visible);}for(const [id,permission]of [['remote','screen'],['files','download'],['audio','audio']]){const button=nav.querySelector('[data-ec-go="'+id+'"]');if(button){const allowed=id==='files'?['upload','download','clipboard'].some(p=>window.PCRCanAccess?.(p)):window.PCRCanAccess?.(permission);button.disabled=!allowed;}}}
  function signedIn(){nav.hidden=!window.PCRAuth?.signedIn;homeAvailability();if(!window.PCRAuth?.signedIn)applyPage('home');}
  for(const name of ['pcr:auth','pcr:home-layout','pcr:home-availability'])window.addEventListener(name,signedIn);
  window.addEventListener('pcr:status',event=>{const data=event.detail||{};surface.querySelector('[data-ec-name]').textContent=data.name||'Your PC';surface.querySelector('[data-ec-route]').textContent=data.system?.os||'Connected to your own PC';});
  window.addEventListener('pcr:connection',event=>{const state=event.detail?.state,online=state==='online'||state==='connected';const label=surface.querySelector('[data-ec-connection]');label.dataset.state=state||'checking';label.querySelector('span').textContent=online?'Online and ready':state==='offline'?'PC unavailable — check connection':'Checking connection';});
  // Remote's existing controls become one physical, draggable shelf. Only the
  // handle captures gestures; touches on the PC image/pad keep their meaning.
  const dock=document.getElementById('remoteSwipeDock'),tools=document.getElementById('screenTools');let snap=1,drag=null,dragFrame=0;
  if(dock){
   const handle=document.createElement('button');handle.type='button';handle.className='ecShelfHandle';handle.setAttribute('aria-label','Expand remote controls');handle.innerHTML='<span></span>';dock.prepend(handle);
   const mouseActions=document.createElement('div');mouseActions.className='ecMouseActions';mouseActions.innerHTML='<button type="button" data-ec-click="l">'+icon('mouse')+'Left click</button><button type="button" data-ec-click="r">'+icon('mouse')+'Right click</button>';dock.append(mouseActions);
   mouseActions.onclick=event=>{const button=event.target.closest('[data-ec-click]');if(button&&(!window.PCRCanAccess||window.PCRCanAccess('control'))&&(!window.PCRHoldControl||window.PCRHoldControl.can('pc')))window.qc?.('click '+button.dataset.ecClick);};
   const rail=document.createElement('div');rail.className='ecRemoteRail';rail.setAttribute('role','toolbar');rail.setAttribute('aria-label','Remote screen actions');
   const modes={mouse:['Mouse','mouse'],keyboard:['Keyboard','keyboard'],files:['Files','file'],tools:['Tools','controls']};
   rail.innerHTML='<button type="button" class="ecRailCurrent" aria-controls="ecRailChoices" aria-expanded="false"></button><div id="ecRailChoices" class="ecRailChoices" hidden>'+Object.entries(modes).map(([key,[label,glyph]])=>'<button type="button" data-ec-rail="'+key+'" aria-label="'+label+'">'+icon(glyph)+'</button>').join('')+'</div>';remote.append(rail);
   const current=rail.querySelector('.ecRailCurrent'),choices=rail.querySelector('.ecRailChoices');let mode='mouse',railDrag=null,ignoreClick=false,position=null;
   try{const saved=JSON.parse(localStorage.getItem('elleson_remote_rail_v1'));if(Number.isFinite(saved?.x)&&Number.isFinite(saved?.y))position={x:Math.max(0,Math.min(1,saved.x)),y:Math.max(0,Math.min(1,saved.y))};}catch{}
   function bounds(){
    const rect=remote.getBoundingClientRect(),viewport=window.visualViewport;
    const area={left:Math.max(8,(viewport?.offsetLeft||0)-rect.left+8),top:Math.max(62,(viewport?.offsetTop||0)-rect.top+8),right:Math.min(rect.width,(viewport?.offsetLeft||0)+(viewport?.width||innerWidth)-rect.left)-8,bottom:Math.min(rect.height,(viewport?.offsetTop||0)+(viewport?.height||innerHeight)-rect.top)-8};
    const navigation=remote.querySelector('.ecNavigation')?.getBoundingClientRect();
    if(navigation?.width&&navigation.height){if(navigation.width>navigation.height&&navigation.top>rect.top+rect.height/2)area.bottom=Math.min(area.bottom,navigation.top-rect.top-8);else if(navigation.height>navigation.width){if(navigation.left>rect.left+rect.width/2)area.right=Math.min(area.right,navigation.left-rect.left-8);else area.left=Math.max(area.left,navigation.right-rect.left+8);}}
    return{...area,right:area.right-rail.offsetWidth,bottom:area.bottom-rail.offsetHeight};
   }
   function place(x,y){const b=bounds();if(!remote.clientWidth||!remote.clientHeight)return;const left=Math.max(b.left,Math.min(Math.max(b.left,b.right),x)),top=Math.max(b.top,Math.min(Math.max(b.top,b.bottom),y));rail.style.left=left+'px';rail.style.top=top+'px';rail.style.right='auto';rail.style.bottom='auto';}
   function restore(){if(!remote.clientWidth||!remote.clientHeight)return;const b=bounds();place(position?b.left+position.x*Math.max(0,b.right-b.left):b.right,position?b.top+position.y*Math.max(0,b.bottom-b.top):b.top);}
   function remember(){const b=bounds();position={x:(rail.offsetLeft-b.left)/Math.max(1,b.right-b.left),y:(rail.offsetTop-b.top)/Math.max(1,b.bottom-b.top)};try{localStorage.setItem('elleson_remote_rail_v1',JSON.stringify(position));}catch{}}
   function expand(open){choices.hidden=!open;current.setAttribute('aria-expanded',String(open));if(remote.clientWidth)place(rail.offsetLeft,rail.offsetTop);}
   function select(key){mode=key;rail.dataset.mode=key;current.innerHTML=icon(modes[key][1]);current.setAttribute('aria-label',modes[key][0]+' mode. Change mode or drag to move.');current.title=modes[key][0]+' · Tap to change, drag to move';for(const button of choices.children)button.hidden=button.dataset.ecRail===key;if(key==='mouse')setSnap(2);}
   current.onclick=()=>{if(ignoreClick){ignoreClick=false;return;}expand(choices.hidden);};
   choices.onclick=event=>{const key=event.target.closest('[data-ec-rail]')?.dataset.ecRail;if(!key)return;select(key);expand(false);if(key==='mouse'){window.rsTypeClose?.();setSnap(2);}if(key==='keyboard')document.getElementById('rsKeyboard')?.click();if(key==='files')navigate('files');if(key==='tools')document.querySelector('#remoteOptions>summary')?.click();};
   current.onpointerdown=event=>{if(event.button>0)return;ignoreClick=false;railDrag={id:event.pointerId,x:event.clientX,y:event.clientY,left:rail.offsetLeft,top:rail.offsetTop,moved:false};current.setPointerCapture?.(event.pointerId);};
   current.onpointermove=event=>{if(railDrag?.id!==event.pointerId)return;const dx=event.clientX-railDrag.x,dy=event.clientY-railDrag.y;if(Math.hypot(dx,dy)>7)railDrag.moved=true;if(!railDrag.moved)return;event.preventDefault();rail.classList.add('ecRailDragging');place(railDrag.left+dx,railDrag.top+dy);};
   function endRailDrag(event){if(railDrag?.id!==event.pointerId)return;ignoreClick=railDrag.moved;if(railDrag.moved)remember();railDrag=null;rail.classList.remove('ecRailDragging');}
   current.onpointerup=endRailDrag;current.onpointercancel=endRailDrag;current.onlostpointercapture=endRailDrag;
   current.onkeydown=event=>{const directions={ArrowLeft:[-12,0],ArrowRight:[12,0],ArrowUp:[0,-12],ArrowDown:[0,12]};if(directions[event.key]){event.preventDefault();event.stopPropagation();const [x,y]=directions[event.key];place(rail.offsetLeft+x,rail.offsetTop+y);remember();}else if(event.key==='Enter'||event.key===' ')ignoreClick=false;};
   rail.addEventListener('keydown',event=>{if(event.key==='Escape'&&!choices.hidden){event.preventDefault();event.stopPropagation();expand(false);current.focus();}});
   document.addEventListener('pointerdown',event=>{if(!rail.contains(event.target))expand(false);},{passive:true});
   new MutationObserver(()=>{if(remote.classList.contains('typing'))select('keyboard');else if(mode==='keyboard')select('mouse');}).observe(remote,{attributes:true,attributeFilter:['class']});
   window.addEventListener('pcr:page',event=>{expand(false);if(event.detail?.id==='rs'){select(remote.classList.contains('typing')?'keyboard':'mouse');requestAnimationFrame(restore);}});
   window.addEventListener('resize',restore);window.visualViewport?.addEventListener('resize',restore);select('mouse');requestAnimationFrame(restore);
   function setSnap(value){snap=Math.max(0,Math.min(2,value));dock.dataset.snap=String(snap);handle.setAttribute('aria-expanded',String(snap===2));handle.setAttribute('aria-label',snap===2?'Collapse remote controls':'Expand remote controls');dock.style.removeProperty('--ec-drag');remote.dataset.ecShelf=String(snap);}
   handle.onclick=()=>{if(!handle.wasDragged)setSnap((snap+1)%3);handle.wasDragged=false;};
   handle.onpointerdown=event=>{if(event.button>0)return;event.preventDefault();handle.setPointerCapture?.(event.pointerId);drag={id:event.pointerId,y:event.clientY,last:event.clientY,at:performance.now(),velocity:0,dy:0};dock.classList.add('ecShelfDragging');};
   handle.onpointermove=event=>{if(drag?.id!==event.pointerId)return;event.preventDefault();const now=performance.now();drag.velocity=(event.clientY-drag.last)/Math.max(1,now-drag.at);drag.last=event.clientY;drag.at=now;drag.dy=Math.max(-220,Math.min(220,event.clientY-drag.y));if(!dragFrame)dragFrame=requestAnimationFrame(()=>{dragFrame=0;if(drag)dock.style.setProperty('--ec-drag',drag.dy+'px');});};
   function release(event){if(drag?.id!==event.pointerId)return;const value=drag;drag=null;dock.classList.remove('ecShelfDragging');handle.wasDragged=Math.abs(value.dy)>6;setSnap(Math.abs(value.dy)>38||Math.abs(value.velocity)>.4?snap+(value.dy<0?1:-1):snap);}
   handle.onpointerup=release;handle.onpointercancel=event=>{if(drag?.id===event.pointerId){drag=null;dock.classList.remove('ecShelfDragging');setSnap(snap);}};setSnap(2);
  }
  // Keep the existing Windows Explorer layout and its live file-manager nodes.
  // explorer-workspace owns the tabs, command bar, sidebar and folder contents.
  const audio=document.getElementById('audioPage');if(audio){const sculpture=document.createElement('div');sculpture.className='ecAudioIdentity';sculpture.innerHTML='<div class="ecAudioDisc" aria-hidden="true">'+icon('audio')+'</div><span class="ecEyebrow">SOUND, WITHOUT DISTANCE</span><p>Your sound.<br><em>Where you need it.</em></p><span class="ecAudioState" role="status">Choose an audio route</span>';audio.querySelector('.audioRoutes').before(sculpture);function audioState(event){const state=event.detail?.state||'stopped';audio.dataset.ecAudioState=state;const label=sculpture.querySelector('.ecAudioState');label.textContent=state==='playing'||state==='streaming'?'Audio connected':state==='starting'||state==='connecting'?'Connecting audio…':state==='error'?'Audio needs attention':'Ready when you are';}window.addEventListener('pcr:audio-state',audioState);window.addEventListener('pcr:phone-audio-state',audioState);}
  window.EllesonFlow={navigate,get environment(){return environment;},get page(){return lastPage;},icon};window.PCRMission?.setView('workspace');signedIn();applyPage(window.PCRPages?.current||'home');
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
})();
