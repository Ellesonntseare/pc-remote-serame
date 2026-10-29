'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{JSDOM}=require('jsdom');
const script=fs.readFileSync(path.join(__dirname,'../public/page-navigation.js'),'utf8');
const tick=()=>new Promise(resolve=>setTimeout(resolve,35));
async function until(check){for(let i=0;i<60;i++){if(check())return;await tick();}assert.fail('Page navigation did not settle');}

function fixture(t){
  const dom=new JSDOM('<!doctype html><title>Elleson Connect</title><button id="screenBtn">Remote screen</button><button id="openFiles">Files</button><div id="rs" class="hide"><canvas id="rsc" tabindex="0"></canvas><section id="typePanel" class="hide"><textarea id="typeText"></textarea></section><details id="remoteOptions"><summary>Tools</summary><div class="remoteOptionsPanel"><strong>Remote options</strong><button id="remoteFiles">Files</button></div></details><div id="rsSettings" class="hide"><div class="controlSheet"><header class="controlHead"><h2>Customize controls</h2><button class="closeSettings">Close</button></header></div></div></div><dialog id="filesDialog"><header class="filesHeader"><div><h2>Files & text</h2></div><button id="filesClose">Close files</button></header><textarea id="filesNote"></textarea><button id="openImages">Image clipboard</button></dialog><dialog id="imageClipboardDialog"><header><h2>Image clipboard</h2><button data-close>Close image clipboard</button></header></dialog><dialog id="confirmation"><button>Cancel request</button></dialog><div id="modal"></div>',{url:'http://localhost/',runScripts:'outside-only',pretendToBeVisual:true});
  const w=dom.window,d=w.document,el=id=>d.getElementById(id),closed={screen:0,files:0,images:0};t.after(()=>w.close());
  w.HTMLDialogElement.prototype.showModal=function(){if(this.open)return;this.returnFocus=d.activeElement;this.open=true;this.querySelector('textarea,button')?.focus();};
  w.HTMLDialogElement.prototype.close=function(){if(!this.open)return;this.open=false;this.returnFocus?.focus();this.dispatchEvent(new w.Event('close'));};
  w.rsTypeClose=()=>{el('typePanel').classList.add('hide');el('typeText').blur();};
  w.rsOpen=()=>el('rs').classList.remove('hide');w.rsClose=()=>{closed.screen++;w.rsPrefsClose();w.rsTypeClose();el('rs').classList.add('hide');};
  w.rsPrefsOpen=()=>el('rsSettings').classList.remove('hide');w.rsPrefsClose=()=>el('rsSettings').classList.add('hide');
  el('screenBtn').addEventListener('click',w.rsOpen);el('openFiles').addEventListener('click',()=>el('filesDialog').showModal());el('remoteFiles').addEventListener('click',()=>el('filesDialog').showModal());
  el('filesClose').addEventListener('click',()=>el('filesDialog').close());el('filesDialog').addEventListener('close',()=>closed.files++);
  el('openImages').addEventListener('click',()=>el('imageClipboardDialog').showModal());el('imageClipboardDialog').querySelector('[data-close]').addEventListener('click',()=>el('imageClipboardDialog').close());el('imageClipboardDialog').addEventListener('close',()=>closed.images++);
  el('rsSettings').querySelector('button').addEventListener('click',w.rsPrefsClose);
  el('filesDialog').addEventListener('click',event=>{if(event.target===el('filesDialog'))el('filesDialog').close();});
  w.eval(script);return{w,d,el,closed};
}

test('feature pages keep lifecycle controls, focus their title, and leave blank space undismissed',async t=>{
  const {w,d,el,closed}=fixture(t);el('openFiles').focus();el('openFiles').click();
  assert.equal(w.PCRPages.current,'filesDialog');assert.equal(el('filesDialog').open,true);assert.equal(d.activeElement.tagName,'H2','opening a page must not summon the phone keyboard');assert.equal(el('filesClose').getAttribute('aria-label'),'Back to previous page');
  const length=w.history.length;el('filesDialog').showModal();assert.equal(w.history.length,length,'opening the same page again does not add history');el('filesDialog').click();assert.equal(el('filesDialog').open,true,'tapping empty page space stays on the page');
  d.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));assert.equal(el('filesDialog').open,false);assert.equal(closed.files,1);assert.equal(d.activeElement,el('openFiles'));await until(()=>w.history.state.pcrNavigation.path.length===0);assert.equal(d.title,'Elleson Connect');
});

test('browser Back and Forward navigate nested features and run cleanup once per departure',async t=>{
  const {w,d,el,closed}=fixture(t);el('openFiles').click();el('openImages').focus();el('openImages').click();assert.equal(w.PCRPages.current,'imageClipboardDialog');
  w.history.back();await until(()=>w.PCRPages.current==='filesDialog');assert.equal(el('imageClipboardDialog').open,false);assert.equal(el('filesDialog').open,true);assert.equal(closed.images,1);assert.equal(d.activeElement,el('openImages'));
  w.history.forward();await until(()=>w.PCRPages.current==='imageClipboardDialog');assert.equal(el('imageClipboardDialog').open,true);assert.equal(closed.images,1);
  assert.equal(w.PCRPages.back(),true);await until(()=>w.PCRPages.current==='filesDialog'&&w.history.state.pcrNavigation.path.length===1);assert.equal(closed.images,2);assert.equal(closed.files,0);
});

test('tools launch full pages and Android Back dismisses typing, preferences and the remote screen in order',async t=>{
  const {w,el,closed}=fixture(t);el('screenBtn').click();await tick();el('remoteOptions').open=true;await tick();assert.equal(w.PCRPages.current,'remoteOptions');assert.ok(el('remoteOptions').querySelector('.pcrPageHeader .pcrPageBack'));
  el('remoteFiles').click();assert.equal(el('remoteOptions').open,false);assert.equal(w.PCRPages.current,'filesDialog');await tick();w.PCRPages.back();await until(()=>w.PCRPages.current==='rs'&&w.history.state.pcrNavigation.path.length===1);assert.equal(closed.screen,0);
  w.rsPrefsOpen();assert.equal(w.PCRPages.current,'rsSettings');w.PCRPages.back();assert.equal(w.PCRPages.current,'rs');assert.equal(closed.screen,0);
  el('typePanel').classList.remove('hide');el('typeText').focus();w.PCRPages.back();assert.equal(el('typePanel').classList.contains('hide'),true);assert.equal(w.PCRPages.current,'rs');
  w.PCRPages.back();assert.equal(closed.screen,1);assert.equal(w.PCRPages.current,'home');await until(()=>w.history.state.pcrNavigation.path.length===0);assert.equal(w.PCRPages.back(),false);
});

test('rapid close and open cannot send a new page back to a stale history entry',async t=>{
  const {w,el,closed}=fixture(t);el('openFiles').click();el('filesDialog').close();el('imageClipboardDialog').showModal();assert.equal(w.PCRPages.current,'imageClipboardDialog');
  await tick();await until(()=>w.history.state.pcrNavigation.path.length===1&&w.PCRPages.current==='imageClipboardDialog');w.history.back();await until(()=>w.PCRPages.current==='home');assert.equal(closed.files,1);assert.equal(closed.images,1);assert.equal(el('filesDialog').open,false);
});

test('transient prompts stay separate and signing out prevents Forward from reviving feature pages',async t=>{
  const {w,el}=fixture(t);el('openFiles').click();el('confirmation').showModal();assert.equal(el('confirmation').classList.contains('pcrPage'),false);assert.equal(w.PCRPages.back(),true);assert.equal(el('confirmation').open,false);assert.equal(el('filesDialog').open,true);
  w.dispatchEvent(new w.CustomEvent('pcr:auth',{detail:{signedIn:false}}));assert.equal(el('filesDialog').open,false);await until(()=>w.history.state.pcrNavigation.path.length===0);w.history.forward();await tick();assert.equal(el('filesDialog').open,false);assert.equal(w.PCRPages.current,'home');
});

test('newly mounted feature dialogs and direct visibility changes join navigation',async t=>{
  const {w,d,el}=fixture(t);const late=d.createElement('dialog');late.id='pcAppsDialog';late.innerHTML='<header><h2>Switch apps</h2><button data-close>Close</button></header><input type="search">';late.querySelector('button').addEventListener('click',()=>late.close());d.body.append(late);late.showModal();assert.equal(w.PCRPages.current,'pcAppsDialog');assert.equal(d.activeElement.tagName,'H2');w.PCRPages.back();await tick();
  el('filesDialog').open=true;await tick();assert.equal(w.PCRPages.current,'filesDialog');el('filesDialog').open=false;await tick();assert.equal(w.PCRPages.current,'home');
});

test('dashboard keyboard shortcuts retain their explicitly focused editor when the screen opens',async t=>{
  const {w,d,el}=fixture(t);w.rsOpen();el('typePanel').classList.remove('hide');el('typeText').focus();await tick();assert.equal(w.PCRPages.current,'rs');assert.equal(d.activeElement,el('typeText'));w.PCRPages.back();assert.equal(el('typePanel').classList.contains('hide'),true);assert.equal(w.PCRPages.current,'rs');
});

test('keyboard focus stays inside the full-page tools launcher',async t=>{
  const {w,d,el}=fixture(t);w.rsOpen();el('remoteOptions').open=true;await tick();el('openFiles').focus();assert.equal(d.activeElement.tagName,'H2');d.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Tab',bubbles:true,cancelable:true}));assert.ok(d.activeElement.classList.contains('pcrPageBack'));d.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Tab',shiftKey:true,bubbles:true,cancelable:true}));assert.equal(d.activeElement,el('remoteFiles'));
});

async function clientFeatures(t){
  const dom=new JSDOM('<!doctype html><title>Elleson Connect</title><div class="heroactions"><button id="homeApps">Switch apps</button></div><div id="pairGate" class="hide"></div><div id="rs" class="hide"><div class="rsbot"></div></div>',{url:'http://localhost/',runScripts:'outside-only',pretendToBeVisual:true});
  const w=dom.window,d=w.document,calls={apps:0,files:0};t.after(()=>w.close());
  w.HTMLDialogElement.prototype.showModal=function(){if(this.open)return;this.returnFocus=d.activeElement;this.open=true;this.querySelector('button,input,textarea')?.focus();};
  w.HTMLDialogElement.prototype.close=function(){if(!this.open)return;this.open=false;this.returnFocus?.focus();this.dispatchEvent(new w.Event('close'));};
  w.rsTypeClose=()=>{};w.PCRAuth={signedIn:true,role:'owner'};w.PCRCanAccess=()=>true;
  w.api=async route=>{
    if(route==='/api/apps'){calls.apps++;return{ok:true,status:200,apps:[{id:'app-window',title:'Current app '+calls.apps,processName:'Example'}]};}
    if(route==='/api/files'){calls.files++;return{ok:true,files:[{name:'sample.png',size:4,modified:Date.now(),preview:{type:'image'}}],total:1,folder:'Shared transfers'};}
    throw Error('Unexpected route '+route);
  };
  w.eval(fs.readFileSync(path.join(__dirname,'../public/file-transfers.js'),'utf8'));
  w.eval(fs.readFileSync(path.join(__dirname,'../public/app-switcher.js'),'utf8'));d.dispatchEvent(new w.Event('DOMContentLoaded'));
  d.getElementById('homeApps').addEventListener('click',()=>d.getElementById('pcAppsButton').click());
  w.eval(script);await tick();return{w,d,calls};
}

test('Forward rebuilds file preview content through the real file transfer open handler',async t=>{
  const {w,d,calls}=await clientFeatures(t);d.querySelector('.filesHome').click();await until(()=>d.querySelector('.filesRow .filesSmallButton'));
  d.querySelector('.filesRow .filesSmallButton').click();const preview=d.getElementById('filePreviewDialog');assert.equal(preview.open,true);assert.match(d.querySelector('#filePreviewBody img').src,/\/api\/files\/preview\?name=sample.png$/);
  w.history.back();await until(()=>!preview.open);assert.equal(d.getElementById('filePreviewBody').childElementCount,0,'the existing preview cleanup has run');assert.equal(w.PCRPages.current,'filesDialog');
  w.history.forward();await until(()=>preview.open);assert.ok(d.querySelector('#filePreviewBody img'),'Forward must recreate the media cleared on Back');assert.match(d.querySelector('#filePreviewBody img').src,/\/api\/files\/preview\?name=sample.png$/);assert.equal(d.getElementById('filePreviewTitle').textContent,'sample.png');assert.equal(calls.files,1);
});

test('Forward refreshes the real app switcher through its nested dashboard launcher',async t=>{
  const {w,d,calls}=await clientFeatures(t);d.getElementById('homeApps').click();await until(()=>calls.apps===1&&d.querySelector('.nativeAppRow strong')?.textContent==='Current app 1');
  d.querySelector('#pcAppsDialog input').value='old search';w.history.back();await until(()=>w.PCRPages.current==='home');w.history.forward();
  await until(()=>calls.apps===2&&d.querySelector('.nativeAppRow strong')?.textContent==='Current app 2');assert.equal(d.querySelector('#pcAppsDialog input').value,'');assert.equal(w.PCRPages.current,'pcAppsDialog');
  w.history.back();await until(()=>w.PCRPages.current==='home');d.getElementById('homeApps').dataset.pcrDenied='true';w.history.forward();await tick();assert.equal(calls.apps,2,'Forward must not invoke a launcher after permission is withdrawn');assert.equal(d.getElementById('pcAppsDialog').open,false);
});

test('Forward never replays an unrelated earlier action for a programmatically opened page',async t=>{
  const {w,el}=fixture(t);let actions=0;el('screenBtn').addEventListener('click',()=>actions++);el('screenBtn').click();await tick();el('filesDialog').showModal();w.history.back();await until(()=>w.PCRPages.current==='rs');w.history.forward();await tick();assert.equal(actions,1);assert.equal(el('filesDialog').open,false);assert.equal(w.PCRPages.current,'rs');
});

test('keyboard and pointer preferences open above Settings from Home without starting a screen stream',async t=>{
  const {w,d,el,closed}=fixture(t),settings=d.createElement('dialog');settings.id='workspaceSettings';settings.innerHTML='<header><h2>Settings</h2><button data-close>Close</button></header><button data-preferences>Keyboard and pointer</button>';settings.querySelector('[data-close]').addEventListener('click',()=>settings.close());settings.querySelector('[data-preferences]').addEventListener('click',()=>w.rsPrefsOpen());d.body.append(settings);settings.showModal();settings.querySelector('[data-preferences]').click();
  assert.equal(el('rsSettings').tagName,'DIALOG');assert.equal(el('rsSettings').open,true);assert.equal(el('rs').classList.contains('hide'),true);assert.equal(w.PCRPages.current,'rsSettings');w.PCRPages.back();assert.equal(w.PCRPages.current,'workspaceSettings');assert.equal(settings.open,true);assert.equal(closed.screen,0);w.PCRPages.back();await until(()=>w.PCRPages.current==='home');
});
