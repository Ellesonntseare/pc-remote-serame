'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),{JSDOM,CookieJar}=require('jsdom'),{createApp}=require('../server');
const pause=()=>new Promise(resolve=>setTimeout(resolve,20));
async function until(check,detail,timeout=6000){const deadline=Date.now()+timeout;while(Date.now()<deadline){if(await check())return;await pause();}assert.fail('File interface did not finish the expected action'+(detail?': '+detail():''));}
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

test('an existing name pauses until Replace is chosen and keeps the original filename',async t=>{
  const f=await fixture(t),name='Original + résumé.txt';await fs.writeFile(path.join(f.root,name),'old');
  f.choose([new f.w.File(['replacement'],name,{lastModified:9})]);
  await until(()=>!f.d.getElementById('filesReplaceExisting').hidden);
  assert.equal(await fs.readFile(path.join(f.root,name),'utf8'),'old');
  f.d.getElementById('filesReplaceExisting').click();
  await until(()=>f.d.getElementById('filesStatus').textContent==='1 file sent to your PC.');
  assert.equal(await fs.readFile(path.join(f.root,name),'utf8'),'replacement');
  assert.deepEqual((await fs.readdir(f.root)).filter(n=>!n.startsWith('.pcr-')),[name]);
});

test('completed uploads expose the saved PC file action and reject destinations outside the transfer folder',async t=>{
  const f=await fixture(t);f.choose([new f.w.File(['complete'],'finished.txt')]);await until(()=>f.d.getElementById('filesStatus').textContent==='1 file sent to your PC.');const button=f.d.querySelector('#filesBatchList .filesSmallButton');assert.equal(button.textContent,'Show in PC folder');button.click();await until(()=>f.d.getElementById('filesStatus').textContent.includes('directly on your Windows PC'));assert.equal(await fs.readFile(path.join(f.root,'finished.txt'),'utf8'),'complete');
  const rejected=await f.w.api('/api/files/reveal',{method:'POST',body:JSON.stringify({name:'../outside.txt'})});assert.equal(rejected.status,400);
});
test('text moves in both directions without a filename or an open remote screen',async t=>{
  const f=await fixture(t),text='From phone\nمرحبا 👋';f.d.getElementById('filesNote').value=text;f.d.getElementById('clipboardSend').click();await until(()=>f.clipboard===text);
  f.d.getElementById('filesNote').value='';f.d.getElementById('clipboardGet').click();await until(()=>f.d.getElementById('filesNote').value===text);
  assert.match(f.d.getElementById('filesStatus').textContent,/received/);
});
test('Text & links switches away from Explorer and its Files button restores folder browsing',async t=>{
 const f=await fixture(t),dialog=f.d.getElementById('filesDialog');dialog.classList.add('workspacePage','pcrPage');
 f.w.fetch=async(route,options={})=>{const data=await f.w.api(route,options);return{ok:data.status<400,json:async()=>data};};
 for(const name of ['file-manager.js','explorer-workspace.js','device-links.js'])f.w.eval(await fs.readFile(path.join(__dirname,'../public',name),'utf8'));
 f.d.getElementById('textTab').click();assert.equal(f.d.getElementById('filesPane').hidden,true);assert.equal(f.d.getElementById('textPane').hidden,false);assert.equal(dialog.classList.contains('filesTextActive'),true);assert.equal(f.d.getElementById('textTab').getAttribute('aria-selected'),'true');assert.ok(f.d.getElementById('deviceLinkUrl'));
 f.d.getElementById('filesNote').value='Clipboard from the Text tab';f.d.getElementById('clipboardSend').click();await until(()=>f.clipboard==='Clipboard from the Text tab');
 f.d.getElementById('filesTab').click();assert.equal(f.d.getElementById('filesPane').hidden,false);assert.equal(f.d.getElementById('textPane').hidden,true);assert.equal(dialog.classList.contains('filesTextActive'),false);assert.ok(f.d.querySelector('.explorerBody .explorerSidebar'));
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

function holdChunk(f,number=1){const Real=f.w.XMLHttpRequest;let started=0,held=null;f.w.XMLHttpRequest=class extends Real{send(body){if(++started===number){this.holding=true;this.abortCount=0;held=this;return;}super.send(body);}abort(){if(this.holding){this.holding=false;this.abortCount++;this.onabort?.();}else super.abort();}};return()=>held;}

test('browser batches survive page changes and resume every remaining file into the original destination',async t=>{
  const f=await fixture(t),held=holdChunk(f),summaries=[];f.w.PCRFileManager={destination:'Original'};f.w.addEventListener('pcr:transfer-summary',event=>summaries.push(event.detail));f.w.eval(await fs.readFile(path.join(__dirname,'../public/transfer-badges.js'),'utf8'));
  f.choose(['one','two','three'].map((name,index)=>new f.w.File([name],name+'.txt',{lastModified:index+1})));await until(()=>held());
  f.d.getElementById('filesClose').click();assert.equal(held().abortCount,0,'changing feature pages must not stop uploads');assert.equal(f.d.querySelector('[data-files-button] .transferBadge').textContent,'3');
  f.d.querySelector('.filesHome').click();f.d.getElementById('filesPause').click();await until(()=>f.d.getElementById('filesPause').textContent==='Resume batch');assert.equal(summaries.at(-1).remaining,3);assert.equal(summaries.at(-1).paused,true);
  const leave=new f.w.Event('beforeunload',{cancelable:true});f.w.dispatchEvent(leave);assert.equal(leave.defaultPrevented,true,'closing the tab warns while File objects are still needed');
  f.w.PCRFileManager.destination='Another folder';f.d.getElementById('filesPause').click();await until(()=>f.d.getElementById('filesStatus').textContent==='3 files sent to your PC.',()=>JSON.stringify({status:f.d.getElementById('filesStatus').textContent,summary:summaries.at(-1),pause:f.d.getElementById('filesPause').textContent}),30000);
  for(const name of ['one','two','three'])assert.equal(await fs.readFile(path.join(f.root,'Original',name+'.txt'),'utf8'),name);
  await assert.rejects(fs.stat(path.join(f.root,'Another folder')),error=>error.code==='ENOENT');assert.equal(summaries.at(-1).remaining,0);assert.equal(f.d.querySelector('[data-files-button] .transferBadge').hidden,true);
  const finished=new f.w.Event('beforeunload',{cancelable:true});f.w.dispatchEvent(finished);assert.equal(finished.defaultPrevented,false);
});

test('cancelling a paused batch keeps completed files and discards only the unfinished upload',async t=>{
  const f=await fixture(t),held=holdChunk(f,2);f.choose(['sent','unfinished','queued'].map((name,index)=>new f.w.File([name],name+'.txt',{lastModified:index+1})));await until(()=>held());f.d.getElementById('filesPause').click();await until(()=>f.d.getElementById('filesPause').textContent==='Resume batch');assert.match(f.d.getElementById('filesProgressName').textContent,/2 files paused/);
  f.d.getElementById('filesCancel').click();await until(()=>f.d.getElementById('filesPending').children.length===0);assert.equal(f.d.getElementById('filesProgress').hidden,true);assert.equal(await fs.readFile(path.join(f.root,'sent.txt'),'utf8'),'sent');
  for(const name of ['unfinished','queued'])await assert.rejects(fs.stat(path.join(f.root,name+'.txt')),error=>error.code==='ENOENT');
});

test('signing out clears paused batches before another account can reuse the file selection',async t=>{
  const f=await fixture(t),held=holdChunk(f);f.choose([new f.w.File(['private'],'private.txt'),new f.w.File(['queued'],'queued.txt')]);await until(()=>held());f.d.getElementById('filesPause').click();await until(()=>f.d.getElementById('filesPause').textContent==='Resume batch');f.w.PCRAuth={signedIn:false};f.w.dispatchEvent(new f.w.Event('pcr:auth'));assert.equal(f.d.getElementById('filesProgress').hidden,true);assert.equal(f.d.getElementById('filesPending').children.length,0);const leave=new f.w.Event('beforeunload',{cancelable:true});f.w.dispatchEvent(leave);assert.equal(leave.defaultPrevented,false);
});

test('the browser upload screen follows the real upload and its cancel control reaches the existing batch',async t=>{
 const f=await fixture(t),held=holdChunk(f);f.w.eval(await fs.readFile(path.join(__dirname,'../public/native-transfers.js'),'utf8'));f.choose([new f.w.File(['upload screen'],'screen.txt')]);await until(()=>held());const screen=f.d.getElementById('uploadProgressScreen');assert.equal(screen.open,true);assert.match(screen.textContent,/screen.txt/);assert.match(screen.querySelector('h2').textContent,/Sending/);screen.querySelector('[data-upload-cancel]').click();await until(()=>screen.dataset.state==='cancelled');assert.equal(held().abortCount,1);assert.ok(!screen.textContent.includes('Saved on your PC'));assert.equal(screen.querySelector('[data-upload-done]').hidden,false);
});
