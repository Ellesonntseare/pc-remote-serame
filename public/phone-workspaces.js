'use strict';
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
