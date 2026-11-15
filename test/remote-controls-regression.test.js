'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{JSDOM}=require('jsdom');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');
function fixture(t){
 const dom=new JSDOM('<html class="ecFlow"><body><div class="app"><div id="spatialHome"></div><div class="heroactions"></div></div><div id="rs"><div id="screenTools"></div><div id="rsv"><canvas id="rsc" tabindex="0"></canvas></div><section id="remoteSwipeDock"><div class="dockQuickKeys"><button id="rsKeyboard">Keyboard</button></div><div class="remoteSwipeSurfaces"></div></section><div id="typePanel" class="hide"><textarea id="typeText"></textarea></div><div id="rsSettings" class="hide"></div></div><div id="modal"></div></body></html>',{runScripts:'outside-only',pretendToBeVisual:true,url:'https://localhost'});t.after(()=>dom.window.close());
 const w=dom.window,d=w.document,calls=[];w.matchMedia=()=>({matches:false});w.PCRAuth={signedIn:false};w.PCRCanAccess=()=>true;w.rs={on:1,m:{w:1920,h:1080}};w.liveTyping=false;w.live={paused:true};w.rsResetTypingContext=()=>{w.live.paused=false;d.getElementById('typeText').value='';};w.rsScheduleLive=()=>calls.push('type');w.rsQueueRemoteCommand=c=>calls.push(c);w.rsTypeKey=k=>calls.push('key '+k);w.qc=c=>calls.push(c);w.msg=()=>{};w.rsTypeStatus=()=>{};
 w.rsKb=()=>{d.getElementById('rs').classList.add('typing');d.getElementById('typePanel').classList.remove('hide');};w.rsTypeClose=()=>{d.getElementById('rs').classList.remove('typing');d.getElementById('typePanel').classList.add('hide');};d.getElementById('rsKeyboard').onclick=()=>d.getElementById('rs').classList.contains('typing')?w.rsTypeClose():w.rsKb();
 w.eval(read('public/desktop-controls.js').split('// A separate relative touch surface')[0]);w.eval(read('public/sculpted-flow.js'));d.dispatchEvent(new w.Event('DOMContentLoaded'));
 const canvas=d.getElementById('rsc');canvas.focus();const key=(type,value,extra={})=>canvas.dispatchEvent(new w.KeyboardEvent(type,{key:value,bubbles:true,cancelable:true,...extra}));return{w,d,calls,key,canvas};
}
test('hardware typing starts without opening the phone text editor and never replays a paused draft',t=>{const f=fixture(t);f.d.getElementById('typeText').value='uncertain old draft';f.key('keydown','h',{code:'KeyH'});f.key('keydown','i',{code:'KeyI'});assert.equal(f.d.getElementById('typeText').value,'hi');assert.equal(f.w.liveTyping,true);assert.equal(f.d.activeElement,f.canvas);assert.equal(f.d.getElementById('typePanel').classList.contains('hide'),true);});
test('standalone Windows key is emitted on release and chords do not emit an extra Windows key',t=>{const f=fixture(t);f.key('keydown','Meta',{code:'MetaLeft',metaKey:true});f.key('keyup','Meta',{code:'MetaLeft'});assert.deepEqual(f.calls,['key 91']);f.calls.length=0;f.key('keydown','Meta',{code:'MetaLeft',metaKey:true});f.key('keydown','e',{code:'KeyE',metaKey:true});f.key('keyup','Meta',{code:'MetaLeft'});assert.deepEqual(f.calls,['combo 91,69']);});
test('permission denial blocks desktop keyboard input',t=>{const f=fixture(t);f.w.PCRCanAccess=()=>false;f.key('keydown','x',{code:'KeyX'});f.key('keydown','Meta',{code:'MetaLeft'});f.key('keyup','Meta',{code:'MetaLeft'});assert.deepEqual(f.calls,[]);assert.equal(f.d.getElementById('typeText').value,'');});
test('existing full-screen rail selects mouse or keyboard without leaving fullscreen',t=>{const f=fixture(t),screen=f.d.getElementById('rs');screen.classList.add('screenClean');assert.equal(screen.classList.contains('fullscreenMouse'),false);f.d.querySelector('[data-ec-rail=mouse]').click();assert.equal(screen.classList.contains('fullscreenMouse'),true);assert.equal(f.d.getElementById('remoteSwipeDock').dataset.snap,'2');f.d.querySelector('[data-ec-rail=keyboard]').click();assert.equal(screen.classList.contains('fullscreenMouse'),false);assert.equal(screen.classList.contains('typing'),true);assert.equal(screen.classList.contains('screenClean'),true);f.d.querySelector('[data-ec-rail=keyboard]').click();assert.equal(screen.classList.contains('typing'),false);});
test('expanded shelf handle changes height continuously and keeps it expanded',t=>{const f=fixture(t);f.d.querySelector('[data-ec-rail=mouse]').click();const h=f.d.querySelector('.ecShelfHandle'),dock=f.d.getElementById('remoteSwipeDock');h.onpointerdown({button:0,pointerId:1,clientY:400,preventDefault(){}});h.onpointermove({pointerId:1,clientY:320,preventDefault(){}});h.onpointerup({pointerId:1});assert.equal(dock.style.getPropertyValue('--ec-pad-height'),'235px');assert.equal(dock.dataset.snap,'2');assert.equal(f.w.localStorage.getItem('ec_trackpad_height'),'235');});

test('mouse Size controls resize both dimensions without sending PC input',t=>{
 const f=fixture(t),dock=f.d.getElementById('remoteSwipeDock'),panel=f.d.getElementById('ecPadSizing');
 const size=Array.from(f.d.querySelectorAll('.ecMouseActions button')).find(button=>button.textContent==='Size');
 size.click();assert.equal(panel.hidden,false);assert.equal(size.getAttribute('aria-expanded'),'true');
 const width=panel.querySelector('[data-pad-width]'),height=panel.querySelector('[data-pad-height]');
 width.value='65';width.dispatchEvent(new f.w.Event('input'));height.value='250';height.dispatchEvent(new f.w.Event('input'));
 assert.equal(dock.style.getPropertyValue('--ec-pad-width'),'65%');assert.equal(dock.style.getPropertyValue('--ec-pad-height'),'250px');assert.equal(dock.dataset.sizeCustom,'true');
 assert.equal(f.w.localStorage.getItem('ec_trackpad_width'),'65');assert.equal(f.w.localStorage.getItem('ec_trackpad_height'),'250');assert.deepEqual(f.calls,[]);
});

test('touch opens Size immediately without a compatibility click toggling it closed',t=>{
 const f=fixture(t),panel=f.d.getElementById('ecPadSizing'),size=Array.from(f.d.querySelectorAll('.ecMouseActions button')).find(button=>button.textContent==='Size');
 size.onpointerdown({button:0,preventDefault(){},stopPropagation(){}});assert.equal(panel.hidden,false);
 size.dispatchEvent(new f.w.MouseEvent('click',{detail:1,bubbles:true}));assert.equal(panel.hidden,false);assert.deepEqual(f.calls,[]);
});

test('Move mode accepts dragging on the panel body and protects PC input until Done',t=>{
 const f=fixture(t),dock=f.d.getElementById('remoteSwipeDock'),move=Array.from(dock.querySelectorAll('button')).find(button=>button.textContent==='Move'),pad=f.d.createElement('div');pad.className='remoteSwipePad';dock.querySelector('.remoteSwipeSurfaces').append(pad);let pcTouches=0;pad.addEventListener('pointerdown',()=>pcTouches++);
 const pointer=type=>{const e=new f.w.MouseEvent(type,{bubbles:true,cancelable:true,button:0,clientX:50,clientY:80});Object.defineProperty(e,'pointerId',{value:7});pad.dispatchEvent(e);return e;};
 move.click();assert.equal(move.textContent,'Done');dock.querySelector('[data-ec-click=l]').click();assert.deepEqual(f.calls,[]);assert.equal(pointer('pointerdown').defaultPrevented,true);pointer('pointerup');assert.equal(pcTouches,0);assert.deepEqual(f.calls,[]);
 move.click();assert.equal(move.textContent,'Move');pointer('pointerdown');assert.equal(pcTouches,1);
});
