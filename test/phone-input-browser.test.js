'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{JSDOM}=require('jsdom');
function fixture(t){
  const dom=new JSDOM('<section><canvas tabindex="0"></canvas></section><aside></aside>',{url:'http://localhost',runScripts:'outside-only',pretendToBeVisual:true});t.after(()=>dom.window.close());
  const w=dom.window,doc=w.document,canvas=doc.querySelector('canvas'),commands=[],desktop=[],pointers=[],drops=[];let point={x:.2,y:.3},busy=false,available=true;
  const state={canControl:true,advancedInput:true,desktopAvailable:true,id:'approved'};
  canvas.setPointerCapture=()=>{};
  const mouse={locked:false,release(){},setPoint(value){point=value;}};
  w.PCRPhoneMouse={wheelGesture:require('../public/phone-mouse').wheelGesture};w.eval(fs.readFileSync(path.join(__dirname,'../public/phone-input.js'),'utf8'));
  const input=w.PCRPhoneInput.create({canvas,controls:doc.querySelector('aside'),mouse,ready:()=>available,busy:()=>busy,send:(command,external)=>{commands.push({command,external});busy=true;return true;},sendPointer:value=>pointers.push(value),sendDesktop:value=>desktop.push(value),state:()=>state,point:()=>point,status(){},upload:async files=>drops.push(files)});
  input.refresh();const ack=()=>{busy=false;input.result(true);};
  return {w,doc,canvas,input,commands,desktop,pointers,drops,state,ack,setPoint:value=>{point=value;},setAvailable:value=>{available=value;}};
}
test('phone preview sends a continued drag and direct keystrokes, and discards old input on rotation',t=>{
  const f=fixture(t),pointer=(type,button=0)=>f.canvas.dispatchEvent(new f.w.MouseEvent(type,{button,bubbles:true,cancelable:true}));
  pointer('pointerdown');assert.equal(f.commands[0].command.action,'touch-start');f.setPoint({x:.8,y:.9});pointer('pointermove');pointer('pointerup');f.ack();f.ack();f.ack();assert.deepEqual(f.commands.slice(0,3).map(v=>v.command.action),['touch-start','touch-move','touch-end']);
  f.canvas.dispatchEvent(new f.w.KeyboardEvent('keydown',{key:'h',bubbles:true,cancelable:true}));f.canvas.dispatchEvent(new f.w.KeyboardEvent('keydown',{key:'i',bubbles:true,cancelable:true}));f.canvas.dispatchEvent(new f.w.KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));f.ack();f.ack();f.ack();assert.deepEqual(f.commands.slice(3).map(v=>v.command.action),['insert','insert','key']);assert.equal(f.commands.at(-1).command.key,'Enter');
  pointer('pointerdown');f.setPoint({x:.4,y:.5});pointer('pointermove');f.input.rotate();const before=f.commands.length;f.ack();assert.equal(f.commands.length,before,'no old-orientation drag replays');
});
test('phone arrangement starts the fixed desktop mode and native keyboard input works while the browser is unfocused',t=>{
  const f=fixture(t);f.doc.querySelector('[data-side=left]').click();const edge=f.doc.querySelector('[data-phone-edge]');edge.checked=true;edge.dispatchEvent(new f.w.Event('change'));
  assert.equal(f.desktop.at(-1).type,'desktop-start');assert.equal(f.desktop.at(-1).side,'left');assert.equal(JSON.parse(f.w.localStorage.getItem('pcr_phone_desk_v1')).side,'left');
  f.input.desktopState({state:'active'});f.w.dispatchEvent(new f.w.Event('blur'));f.input.native({kind:'text',text:'fixture'});assert.equal(f.commands.at(-1).command.text,'fixture');assert.equal(f.commands.at(-1).external,true);f.ack();
  f.input.native({kind:'pointer',x:.4,y:.6});assert.equal(f.pointers.at(-1).points[0].x,.4);
  f.input.desktopState({state:'armed'});assert.equal(f.pointers.at(-1).action,'hide-pointer');
});
test('dropping a PC file forwards the original File object without renaming it',t=>{
  const f=fixture(t),file=new f.w.File(['fixture'],'Résumé + photo.png',{type:'image/png'}),drop=new f.w.Event('drop',{bubbles:true,cancelable:true});Object.defineProperty(drop,'dataTransfer',{value:{files:[file]}});f.canvas.dispatchEvent(drop);
  assert.equal(f.drops.length,1);assert.equal(f.drops[0][0],file);assert.equal(f.drops[0][0].name,'Résumé + photo.png');
});
