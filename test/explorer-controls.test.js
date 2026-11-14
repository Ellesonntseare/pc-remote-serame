'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{JSDOM}=require('jsdom');
const read=name=>fs.readFileSync(path.join(__dirname,'../public',name),'utf8');
const tick=()=>new Promise(setImmediate);
function fixture(t){
 const dom=new JSDOM('<dialog id="filesDialog" open><div class="filesTabs"><button id="filesTab">Files</button><button id="filesClose">Close</button></div><section id="filesPane"><div id="filesDrop"></div><div id="filesList"></div></section></dialog>',{url:'http://pc.test',runScripts:'outside-only',pretendToBeVisual:true});t.after(()=>dom.window.close());const w=dom.window,d=w.document,requests=[];
 w.PCRAuth={signedIn:true,role:'owner'};w.PCRCanAccess=()=>true;w.matchMedia=()=>({matches:true,addEventListener(){}});
 w.fetch=async(url,options={})=>{requests.push({url,body:options.body&&JSON.parse(options.body)});const p=new URL(url,'http://pc.test'),prefix=p.searchParams.get('path')||'';return{ok:true,json:async()=>({ok:true,entries:[{name:(prefix?prefix+'/':'')+'report.txt',label:'report.txt',directory:false,size:12,modified:100}],locations:[{id:'',label:'Transfers'},{id:'@downloads',label:'Downloads',kind:'known'},{id:'@desktop',label:'Desktop',kind:'known'},{id:'@drive-c',label:'Local Disk (C:)',kind:'drive'}]})};};
 for(const name of ['file-manager.js','explorer-workspace.js','explorer-controls.js'])w.eval(read(name));d.dispatchEvent(new w.Event('DOMContentLoaded'));return{w,d,requests,fm:w.PCRFileManager,controls:w.PCRExplorerControls};
}
test('Back and Forward belong to their folder tab and survive switching and closing tabs',async t=>{
 const {fm}=fixture(t);await fm.refresh();fm.go('@downloads');await fm.refresh();fm.go('@downloads/Notes');await fm.refresh();fm.addTab();await fm.refresh();assert.equal(fm.path,'@this-pc');assert.equal(fm.history.canBack,false);fm.go('@desktop');await fm.refresh();fm.activateTab(0);await fm.refresh();assert.equal(fm.path,'@downloads/Notes');fm.back();await fm.refresh();assert.equal(fm.path,'@downloads');fm.forward();await fm.refresh();assert.equal(fm.path,'@downloads/Notes');fm.closeTab(0);await fm.refresh();assert.equal(fm.path,'@desktop');fm.back();await fm.refresh();assert.equal(fm.path,'@this-pc');
});
test('address entry resolves known folders, nested Windows paths and drives without executing arbitrary input',async t=>{
 const {fm,controls}=fixture(t);await fm.refresh();assert.equal(controls.resolveAddress('Downloads\\Notes'),'@downloads/Notes');assert.equal(controls.resolveAddress('Desktop'),'@desktop');assert.equal(controls.resolveAddress('C:\\Users\\Example'),'@drive-c/Users/Example');assert.equal(controls.resolveAddress('This PC'),'@this-pc');assert.throws(()=>controls.resolveAddress('Downloads\\..\\secret'));assert.throws(()=>controls.resolveAddress('powershell.exe -command anything'));
});
test('cut clipboard survives navigation, sends original names to the destination, and clears after success',async t=>{
 const {fm,controls,requests}=fixture(t);fm.go('@downloads');await fm.refresh();fm.select(['@downloads/report.txt']);controls.cut();assert.deepEqual(JSON.parse(JSON.stringify(controls.clipboard)),{mode:'cut',count:1});fm.go('@desktop');await fm.refresh();await controls.paste();const operation=requests.find(r=>r.url==='/api/files/operate');assert.deepEqual(operation.body,{action:'move',names:['@downloads/report.txt'],destination:'@desktop'});assert.equal(controls.clipboard,null);
});
test('copy is unavailable to guests and signing out clears an owner clipboard',async t=>{
 const {w,fm,controls}=fixture(t);await fm.refresh();fm.select(['report.txt']);controls.copy();assert.equal(controls.clipboard.count,1);w.PCRAuth={signedIn:false,role:'guest'};w.dispatchEvent(new w.Event('pcr:auth'));assert.equal(controls.clipboard,null);controls.copy();assert.equal(controls.clipboard,null);
});

test('Send to phone lists Android devices, captures the chosen file names and queues only to that phone',async t=>{
 const f=fixture(t);await f.fm.refresh();f.fm.select(['report.txt']);const baseFetch=f.w.fetch;let delivery;
 f.w.fetch=async(url,options={})=>url==='/api/sync/devices'?{ok:true,json:async()=>({devices:[{id:'phone-test-123456',name:'My phone',platform:'android',online:true},{id:'browser-test-1234',name:'PC browser',platform:'browser',online:true}]})}:url==='/api/phone/files'?(delivery=JSON.parse(options.body),{ok:true,json:async()=>({count:1,receiving:false})}):baseFetch(url,options);
 await f.controls.openPhoneSend();const dialog=f.d.getElementById('phoneSendDialog'),select=dialog.querySelector('select');assert.equal(dialog.open,true);assert.equal(select.options.length,2);assert.equal(select.value,'phone-test-123456');f.fm.select([]);dialog.querySelector('[data-phone-send]').click();await tick();
 assert.deepEqual(delivery.names,['report.txt']);assert.equal(delivery.target,'phone-test-123456');assert.match(delivery.group,/^[a-f0-9-]{36}$/);assert.match(dialog.textContent,/1 file queued for My phone/);assert.equal(dialog.querySelector('[data-phone-done]').hidden,false);assert.match(dialog.textContent,/save it automatically/);assert.equal(f.w.localStorage.getItem('pcr_send_phone:http://pc.test:owner'),'phone-test-123456');
});

test('multiple phones require a specific choice and guest accounts cannot open the sending dialog',async t=>{
 const f=fixture(t);await f.fm.refresh();f.fm.select(['report.txt']);f.w.fetch=async()=>({ok:true,json:async()=>({devices:[{id:'phone-test-111111',name:'First',platform:'android'},{id:'phone-test-222222',name:'Second',platform:'android'}]})});await f.controls.openPhoneSend();const dialog=f.d.getElementById('phoneSendDialog');assert.equal(dialog.querySelector('select').value,'');assert.equal(dialog.querySelector('[data-phone-send]').disabled,true);assert.ok(![...dialog.querySelector('select').options].some(option=>option.value==='*'));
 f.w.PCRAuth={signedIn:false,role:'guest'};f.w.dispatchEvent(new f.w.Event('pcr:auth'));assert.equal(dialog.open,false);await f.controls.openPhoneSend();assert.equal(dialog.open,false);assert.equal(f.d.querySelector('.explorerSendPhone').hidden,true);
});

test('Send to phone cancels pending discovery on sign-out and ignores its late response',async t=>{
 const f=fixture(t);await f.fm.refresh();f.fm.select(['report.txt']);let release,signal;f.w.fetch=async(url,options)=>{signal=options.signal;return new Promise(resolve=>release=()=>resolve({ok:true,json:async()=>({devices:[{id:'phone-test-111111',name:'Private phone',platform:'android'}]})}));};const opened=f.controls.openPhoneSend();await tick();f.w.PCRAuth={signedIn:false};f.w.dispatchEvent(new f.w.Event('pcr:auth'));assert.equal(signal.aborted,true);release();await opened;assert.equal(f.d.getElementById('phoneSendDialog').open,false);assert.ok(!f.d.getElementById('phoneSendDialog').textContent.includes('Private phone'));
});

test('quick locations update the upload destination and keep Save outside More',async t=>{
  const {w,d,fm}=fixture(t);
  await fm.refresh();
  const jump=d.querySelector('.explorerQuickLocations'),bar=d.querySelector('.explorerTransferBar');
  jump.value='@downloads';jump.dispatchEvent(new w.Event('change'));await fm.refresh();
  assert.equal(fm.path,'@downloads');
  assert.equal(bar.querySelector('[data-destination]').textContent,'PC / Downloads');
  const save=bar.querySelector('.explorerDownload');
  assert.equal(save.disabled,true);
  const downloads=[];
  d.addEventListener('click',event=>{if(event.target.matches('a[download]')){event.preventDefault();downloads.push(new URL(event.target.href).searchParams.get('name'));}});
  fm.select(['@downloads/report.txt']);
  assert.equal(save.disabled,false);
  save.click();
  assert.deepEqual(downloads,['@downloads/report.txt']);
  jump.value='@this-pc';jump.dispatchEvent(new w.Event('change'));await fm.refresh();
  assert.equal(bar.querySelector('.fmSendBar').hidden,true);
});
