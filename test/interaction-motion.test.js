'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{JSDOM}=require('jsdom');
const source=fs.readFileSync(path.join(__dirname,'../public/interaction-motion.js'),'utf8');
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
function fixture(t,{reduced=false,animationAPI=true}={}){
 const dom=new JSDOM('<html class="ecFlow"><head><style>button{position:static}</style></head><body><button id="action">Open files</button><div id="rs"><button id="mouse">Left mouse</button><canvas id="rsc"></canvas></div><section id="ecHome"><header>Home</header><section id="homePanel">Tools</section></section><dialog id="filesDialog"><header>Files</header><section id="filePanel">Folders<div data-pc-files><div data-entries></div></div></section><div id="preview"><video></video></div></dialog><nav class="ecNavigation"><button aria-current="page"><svg></svg></button></nav><div id="ecRailChoices" hidden><button>Mouse</button><button>Files</button></div><div class="secondScreenDiagram" data-orientation="landscape"><button data-placement="left" aria-pressed="false"><span class="secondScreenPhone"></span></button><button data-placement="right" aria-pressed="true"><span class="secondScreenPhone"></span></button></div></body></html>',{url:'https://pc.test',runScripts:'outside-only',pretendToBeVisual:true});
 const w=dom.window,calls=[],listeners=[];w.PCRAuth={signedIn:true,role:'owner'};const media={matches:reduced,addEventListener:(_,fn)=>listeners.push(fn)};w.matchMedia=()=>media;
 if(animationAPI)w.Element.prototype.animate=function(frames,options){let finish;const animation={node:this,frames,options,cancelled:false,finished:new Promise(resolve=>finish=resolve),cancel(){this.cancelled=true;finish();},finish(){finish();}};calls.push(animation);return animation;};
 for(const button of w.document.querySelectorAll('button'))button.getBoundingClientRect=()=>({left:0,top:0,width:100,height:44});
 for(const icon of w.document.querySelectorAll('.secondScreenPhone'))icon.getBoundingClientRect=()=>({left:icon.parentElement.dataset.placement==='left'?0:200,top:60,width:18,height:10});
 w.eval(source);w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
 t.after(()=>{w.PCRMotion.stop();w.close();});
 function pointer(node,type,{x=10,y=10,id=1}={}){const event=new w.MouseEvent(type,{bubbles:true,cancelable:true,button:0,clientX:x,clientY:y});Object.defineProperty(event,'pointerId',{value:id});node.dispatchEvent(event);return event;}
 const emit=(name,detail)=>w.dispatchEvent(new w.CustomEvent(name,{detail}));return {w,calls,media,pointer,emit,reduce(){media.matches=true;listeners.forEach(fn=>fn());}};
}
test('press feedback preserves the original click and event propagation and releases on interruption',t=>{
 const f=fixture(t),button=f.w.document.getElementById('action');let clicks=0,down=0;button.onclick=()=>clicks++;f.w.document.addEventListener('pointerdown',()=>down++);
 const event=f.pointer(button,'pointerdown');assert.equal(event.defaultPrevented,false);assert.equal(down,1);assert.ok(button.classList.contains('ecMotionPressed'));assert.equal(clicks,0);
 f.pointer(button,'pointerup');button.click();assert.equal(clicks,1);assert.equal(button.classList.contains('ecMotionPressed'),false);
 f.pointer(button,'pointerdown');f.w.dispatchEvent(new f.w.Event('blur'));assert.equal(button.classList.contains('ecMotionPressed'),false);
});
test('dragging cancels the feedback and remote input controls receive no motion or intercepted events',t=>{
 const f=fixture(t),button=f.w.document.getElementById('action');f.pointer(button,'pointerdown');f.pointer(button,'pointermove',{x:45});assert.equal(button.classList.contains('ecMotionPressed'),false);assert.equal(button.querySelector('.ecMotionInk'),null);
 const count=f.calls.length,mouse=f.w.document.getElementById('mouse');let down=0;mouse.addEventListener('pointerdown',()=>down++);const event=f.pointer(mouse,'pointerdown');assert.equal(down,1);assert.equal(event.defaultPrevented,false);assert.equal(f.calls.length,count);assert.equal(mouse.querySelector('.ecMotionInk'),null);
});
test('system reduced motion and lightweight appearance stop active effects and suppress future movement',t=>{
 const f=fixture(t),button=f.w.document.getElementById('action');f.pointer(button,'pointerdown');f.reduce();assert.equal(f.w.PCRMotion.reduced,true);assert.equal(f.w.document.documentElement.dataset.motion,'reduce');assert.equal(button.classList.contains('ecMotionPressed'),false);assert.ok(f.calls.every(item=>item.cancelled));const count=f.calls.length;f.pointer(button,'pointerdown');f.emit('pcr:page',{id:'filesDialog'});assert.equal(f.calls.length,count);
 const light=fixture(t);light.w.PCRAppearance={light:true};light.emit('pcr:appearance',{mode:'light'});light.pointer(light.w.document.getElementById('action'),'pointerdown');assert.equal(light.calls.length,0);
});
test('navigation cancels interrupted page motion and leaves video and remote canvas geometry alone',t=>{
 const f=fixture(t);f.emit('pcr:page',{id:'home'});const first=f.calls.slice();assert.ok(first.some(item=>item.node.id==='homePanel'));f.emit('pcr:page',{id:'filesDialog'});assert.ok(first.every(item=>item.cancelled));assert.ok(f.calls.some(item=>item.node.id==='filePanel'));assert.ok(f.calls.every(item=>!['preview','rsc','rs'].includes(item.node.id)&&!['VIDEO','CANVAS'].includes(item.node.tagName)));const before=f.calls.length;f.emit('pcr:page',{id:'filesDialog'});assert.equal(f.calls.length,before,'duplicate page notifications do not replay the entrance');
});
test('screen placement follows selection and menu options animate when actually opened',async t=>{
 const f=fixture(t),diagram=f.w.document.querySelector('.secondScreenDiagram');diagram.querySelector('[data-placement=right]').setAttribute('aria-pressed','false');diagram.querySelector('[data-placement=left]').setAttribute('aria-pressed','true');await tick();const animation=f.calls.find(item=>item.node.classList.contains('secondScreenPhone'));assert.ok(animation);assert.match(animation.frames[0].transform,/translate\(200px,0px\)/);assert.equal(diagram.querySelector('[aria-pressed=true]').dataset.placement,'left');
 f.w.document.getElementById('ecRailChoices').hidden=false;await tick();assert.equal(f.calls.filter(item=>item.node.parentElement?.id==='ecRailChoices').length,2);
});
test('transfer success uses new completed transfers and never celebrates old history, pause or cancellation',t=>{
 const f=fixture(t),queue=tasks=>f.emit('pcr:transfer-queue',{origin:'https://pc.test',tasks});queue([{id:'old',state:'complete',direction:'download'}]);assert.equal(f.w.document.querySelector('.ecMotionReceipt'),null);queue([{id:'new',state:'running',direction:'download'}]);queue([{id:'new',state:'paused',direction:'download'}]);assert.equal(f.w.document.querySelector('.ecMotionReceipt'),null);queue([{id:'new',state:'complete',direction:'download'}]);assert.match(f.w.document.querySelector('.ecMotionReceipt').textContent,/saved on your phone/);f.emit('pcr:auth',{});assert.equal(f.w.document.querySelector('.ecMotionReceipt'),null);queue([{id:'cancel',state:'running'}]);queue([{id:'cancel',state:'cancelled'}]);assert.equal(f.w.document.querySelector('.ecMotionReceipt'),null);
});
test('older browser engines retain functional controls without the animation API',t=>{
 const f=fixture(t,{animationAPI:false}),button=f.w.document.getElementById('action');let clicks=0;button.onclick=()=>clicks++;f.pointer(button,'pointerdown');f.pointer(button,'pointerup');button.click();f.emit('pcr:page',{id:'filesDialog'});assert.equal(clicks,1);assert.equal(button.querySelector('.ecMotionInk'),null);assert.equal(f.calls.length,0);
});

test('Files animates asynchronously loaded folder rows, bounds the work and follows selection without changing actions',async t=>{
 const f=fixture(t),page=f.w.document.getElementById('filesDialog'),grid=page.querySelector('[data-entries]');page.open=true;f.w.PCRFileManager={state:{path:'Downloads'}};f.emit('pcr:page',{id:'filesDialog'});f.emit('pcr:files-before-render');
 for(let n=0;n<30;n++){const row=f.w.document.createElement('button');row.className='fmFile';row.dataset.file='photo'+n+'.jpg';row.innerHTML='<span class="fmFileIcon"></span>';grid.append(row);}
 f.emit('pcr:files-render');assert.equal(f.calls.filter(item=>item.node.classList.contains('fmFile')).length,18,'only the first visible rows animate');assert.equal(f.calls.find(item=>item.node.classList.contains('fmFile')).options.duration,340);
 const selected=grid.firstElementChild;let clicks=0;selected.onclick=()=>clicks++;selected.click();assert.equal(clicks,1);f.emit('pcr:files-state',{selection:[selected.dataset.file]});assert.ok(f.calls.some(item=>item.node===selected.querySelector('.fmFileIcon')));
 grid.setAttribute('aria-busy','true');await tick();assert.equal(page.classList.contains('ecFilesLoading'),true);grid.setAttribute('aria-busy','false');await tick();assert.equal(page.classList.contains('ecFilesLoading'),false);
 f.reduce();const count=f.calls.length;f.emit('pcr:files-before-render');f.w.PCRFileManager.state.path='Pictures';f.emit('pcr:files-render');assert.equal(f.calls.length,count);
});

test('Explorer icon sizing leaves the bottom navigation wave at full width',t=>{
 const dom=new JSDOM('<html class="ecFlow"><head></head><body><dialog id="filesDialog" class="explorerFiles" open><div class="fileManager"><svg id="folder"></svg></div><nav class="ecNavigation"><svg class="ecNavLiquid"></svg></nav></dialog></body></html>',{pretendToBeVisual:true});t.after(()=>dom.window.close());
 for(const name of ['sculpted-flow.css','explorer-windows.css']){const style=dom.window.document.createElement('style');style.textContent=fs.readFileSync(path.join(__dirname,'../public',name),'utf8');dom.window.document.head.append(style);}
 const w=dom.window;assert.equal(w.getComputedStyle(w.document.getElementById('folder')).width,'20px');assert.notEqual(w.getComputedStyle(w.document.querySelector('.ecNavLiquid')).width,'20px');
});
