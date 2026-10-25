'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),{JSDOM,CookieJar}=require('jsdom'),{createApp}=require('../server');
const pause=()=>new Promise(resolve=>setTimeout(resolve,20));
async function until(check){for(let n=0;n<300;n++){if(await check())return;await pause();}assert.fail('File interface did not finish the expected action');}
async function fixture(t){
  const root=await fs.mkdtemp(path.join(__dirname,'.transfer-check-'));let clipboard='From the PC',requested=0;const notifications=[],opened=[];
  const app=createApp({transferDirectory:root,disableAgent:true,disableActions:true,clipboardProvider:{get:async()=>clipboard,set:async value=>{clipboard=value;}},nativeFeatures:{openLink:async url=>opened.push(url),close(){}}});await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
  const base='http://127.0.0.1:'+app.server.address().port,paired=await fetch(base+'/api/pair',{method:'POST',headers:{'X-PCR':'1'},body:'{}'}),jar=new CookieJar();await jar.setCookie(paired.headers.getSetCookie()[0],base);
  const dom=new JSDOM('<!doctype html><div class="heroactions"></div><div class="rsbot"></div>',{url:base,runScripts:'outside-only',pretendToBeVisual:true,cookieJar:jar}),w=dom.window,d=w.document;
  w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){if(!this.open)return;this.open=false;this.dispatchEvent(new w.Event('close'));};
  w.rsTypeClose=()=>{};w.PCRAuth={signedIn:true,role:'owner'};w.PCRCanAccess=()=>true;w.PCRGuestAccess={applyPermissions(){}};
  w.api=async(route,options={})=>{const response=await fetch(new URL(route,base),{...options,headers:{'X-PCR':'1',Cookie:await jar.getCookieString(base),...options.headers}});return {status:response.status,...await response.json()};};
  w.navigator.clipboard={writeText:async()=>{},readText:async()=>''};
  w.Notification=class{static permission='default';static async requestPermission(){requested++;this.permission='granted';return 'granted';}constructor(title,options){notifications.push({title,options});}};
  w.eval(await fs.readFile(path.join(__dirname,'../public/file-transfers.js'),'utf8'));d.querySelector('.filesHome').click();await until(()=>d.getElementById('filesDialog').open);
  t.after(async()=>{w.close();app.stop();await new Promise(resolve=>app.server.close(resolve));assert.equal(path.dirname(root),__dirname);assert.ok(path.basename(root).startsWith('.transfer-check-'));await fs.rm(root,{recursive:true,force:true});});
  return {w,d,root,notifications,opened,get requested(){return requested;},get clipboard(){return clipboard;},choose(files,id='filesInput'){const input=d.getElementById(id);Object.defineProperty(input,'files',{configurable:true,value:files});input.dispatchEvent(new w.Event('change'));}};
}
test('phone file selection and text save send actual bytes through the live HTTP upload path',async t=>{
  const f=await fixture(t),content='Phone file\n世界 😀';f.choose([new f.w.File([content],'phone.txt',{lastModified:7})]);
  await until(()=>f.d.getElementById('filesStatus').textContent==='1 file sent to your PC.');assert.equal(await fs.readFile(path.join(f.root,'phone.txt'),'utf8'),content);
  f.d.getElementById('filesNote').value='Text without a filename';f.d.getElementById('filesSendText').click();await until(async()=>{try{return await fs.readFile(path.join(f.root,'Quick note.txt'),'utf8')==='Text without a filename';}catch{return false;}});
  assert.equal(f.d.getElementById('filesStatus').dataset.error,'false');assert.equal(f.requested,0,'transfers never request notification permission themselves');
});
test('the primary upload target is a real tappable input instead of a hidden synthetic picker',async t=>{
  const f=await fixture(t),input=f.d.getElementById('filesInput');assert.equal(input.hidden,false);assert.ok(input.parentElement.classList.contains('filesPickerSlot'));assert.equal(input.getAttribute('aria-label'),'Choose files to send to your PC');assert.equal(input.multiple,true);assert.equal(f.d.getElementById('filesChoose').getAttribute('aria-hidden'),'true');
});
test('text moves in both directions without a filename or an open remote screen',async t=>{
  const f=await fixture(t),text='From phone\nمرحبا 👋';f.d.getElementById('filesNote').value=text;f.d.getElementById('clipboardSend').click();await until(()=>f.clipboard===text);
  f.d.getElementById('filesNote').value='';f.d.getElementById('clipboardGet').click();await until(()=>f.d.getElementById('filesNote').value===text);
  assert.match(f.d.getElementById('filesStatus').textContent,/received/);
});
test('folder batches preserve relative paths and completion notifications require explicit opt-in',async t=>{
  const f=await fixture(t);assert.equal(f.requested,0);const toggle=f.d.getElementById('filesNotify');toggle.click();await until(()=>f.requested===1);
  const first=new f.w.File(['one'],'same.txt',{lastModified:1}),second=new f.w.File(['two'],'same.txt',{lastModified:2});
  Object.defineProperty(first,'webkitRelativePath',{value:'Folder/A/same.txt'});Object.defineProperty(second,'webkitRelativePath',{value:'Folder/B/same.txt'});f.choose([first,second],'filesFolderInput');
  await until(()=>f.d.getElementById('filesStatus').textContent==='2 files sent to your PC.');assert.equal(await fs.readFile(path.join(f.root,'Folder/A/same.txt'),'utf8'),'one');assert.equal(await fs.readFile(path.join(f.root,'Folder/B/same.txt'),'utf8'),'two');
  assert.equal(f.notifications.length,1);assert.match(f.notifications[0].title,/2 files/);await until(()=>f.d.querySelector('.filesFolderDownload'));assert.match(f.d.querySelector('.filesFolderDownload').href,/\/api\/files\/folder\?name=Folder$/);
});
test('denied uploads explain the missing approval and do not start a transfer',async t=>{
  const f=await fixture(t);f.w.PCRCanAccess=permission=>permission!=='upload';f.choose([new f.w.File(['private'],'denied.txt')]);await until(()=>f.d.getElementById('filesStatus').textContent.includes('not approved'));
  assert.equal(f.d.getElementById('filesStatus').dataset.error,'true');assert.deepEqual((await fs.readdir(f.root)).filter(name=>!name.startsWith('.')),[]);
});
test('link UI sends to the device inbox and opens the PC browser only after choosing Open on PC',async t=>{
  const f=await fixture(t);f.w.eval(await fs.readFile(path.join(__dirname,'../public/device-links.js'),'utf8'));await until(()=>f.d.getElementById('deviceLinks'));f.d.getElementById('textTab').click();
  const panel=f.d.getElementById('deviceLinks'),input=f.d.getElementById('deviceLinkUrl');input.value='example.com/from-phone';panel.querySelector('[data-link-send]').click();await until(()=>panel.querySelector('.deviceLinkRow'));assert.deepEqual(f.opened,[],'sharing a link never launches a browser');
  assert.match(panel.querySelector('.deviceLinkRow').textContent,/example.com/);panel.querySelector('.deviceLinkForm').dispatchEvent(new f.w.Event('submit',{bubbles:true,cancelable:true}));await until(()=>f.opened.length===1);assert.deepEqual(f.opened,['https://example.com/from-phone']);
});
