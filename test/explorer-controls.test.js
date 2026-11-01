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
