'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{JSDOM}=require('jsdom');
const source=name=>fs.readFileSync(path.join(__dirname,'../public',name),'utf8');
const tick=()=>new Promise(setImmediate);
function fixture(t){
 const dom=new JSDOM('<div class="app"><section id="spatialHome"><div class="heroactions"><button data-dashboard-tile="file">Files</button></div></section></div><div id="rs"><div id="remoteSwipeDock"><button id="rsKeyboard">Keyboard</button></div><div id="screenTools"><details id="remoteOptions"><summary>Tools</summary></details></div></div><dialog id="filesDialog" class="pcrPage"><header class="filesHeader pcrPageHeader"><h2>Files</h2></header><div class="filesTabs"><button id="filesTab">Files</button><button id="filesClose">Close</button></div><section id="filesPane"><div id="filesDrop"></div><div id="filesList"></div></section></dialog>',{url:'https://pc.test',runScripts:'outside-only',pretendToBeVisual:true});
 const w=dom.window,d=w.document,remote=d.getElementById('rs'),calls={keyboard:0,files:0,tools:0};t.after(()=>w.close());
 w.matchMedia=()=>({matches:false});w.PCRAuth={signedIn:true,role:'owner'};w.PCRCanAccess=()=>true;w.PCRPages={current:'rs',park(){},resume(){return false;}};
 w.PCRWorkspace={getTiles:()=>[]};w.rsTypeClose=()=>remote.classList.remove('typing');
 d.getElementById('rsKeyboard').onclick=()=>{calls.keyboard++;remote.classList.add('typing');};d.querySelector('[data-dashboard-tile=file]').onclick=()=>calls.files++;d.querySelector('#remoteOptions>summary').onclick=()=>calls.tools++;
 w.fetch=async()=>({ok:true,json:async()=>({ok:true,entries:[{name:'Notes',label:'Notes',directory:true},{name:'report.txt',label:'report.txt',size:12}],locations:[{id:'',label:'Transfers'},{id:'@desktop',label:'Desktop',kind:'known'}]})});
 for(const name of ['file-manager.js','explorer-workspace.js'])w.eval(source(name));
 const sidebar=d.querySelector('.explorerSidebar'),tabs=d.querySelector('.explorerFolderTabs'),send=d.querySelector('.fmSendBar');
 w.eval(source('sculpted-flow.js'));d.dispatchEvent(new w.Event('DOMContentLoaded'));
 const rail=d.querySelector('.ecRemoteRail'),current=rail.querySelector('.ecRailCurrent'),choices=rail.querySelector('.ecRailChoices');
 w.innerWidth=390;w.innerHeight=844;Object.defineProperties(remote,{clientWidth:{value:390},clientHeight:{value:844}});remote.getBoundingClientRect=()=>({left:0,top:0,width:390,height:844});
 Object.defineProperties(rail,{offsetWidth:{get:()=>56},offsetHeight:{get:()=>choices.hidden?56:203},offsetLeft:{get:()=>parseFloat(rail.style.left)||326},offsetTop:{get:()=>parseFloat(rail.style.top)||62}});
 function pointer(type,x,y){current['on'+type]?.({pointerId:1,clientX:x,clientY:y,button:0,preventDefault(){}});}
 return{w,d,calls,remote,rail,current,choices,sidebar,tabs,send,pointer};
}
test('Explorer keeps its Windows layout, live nodes and working folder navigation after the new skin mounts',async t=>{
 const f=fixture(t);f.w.PCRPages.current='filesDialog';f.d.getElementById('filesDialog').open=true;await f.w.PCRFileManager.refresh();
 assert.ok(f.d.getElementById('filesDialog').classList.contains('explorerFiles'));
 assert.equal(f.sidebar.parentElement.className,'explorerBody');assert.equal(f.tabs.parentElement.className,'filesTabs');assert.equal(f.send.parentElement.className,'explorerTransferBar');
 assert.equal(f.d.querySelector('.filesHeader').hidden,true);assert.equal(f.d.querySelector('.ecFileLocations'),null);
 f.d.querySelector('.fmFileName').click();await tick();assert.equal(f.w.PCRFileManager.path,'Notes');
 assert.ok(f.d.querySelector('.explorerAddress [data-breadcrumb]'));assert.ok(f.d.querySelector('.explorerCommands .explorerViewMenu'));
});
test('floating mode button reveals only the other three actions and selecting one closes the choices',async t=>{
 const f=fixture(t);assert.equal(f.d.getElementById('remoteSwipeDock').dataset.snap,'2','Mouse mode starts with its trackpad visible');assert.equal(f.rail.dataset.mode,'mouse');assert.equal(f.choices.hidden,true);
 const editor=f.d.createElement('section');editor.id='typePanel';f.remote.append(editor);
 f.current.click();assert.equal(f.current.getAttribute('aria-expanded'),'true');assert.equal(f.calls.keyboard+f.calls.files+f.calls.tools,0);
 assert.deepEqual([...f.choices.children].filter(n=>!n.hidden).map(n=>n.dataset.ecRail),['keyboard','files','tools']);
 f.d.querySelector('[data-ec-rail=keyboard]').click();await tick();assert.equal(f.calls.keyboard,1);assert.equal(f.rail.dataset.mode,'keyboard');assert.equal(f.choices.hidden,true);assert.equal(editor.firstElementChild.className,'ecMouseActions');
 f.current.click();f.d.querySelector('[data-ec-rail=mouse]').click();await tick();assert.equal(f.remote.classList.contains('typing'),false);assert.equal(f.d.getElementById('remoteSwipeDock').dataset.snap,'2');assert.equal(f.d.querySelector('.ecMouseActions').previousElementSibling.className,'ecShelfHandle');
 f.current.click();f.d.querySelector('[data-ec-rail=files]').click();assert.equal(f.calls.files,1);assert.equal(f.rail.dataset.mode,'files');assert.equal(f.choices.hidden,true);
});
test('drag stays inside the phone viewport, persists its position and never opens a mode',t=>{
 const f=fixture(t);f.pointer('pointerdown',350,90);f.pointer('pointermove',-500,2000);f.pointer('pointerup',-500,2000);f.current.click();
 assert.equal(f.choices.hidden,true);assert.equal(f.rail.style.left,'8px');assert.equal(f.rail.style.top,'780px');assert.equal(f.calls.keyboard+f.calls.files+f.calls.tools,0);
 const saved=JSON.parse(f.w.localStorage.getItem('elleson_remote_rail_v1'));assert.equal(saved.x,0);assert.equal(saved.y,1);
 f.current.click();assert.equal(f.choices.hidden,false);assert.ok(parseFloat(f.rail.style.top)+203<=844);
 f.current.dispatchEvent(new f.w.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));assert.equal(f.choices.hidden,true);assert.equal(f.d.activeElement,f.current);
});
test('outside tap dismisses choices, keyboard state follows typing, and arrow keys move the button',async t=>{
 const f=fixture(t);f.current.click();f.d.body.dispatchEvent(new f.w.Event('pointerdown',{bubbles:true}));assert.equal(f.choices.hidden,true);
 f.remote.classList.add('typing');await tick();assert.equal(f.rail.dataset.mode,'keyboard');f.remote.classList.remove('typing');await tick();assert.equal(f.rail.dataset.mode,'mouse');assert.equal(f.d.getElementById('remoteSwipeDock').dataset.snap,'2','Closing the keyboard restores the trackpad');
 f.current.dispatchEvent(new f.w.KeyboardEvent('keydown',{key:'ArrowLeft',bubbles:true,cancelable:true}));assert.equal(f.rail.style.left,'314px');
 f.pointer('pointerdown',350,90);f.pointer('pointermove',250,190);f.pointer('pointercancel',250,190);assert.equal(f.rail.classList.contains('ecRailDragging'),false);
});
test('Files defaults to newest added across files and folders and reorders incoming items without losing selection',async t=>{
 const f=fixture(t),fm=f.w.PCRFileManager;f.w.PCRPages.current='filesDialog';f.d.getElementById('filesDialog').open=true;
 let entries=[{name:'Old.txt',label:'Old.txt',added:100,modified:900},{name:'New folder',label:'New folder',directory:true,added:300,modified:100},{name:'Latest.txt',label:'Latest.txt',added:400,modified:50},{name:'Fallback.txt',label:'Fallback.txt',modified:200}];
 f.w.fetch=async()=>({ok:true,json:async()=>({ok:true,entries,locations:[]})});
 f.w.localStorage.setItem('pcr_folders_https://pc.test_owner_view',JSON.stringify({sort:'name',descending:false}));f.w.dispatchEvent(new f.w.Event('pcr:auth'));await fm.refresh();
 const order=()=>[...f.d.querySelectorAll('.fmFileName')].map(n=>n.textContent);
 assert.equal(fm.state.sort,'added');assert.equal(fm.state.descending,true);assert.deepEqual(order(),['Latest.txt','New folder','Fallback.txt','Old.txt']);
 const selected=f.d.querySelector('[data-file="Old.txt"] input');selected.checked=true;selected.dispatchEvent(new f.w.Event('change'));
 entries=[...entries,{name:'Incoming.txt',label:'Incoming.txt',added:500,modified:10}];await fm.refresh();assert.deepEqual(order(),['Incoming.txt','Latest.txt','New folder','Fallback.txt','Old.txt']);assert.equal(selected.checked,true);
 fm.setView('icons');assert.deepEqual(order(),['Incoming.txt','Latest.txt','New folder','Fallback.txt','Old.txt']);
 fm.applyWorkspace({'files.sorting':{field:'name',descending:false}});assert.equal(fm.state.sort,'added','older synced defaults cannot undo newest-added ordering');
});
