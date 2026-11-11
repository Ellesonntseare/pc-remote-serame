'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{JSDOM}=require('jsdom');
const tick=()=>new Promise(resolve=>setTimeout(resolve,30));
async function fixture(t){
 const dom=new JSDOM('<div class="heroactions"></div>',{url:'https://pc.test',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window;
 t.after(()=>w.close());const sent=[],native=[];
 w.WebSocket=class{static OPEN=1;constructor(){this.readyState=1;this.bufferedAmount=0;w.socket=this;}send(value){sent.push(JSON.parse(value));}close(){}};
 w.ResizeObserver=class{observe(){}};
 w.PCRAuth={signedIn:true,role:'owner'};w.PCRAndroid={postMessage:value=>native.push(JSON.parse(value))};w.PCRNativeCapabilities={secondScreen:true};
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'));};
 w.PCRMseVideo={MseVideoSession:class{start(){}stop(){}}};w.fetch=async()=>({ok:true,json:async()=>({installed:true,phoneRegistered:true})});
 w.localStorage.setItem('elleson_second_screen_v1',JSON.stringify({fast:false}));
 for(const file of ['second-screen-policy.js','second-screen.js'])w.eval(fs.readFileSync(path.join(__dirname,'../public',file),'utf8'));
 w.document.dispatchEvent(new w.Event('DOMContentLoaded'));w.PCRSecondScreen.open();await tick();
 const page=w.document.getElementById('secondScreenPage'),stage=page.querySelector('.secondScreenStage');
 Object.defineProperties(stage,{clientWidth:{value:400},clientHeight:{value:200}});
 stage.getBoundingClientRect=()=>({left:0,top:0});
 function pointer(type,id,x,y){const event=new w.MouseEvent(type,{clientX:x,clientY:y,button:0,bubbles:true,cancelable:true});Object.defineProperty(event,'pointerId',{value:id});stage.dispatchEvent(event);}
 function ready(){page.querySelector('[data-start]').click();w.socket.onopen();w.socket.onmessage({data:JSON.stringify({type:'ready',monitorId:'a'.repeat(24),width:800,height:400})});}
 return {w,page,stage,sent,native,pointer,ready};
}
test('two-finger scrolling releases the original touch and cannot turn the last finger into a drag',async t=>{
 const f=await fixture(t);f.ready();
 f.pointer('pointerdown',1,100,100);f.pointer('pointermove',1,110,100);
 f.pointer('pointerdown',2,200,100);f.pointer('pointermove',1,110,120);f.pointer('pointerup',2,200,100);await tick();
 const before=f.sent.length;f.pointer('pointermove',1,150,140);f.pointer('pointerup',1,150,140);await tick();
 assert.equal(f.sent.length,before);
 const inputs=f.sent.filter(value=>value.type==='input');
 assert.deepEqual(inputs.map(value=>value.action),['down','move','up','wheel']);
 assert.equal(inputs[2].x,110/400);assert.ok(inputs[3].delta>0);
});
test('dragging beyond the image clamps the final position and cancellation releases the held button',async t=>{
 const f=await fixture(t);f.ready();f.pointer('pointerdown',1,100,100);f.pointer('pointermove',1,500,250);f.pointer('pointercancel',1,500,250);await tick();
 const inputs=f.sent.filter(value=>value.type==='input');assert.deepEqual(inputs.map(value=>value.action),['down','move','up']);
 assert.equal(inputs[1].x,1);assert.equal(inputs[1].y,1);assert.equal(inputs[2].x,1);
});
test('a long press survives finger jitter and opens one context menu',async t=>{
 const f=await fixture(t);f.ready();f.pointer('pointerdown',1,100,100);f.pointer('pointermove',1,102,101);
 await new Promise(resolve=>setTimeout(resolve,700));f.pointer('pointerup',1,102,101);
 assert.deepEqual(f.sent.filter(value=>value.type==='input').map(value=>value.action),['down','move','up','right']);
});
test('screen placement updates the selected side, direction hint and saved connection request',async t=>{
 const f=await fixture(t);
 for(const side of ['left','right','top','bottom']){
  f.page.querySelector('[data-placement="'+side+'"]').click();
  assert.equal(f.page.querySelector('[data-side]').value,side);
  assert.equal(f.page.querySelector('[aria-pressed=true]').dataset.placement,side);
  assert.match(f.page.querySelector('[data-placement-hint]').textContent,new RegExp(side+' edge'));
 }
 f.ready();assert.equal(f.sent.find(value=>value.type==='start').side,'bottom');
 assert.equal(f.page.querySelector('[data-placement=left]').disabled,true);
});
test('keyboard text stays available until Windows acknowledges it and Enter uses the same connection',async t=>{
 const f=await fixture(t);f.ready();f.page.querySelector('[data-keyboard]').click();
 const editor=f.page.querySelector('textarea');assert.equal(f.w.document.activeElement,editor);assert.equal(f.native.at(-1).type,'keyboard');
 editor.value='Hello 世界';f.page.querySelector('[data-send-text]').click();const input=f.sent.at(-1);
 assert.equal(input.text,'Hello 世界');assert.equal(editor.value,'Hello 世界');
 f.w.socket.onmessage({data:JSON.stringify({type:'input-result',id:input.id,action:'text',ok:false,message:'Tap a field'})});
 assert.equal(editor.value,'Hello 世界');assert.equal(f.page.querySelector('[data-send-text]').disabled,false);
 f.page.querySelector('[data-send-text]').click();const retry=f.sent.at(-1);
 f.w.socket.onmessage({data:JSON.stringify({type:'input-result',id:retry.id,action:'text',ok:true})});assert.equal(editor.value,'');
 f.page.querySelector('[data-key=Enter]').click();assert.equal(f.sent.at(-1).key,'Enter');
 f.w.PCRSecondScreen.stop();assert.equal(f.page.querySelector('.secondScreenKeyboard').hidden,true);
});
