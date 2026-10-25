'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{JSDOM}=require('jsdom'),gestures=require('../public/touch-gestures');
const source=fs.readFileSync(path.join(__dirname,'../public/desktop-controls.js'),'utf8');
const dockSource=source.slice(source.indexOf('// A separate relative touch surface'),source.indexOf('// Optional input clutch'));

function fixture(t){
  const dom=new JSDOM('<div id="rs"><div class="screenTools"></div><div id="rsv"></div><div id="rsk" class="rskeys hide"></div><div class="rsbot"><button id="rsKeyboard">Keyboard</button><button id="keyToggle">Show keys</button></div></div>',{runScripts:'outside-only',pretendToBeVisual:true});
  t.after(()=>dom.window.close());const window=dom.window,commands=[],keys=[];
  window.rs={on:1,m:{w:1920,h:1080}};window.sens=1;window.rsCanPoint=()=>!window.PCRHoldControl||window.PCRHoldControl.can('pc');window.qc=command=>commands.push(command);window.rsTypeKey=key=>keys.push(key);window.PCRTouchGestures=gestures;
  window.eval(dockSource);window.document.dispatchEvent(new window.Event('DOMContentLoaded'));
  const pad=window.document.getElementById('remoteSwipePad'),rail=window.document.getElementById('remoteScrollRail');let layouts=0;
  pad.getBoundingClientRect=()=>{layouts++;return{left:0,top:0,width:360,height:100};};
  const pointer=(target,type,id,x=60,y=40,button=0)=>{const event=new window.MouseEvent(type,{button,clientX:x,clientY:y,bubbles:true,cancelable:true});Object.defineProperty(event,'pointerId',{value:id});target.dispatchEvent(event);};
  return{window,pad,rail,pointer,commands,keys,layouts:()=>layouts};
}

test('the dedicated scroll rail and common keyboard controls are visible outside the options menu',t=>{
  const f=fixture(t),doc=f.window.document,dock=doc.getElementById('remoteSwipeDock'),options=doc.getElementById('remoteOptions');
  assert.match(f.rail.getAttribute('aria-label'),/one finger/);assert.equal(f.rail.tabIndex,0);assert.ok(f.rail.querySelector('.remoteScrollTrack .remoteScrollThumb'));
  for(const id of ['rsKeyboard','keyToggle','rsk']){assert.equal(dock.contains(doc.getElementById(id)),true);assert.equal(options.contains(doc.getElementById(id)),false);}
  assert.equal(doc.querySelector('.dockQuickKeys').children.length,4);doc.querySelectorAll('.dockDirectKey').forEach(button=>button.click());assert.deepEqual(f.keys,[13,8]);
  f.window.PCRCanAccess=()=>false;f.window.dispatchEvent(new f.window.Event('pcr:auth'));assert.equal(doc.getElementById('rsKeyboard').dataset.pcrDenied,'true');
  f.window.PCRCanAccess=()=>true;f.window.dispatchEvent(new f.window.Event('pcr:auth'));assert.equal(doc.getElementById('rsKeyboard').dataset.pcrDenied,'false','relocated controls update their permission gates after sign-in');
});

test('one-finger rail swipes scroll without clicks, filter jitter and stop on cancellation',t=>{
  const f=fixture(t);f.pointer(f.rail,'pointerdown',1);f.pointer(f.rail,'pointermove',1,60,42);assert.deepEqual(f.commands,[]);
  f.pointer(f.rail,'pointermove',1,60,60);assert.deepEqual(f.commands,['wheel 80']);f.pointer(f.rail,'pointermove',1,60,50);assert.equal(f.commands.at(-1),'wheel -40');
  f.pointer(f.rail,'pointercancel',1);assert.equal(f.rail.classList.contains('active'),false);f.pointer(f.rail,'pointermove',1,60,100);assert.equal(f.commands.length,2);
  f.pointer(f.rail,'pointerdown',2);f.pointer(f.rail,'pointerup',2);assert.equal(f.commands.some(command=>command.startsWith('click')),false);
});

test('scroll rail supports normalized wheels and keyboard steps',t=>{
  const f=fixture(t);f.rail.dispatchEvent(new f.window.WheelEvent('wheel',{deltaY:2,deltaMode:1,cancelable:true}));assert.equal(f.commands.at(-1),'wheel -32');
  f.rail.dispatchEvent(new f.window.KeyboardEvent('keydown',{key:'PageUp',cancelable:true}));assert.equal(f.commands.at(-1),'wheel 720');
  f.window.PCRHoldControl={can:()=>false};f.rail.dispatchEvent(new f.window.KeyboardEvent('keydown',{key:'ArrowDown',cancelable:true}));assert.equal(f.commands.length,2);
});

test('trackpad geometry is measured once per gesture and a moved gesture cannot become a two-finger click',t=>{
  const f=fixture(t);f.pointer(f.pad,'pointerdown',1);for(let x=70;x<100;x+=5)f.pointer(f.pad,'pointermove',1,x,40);assert.equal(f.layouts(),1);assert.ok(f.commands.some(command=>command.startsWith('mv ')));
  f.pointer(f.pad,'pointerdown',2,110,40);f.pointer(f.pad,'pointerup',1,95,40);f.pointer(f.pad,'pointerup',2,110,40);assert.equal(f.commands.some(command=>command.startsWith('click')),false);
  f.pointer(f.pad,'pointerdown',3);f.pointer(f.pad,'pointerup',3);assert.equal(f.layouts(),2);assert.equal(f.commands.at(-1),'click l');
});

test('right-button holds never start a left drag, and hidden screens stop rail input',async t=>{
  const f=fixture(t);f.pointer(f.pad,'pointerdown',1,60,40,2);await new Promise(resolve=>setTimeout(resolve,475));f.pointer(f.pad,'pointerup',1,60,40,2);assert.equal(f.commands.includes('down l'),false);
  f.pointer(f.rail,'pointerdown',2);f.window.document.getElementById('rs').classList.add('hide');f.pointer(f.rail,'pointermove',2,60,80);assert.deepEqual(f.commands,[]);assert.equal(f.rail.classList.contains('active'),false);
});

test('touch gesture helpers reject malformed points and normalize line and page wheel units',()=>{
  assert.equal(gestures.create([null,{id:2,x:10,y:0}]),null);const gesture=gestures.create([{id:1,x:0,y:0},{id:2,x:100,y:0}],NaN);assert.equal(gesture.update(null),null);assert.equal(gesture.update([{id:1,x:-50,y:0},{id:2,x:150,y:0}]).zoom,2);
  assert.equal(gestures.wheelDelta({deltaY:1,deltaMode:0}),-1);assert.equal(gestures.wheelDelta({deltaY:1,deltaMode:1}),-16);assert.equal(gestures.wheelDelta({deltaY:1,deltaMode:2},600),-600);assert.equal(gestures.wheelDelta({deltaY:NaN}),0);
});
