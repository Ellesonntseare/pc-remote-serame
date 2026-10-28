'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom'),{wheelGesture}=require('../public/phone-mouse');
test('wheel gestures scroll in both axes and stay inside the phone at its edges',()=>{
  for(const point of [{x:0,y:0},{x:.5,y:.5},{x:1,y:1}])for(const [dx,dy]of [[0,120],[0,-120],[500,0],[-500,0],[0,100000]]){
    const value=wheelGesture(point,dx,dy);assert.equal(value.action,'swipe');
    for(const p of value.points)assert.ok(p.x>=0&&p.x<=1&&p.y>=0&&p.y<=1);
    const axis=dx?'x':'y';assert.equal(Math.sign(value.points[1][axis]-value.points[0][axis]),-Math.sign(dx||dy));
  }
  assert.equal(wheelGesture({x:0,y:0},0,0),null);assert.equal(wheelGesture({x:0,y:0},0,NaN),null);
});
test('captured mouse moves on the phone, bounds its position, coalesces scrolling and releases on Escape or lost access',async t=>{
  const dom=new JSDOM('<canvas tabindex="0"></canvas><button></button>',{runScripts:'outside-only',pretendToBeVisual:true});t.after(()=>dom.window.close());
  const w=dom.window,doc=w.document,canvas=doc.querySelector('canvas'),button=doc.querySelector('button'),pointers=[],gestures=[];let permitted=false,working=false;
  canvas.getBoundingClientRect=()=>({width:600,height:800});
  canvas.requestPointerLock=()=>{Object.defineProperty(doc,'pointerLockElement',{configurable:true,value:canvas});doc.dispatchEvent(new w.Event('pointerlockchange'));};
  doc.exitPointerLock=()=>{Object.defineProperty(doc,'pointerLockElement',{configurable:true,value:null});doc.dispatchEvent(new w.Event('pointerlockchange'));};
  w.eval(fs.readFileSync(path.join(__dirname,'../public/phone-mouse.js'),'utf8'));
  const mouse=w.PCRPhoneMouse.create({canvas,button,ready:()=>permitted,point:()=>({x:.25,y:.75}),sendPointer:v=>pointers.push(v),sendGesture:v=>gestures.push(v),busy:()=>working,status(){}});
  mouse.refresh();assert.equal(button.disabled,true);button.click();assert.equal(pointers.length,0);
  permitted=true;mouse.refresh();button.click();assert.equal(mouse.locked,true);assert.equal(pointers.at(-1).action,'pointer');
  const move=new w.MouseEvent('pointermove',{bubbles:true});Object.defineProperties(move,{movementX:{value:10000},movementY:{value:-10000}});canvas.dispatchEvent(move);
  assert.deepEqual(JSON.parse(JSON.stringify(mouse.point(move))),{x:1,y:0});
  working=true;for(let i=0;i<5;i++)canvas.dispatchEvent(new w.WheelEvent('wheel',{deltaY:120,cancelable:true}));
  await new Promise(r=>setTimeout(r,90));assert.equal(gestures.length,0);working=false;mouse.refresh();assert.equal(gestures.length,1,'wheel bursts retain one bounded pending scroll');
  doc.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));assert.equal(mouse.locked,false);assert.equal(pointers.at(-1).action,'hide-pointer');
  button.click();assert.equal(mouse.locked,true);permitted=false;mouse.refresh();assert.equal(mouse.locked,false);assert.equal(button.disabled,true);
});
