'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{JSDOM}=require('jsdom');
const source=name=>fs.readFileSync(path.join(__dirname,'../public',name),'utf8');
const plain=value=>JSON.parse(JSON.stringify(value));
test('Settings exposes the signed-in Google account and a working sign-out action on phones',async t=>{
  const f=await fixture(t);let signedOut=0;f.window.PCRAuth.account={email:'person@gmail.com'};f.window.unpair=()=>{signedOut++;};f.window.PCRWorkspaceSettings.open();assert.equal(f.doc.querySelector('#workspaceSettings [data-current-account]').textContent,'person@gmail.com');f.doc.getElementById('workspaceSignOut').click();assert.equal(signedOut,1);assert.equal(f.doc.getElementById('workspaceSettings').open,false);
});
async function fixture(t,options={}){
  const names={screen:'Remote screen',file:'Files & clipboard',audio:'PC audio',video:'Live video',guest:'Guest screens',collaborate:'Collaborate',devices:'Devices',power:'Power','send-audio':'Send audio'};
  const tiles=Object.entries(names).map(([id,title])=>'<button class="quick wide" '+(id==='screen'?'id="screenBtn"':'')+' data-dashboard-tile="'+id+'" '+(options.denied?.includes(id)?'data-pcr-denied="true"':'')+'><span class="dashboardTileIcon"><svg></svg></span><span class="dashboardTileCopy"><strong>'+title+'</strong><small>Control your PC</small></span></button>').join('');
  const dom=new JSDOM('<div class="app"><div class="topbar"><div class="brandtext"><span>PC</span></div></div><div class="heroactions">'+tiles+'</div></div><div id="rs" class="hide"><div id="screenTools"></div><div id="typePanel" class="hide"></div><div id="rsv"></div><section id="remoteSwipeDock"><div class="remoteSwipeDockHeader"></div><div class="dockMouseButtons"></div><div class="remoteSwipeSurfaces"><div class="remoteSwipePad"></div></div><div class="dockQuickKeys"></div><div id="rsk" class="hide"></div></section></div><div id="rsSettings" class="hide"><div class="controlSheet"><div class="controlHead"></div><input id="sensitivity"><output id="sensValue"></output><select id="keyColumns"><option value="4">4</option></select><select id="keySize"><option value="44">44</option></select><div id="shortcutEditor"></div></div></div>',{url:'http://pc.test',runScripts:'outside-only',pretendToBeVisual:true});
  const window=dom.window,doc=window.document; t.after(()=>window.close());
  Object.defineProperty(window,'innerWidth',{configurable:true,writable:true,value:390});Object.defineProperty(window,'innerHeight',{configurable:true,writable:true,value:844});
  const frames=new Map();let serial=0,layouts=0,observed=0;window.requestAnimationFrame=callback=>{frames.set(++serial,callback);return serial;};window.cancelAnimationFrame=id=>frames.delete(id);
  window.ResizeObserver=class{observe(){observed++;}disconnect(){observed=0;}};
  window.sens=1;window.cols='4';window.keyHeight='44';window.rsRenderEditor=()=>{};window.PCRDashboard={icon:()=>'<svg></svg>'};window.PCRAuth={role:'owner',signedIn:true};window.PCRCanAccess=()=>true;window.rs={on:0};window.rsOpen=()=>{};window.rsKb=()=>{};window.rsPrefsOpen=()=>{doc.getElementById('rsSettings').classList.remove('hide');};
  window.HTMLDialogElement.prototype.showModal=function(){this.open=true;};window.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new window.Event('close'));};
  if(options.layout!==undefined)window.localStorage.setItem('pcr_home_layout_v1',typeof options.layout==='string'?options.layout:JSON.stringify(options.layout));
  if(options.split!==undefined)window.localStorage.setItem('pcr_remote_split_v1',JSON.stringify(options.split));
  const screen=doc.getElementById('rs');screen.getBoundingClientRect=()=>{layouts++;return{top:0,left:0,bottom:window.innerHeight,right:window.innerWidth,width:window.innerWidth,height:window.innerHeight};};
  window.eval(source('workspace-ui.js'));window.eval(source('workspace-settings.js'));if(options.design)window.eval(source('settings-design.js'));doc.dispatchEvent(new window.Event('DOMContentLoaded'));
  const flush=()=>{const queued=Array.from(frames.values());frames.clear();for(const callback of queued)callback(0);};
  const settle=async()=>{await Promise.resolve();flush();await Promise.resolve();flush();await Promise.resolve();};for(let n=0;n<50&&!window.PCRWorkspaceSettings?.ready;n++)await new Promise(r=>setTimeout(r,1));await settle();
  const pointer=(target,type,id,x,y)=>{const event=new window.MouseEvent(type,{button:0,clientX:x,clientY:y,bubbles:true,cancelable:true});Object.defineProperty(event,'pointerId',{value:id});target.dispatchEvent(event);};
  return{window,doc,screen,flush,settle,pointer,frames,layouts:()=>layouts,observed:()=>observed};
}

test('redesigned categories and search retain original input handlers, account controls and capability visibility',async t=>{
 const f=await fixture(t,{design:true});f.window.PCRWorkspaceSettings.open();const page=f.doc.getElementById('workspaceSettings'),input=f.doc.getElementById('sensitivity');let changed=0;input.addEventListener('input',()=>changed++);input.hidden=true;
 assert.equal(page.dataset.settingsTabs,'true');page.querySelector('[data-section=controls]').click();assert.equal(f.doc.getElementById('sensitivity'),input);input.dispatchEvent(new f.window.Event('input',{bubbles:true}));assert.equal(changed,1);
 assert.equal(page.querySelector('[data-settings-section=controls]').hidden,false);assert.equal(page.querySelector('[data-settings-section=privacy]').hidden,true);
 const search=page.querySelector('input[type=search]');search.value='pointer';search.dispatchEvent(new f.window.Event('input'));assert.equal(page.querySelector('[data-settings-section=controls]').hidden,false);assert.equal(input.hidden,true,'search never reveals a capability-hidden input');
 search.value='no-such-setting-123';search.dispatchEvent(new f.window.Event('input'));assert.equal(page.querySelector('.suiteSettingsEmpty').hidden,false);
 f.window.PCRWorkspaceSettings.open('privacy');await f.settle();assert.equal(page.querySelector('[data-settings-section=privacy]').hidden,false);assert.equal(search.value,'','category launch clears a previous search');assert.ok(page.querySelector('#workspaceSignOut'));
});

test('home defaults prioritize screen and files; settings reorder, hide, add and reset the real controls',async t=>{
  const f=await fixture(t),api=f.window.PCRWorkspace;assert.deepEqual(plain(api.getLayout().order.slice(0,4)),['screen','file','keyboard','apps']);
  f.window.PCRWorkspaceSettings.open();f.doc.querySelector('[data-tile-id=file] [data-tile-action=up]').click();assert.equal(api.getLayout().order[0],'file');assert.equal(f.doc.querySelector('.heroactions').firstElementChild.dataset.dashboardTile,'file');
  f.doc.querySelector('[data-tile-id=file] [data-tile-action=hide]').click();assert.equal(f.doc.querySelector('[data-dashboard-tile=file]').dataset.homeHidden,'true');assert.ok(f.doc.querySelector('#homeTileTray [data-tile-id=file]'));
  f.doc.querySelector('#homeTileTray [data-tile-id=file]').click();assert.equal(f.doc.querySelector('[data-dashboard-tile=file]').dataset.homeHidden,'false');
  f.doc.getElementById('homeLayoutReset').click();assert.deepEqual(plain(api.getLayout().order.slice(0,4)),['screen','file','keyboard','apps']);assert.deepEqual(plain(api.getLayout().hidden),[]);
  const saved=JSON.parse(f.window.localStorage.getItem('pcr_home_layout_v1'));assert.equal(saved.version,1);assert.equal(saved.order.length,api.defaults.length);
});

test('malformed and unknown local preferences are filtered without changing account permission gates',async t=>{
  const f=await fixture(t,{layout:{version:1,order:['audio','audio','__proto__',null,'file'],hidden:['file','unknown','file']},denied:['file']}),api=f.window.PCRWorkspace;
  assert.deepEqual(plain(api.getLayout().order.slice(0,3)),['audio','file','screen']);assert.deepEqual(plain(api.getLayout().hidden),['file']);
  f.window.PCRWorkspaceSettings.open();assert.equal(f.doc.querySelector('#homeTileTray [data-tile-id=file]'),null);assert.equal(f.doc.querySelector('#homeTileBoard [data-tile-id=file]'),null);
  api.setLayout({version:1,order:['file'],hidden:[]});assert.equal(f.doc.querySelector('[data-dashboard-tile=file]').dataset.pcrDenied,'true');assert.equal(api.getTiles().find(tile=>tile.id==='file').available,false);
});

test('corrupted storage falls back safely and failed saves keep settings usable for the visit',async t=>{
  const f=await fixture(t,{layout:'{invalid json'});assert.equal(f.window.PCRWorkspace.getLayout().order[0],'screen');
  f.window.PCRWorkspaceSettings.open();f.window.Storage.prototype.setItem=()=>{throw Error('storage disabled');};f.doc.querySelector('[data-tile-id=audio] [data-tile-action=hide]').click();
  assert.ok(f.window.PCRWorkspace.getLayout().hidden.includes('audio'));assert.match(f.doc.getElementById('homeLayoutStatus').textContent,/could not save/);
});

test('Send audio participates in the same reorder, hide and add controls as the other home tiles',async t=>{const f=await fixture(t);f.window.PCRWorkspaceSettings.open();assert.ok(f.window.PCRWorkspace.getTiles().some(tile=>tile.id==='send-audio'));f.doc.querySelector('[data-tile-id="send-audio"] [data-tile-action=hide]').click();assert.ok(f.window.PCRWorkspace.getLayout().hidden.includes('send-audio'));f.doc.querySelector('#homeTileTray [data-tile-id="send-audio"]').click();assert.equal(f.window.PCRWorkspace.getLayout().hidden.includes('send-audio'),false);});

test('touch grip and desktop drag both persist the board order',async t=>{
  const f=await fixture(t);f.window.PCRWorkspaceSettings.open();const board=f.doc.getElementById('homeTileBoard'),target=board.querySelector('[data-tile-id=screen]');target.getBoundingClientRect=()=>({top:0,height:100});f.doc.elementFromPoint=()=>target;
  f.pointer(board.querySelector('[data-tile-id=audio] [data-tile-action=drag]'),'pointerdown',1,20,300);f.pointer(board,'pointermove',1,20,20);f.pointer(board,'pointerup',1,20,20);assert.equal(f.window.PCRWorkspace.getLayout().order[0],'audio');
  const video=board.querySelector('[data-tile-id=video]'),start=new f.window.Event('dragstart',{bubbles:true});Object.defineProperty(start,'dataTransfer',{value:{setData(){}}});video.dispatchEvent(start);
  board.querySelector('[data-tile-id=audio]').dispatchEvent(new f.window.MouseEvent('dragover',{clientY:0,bubbles:true,cancelable:true}));board.dispatchEvent(new f.window.Event('drop',{bubbles:true,cancelable:true}));assert.equal(f.window.PCRWorkspace.getLayout().order[0],'video');
});

test('split validates preferences, coalesces pointer movement and disconnects measurements when hidden',async t=>{
  const f=await fixture(t,{split:{version:1,portrait:999,landscape:'bad'}});assert.equal(f.window.PCRWorkspaceSplit.get().portrait,55);assert.equal(f.window.PCRWorkspaceSplit.get().landscape,34);
  f.screen.classList.remove('hide');await f.settle();const handle=f.doc.getElementById('remoteSplitHandle');assert.equal(handle.hidden,false);assert.equal(handle.getAttribute('aria-orientation'),'horizontal');assert.ok(f.observed()>0);
  f.pointer(handle,'pointerdown',1,100,500);const before=f.layouts();for(let y=510;y<560;y++)f.pointer(handle,'pointermove',1,100,y);assert.equal(f.frames.size,1);assert.equal(f.layouts(),before,'pointer moves schedule layout without measuring each event');f.flush();f.pointer(handle,'pointerup',1,100,559);assert.ok(JSON.parse(f.window.localStorage.getItem('pcr_remote_split_v1')).portrait>=22);
  f.screen.classList.add('typing');await f.settle();assert.equal(handle.hidden,true);assert.equal(f.screen.classList.contains('workspaceSplit'),false);
  f.screen.classList.remove('typing');f.window.innerWidth=844;f.window.innerHeight=390;f.window.dispatchEvent(new f.window.Event('resize'));await f.settle();assert.equal(f.screen.classList.contains('workspaceLandscape'),true);assert.equal(handle.getAttribute('aria-orientation'),'vertical');
  f.screen.classList.add('hide');await f.settle();assert.equal(f.observed(),0);assert.equal(handle.hidden,true);
});

test('split presets, range inputs and keyboard separator controls share saved state',async t=>{
  const f=await fixture(t);f.window.PCRWorkspaceSettings.open();const group=f.doc.querySelector('#workspaceSplitSettings');group.querySelector('[data-split-preset=trackpad]').click();assert.equal(f.window.PCRWorkspaceSplit.get().portrait,44);
  const range=group.querySelector('[data-split-mode=portrait]');range.value='28';range.dispatchEvent(new f.window.Event('input',{bubbles:true}));range.dispatchEvent(new f.window.Event('change',{bubbles:true}));assert.equal(f.window.PCRWorkspaceSplit.get().portrait,28);
  f.screen.classList.remove('hide');await f.settle();f.doc.getElementById('remoteSplitHandle').dispatchEvent(new f.window.KeyboardEvent('keydown',{key:'ArrowUp',bubbles:true,cancelable:true}));assert.equal(f.window.PCRWorkspaceSplit.get().portrait,30);assert.equal(group.querySelector('[data-split-value=portrait]').textContent,'30%');
  f.window.rsPrefsOpen();assert.equal(f.doc.getElementById('workspaceSettings').open,true,'remote preferences share the same Settings page');assert.equal(f.doc.getElementById('rsSettings').classList.contains('hide'),true);assert.deepEqual(Array.from(f.doc.querySelectorAll('.settingsGroup>h3'),n=>n.textContent),['Connection','Controls','Appearance','Privacy']);assert.equal(f.doc.querySelectorAll('[data-split-mode=portrait]').length,1,'trackpad sizing has one source');assert.ok(f.doc.querySelector('[data-settings-section=controls] #sensitivity'));
});
