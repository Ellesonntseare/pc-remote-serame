'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{JSDOM}=require('jsdom');
const source=fs.readFileSync(path.join(__dirname,'../public/collaboration.js'),'utf8');
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(check){for(let i=0;i<100;i++){if(check())return;await delay(10);}assert.fail('Session tools did not reach the expected state');}
function fixture(t,{permissions,config}={}){
  const dom=new JSDOM('<!doctype html><div class="heroactions"></div><div class="rsbot"></div>',{url:'http://localhost/',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window,d=w.document,sockets=[];
  w.ResizeObserver=class{observe(){}};w.HTMLCanvasElement.prototype.getContext=()=>({setTransform(){},clearRect(){},beginPath(){},moveTo(){},lineTo(){},stroke(){}});w.HTMLCanvasElement.prototype.setPointerCapture=()=>{};w.HTMLMediaElement.prototype.pause=function(){};
  w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){if(this.open){this.open=false;this.dispatchEvent(new w.Event('close'));}};
  w.PCRAuth={signedIn:true,role:permissions?'guest':'owner'};w.PCRCanAccess=key=>permissions?permissions[key]===true:true;w.rsTypeClose=()=>{};w.api=config||(async()=>({ok:true,iceServers:[]}));
  class Socket extends w.EventTarget{constructor(){super();this.readyState=1;this.bufferedAmount=0;this.sent=[];sockets.push(this);queueMicrotask(()=>this.dispatchEvent(new w.Event('open')));}send(value){this.sent.push(JSON.parse(value));}emit(value){this.onmessage?.({data:JSON.stringify(value)});}close(){if(this.readyState===3)return;this.readyState=3;this.onclose?.();this.dispatchEvent(new w.Event('close'));}}
  w.WebSocket=Socket;w.eval(source);t.after(()=>{d.querySelector('#collaborationDialog [data-close]').click();w.close();});return{w,d,sockets,q:selector=>d.querySelector(selector),async open(){d.querySelector('[data-collaboration-home]').click();await until(()=>sockets.length);const socket=sockets.at(-1);socket.emit({type:'ready',id:'self',room:permissions?'guest-room':null});socket.emit({type:'people',people:permissions?[{id:'owner',name:'Owner'}]:[{id:'guest',room:'guest-room',chat:true,notes:true}]});await delay(10);return socket;}};
}

test('chat stays in session tools and renders remote text safely in both directions',async t=>{
  const f=fixture(t),socket=await f.open();assert.ok(f.q('.rsbot [data-collaboration-tool]'));assert.equal(f.q('[data-panel=chat]').hidden,true);f.q('[data-tab=chat]').click();await until(()=>socket.sent.some(value=>value.type==='chat-join'));socket.emit({type:'chat',room:'guest-room',messages:[]});await delay(10);
  f.q('[data-chat-text]').value='Hello from this device';f.q('[data-chat-form]').dispatchEvent(new f.w.Event('submit',{bubbles:true,cancelable:true}));assert.equal(socket.sent.at(-1).type,'chat-send');assert.equal(socket.sent.at(-1).text,'Hello from this device');assert.equal(f.q('[data-chat-text]').value,'');
  socket.emit({type:'chat-message',room:'guest-room',message:{id:'message',text:'<img src=x onerror=bad()>',from:'Guest',at:Date.now()}});await until(()=>f.q('[data-messages]').textContent.includes('<img'));assert.equal(f.q('[data-messages] img'),null);assert.equal(f.q('[data-panel=chat]').hidden,false);
});

test('notes debounce edits, retain local drafts on conflicts and cancel queued saves on close',async t=>{
  const f=fixture(t),socket=await f.open();f.q('[data-tab=notes]').click();await until(()=>socket.sent.some(value=>value.type==='notes-join'));socket.emit({type:'notes',room:'guest-room',revision:0,document:{text:'',items:[]}});await delay(10);
  const input=f.q('[data-notes-text]');for(let i=0;i<12;i++){input.value='Draft '+i;input.dispatchEvent(new f.w.Event('input',{bubbles:true}));}assert.equal(socket.sent.filter(value=>value.type==='notes-update').length,0);await delay(920);assert.equal(socket.sent.filter(value=>value.type==='notes-update').length,1);const sent=socket.sent.find(value=>value.type==='notes-update');assert.equal(sent.document.text,'Draft 11');assert.equal(sent.baseRevision,0);
  socket.emit({type:'notes',room:'guest-room',revision:1,document:sent.document,by:'self'});await until(()=>f.q('[data-notes-status]').textContent==='Saved for this session');input.value='My unsaved draft';input.dispatchEvent(new f.w.Event('input',{bubbles:true}));socket.emit({type:'notes',room:'guest-room',revision:2,document:{text:'Other device update',items:[]},by:'someone-else'});await until(()=>!f.q('[data-notes-conflict]').hidden);assert.equal(input.value,'My unsaved draft');f.q('[data-notes-latest]').click();assert.equal(input.value,'Other device update');
  input.value='After latest';input.dispatchEvent(new f.w.Event('input',{bubbles:true}));f.q('[data-notes-save]').click();assert.equal(socket.sent.at(-1).baseRevision,2);socket.emit({type:'notes-conflict',room:'guest-room',revision:3,document:{text:'Newer version',items:[]}});await until(()=>!f.q('[data-notes-conflict]').hidden);f.q('[data-notes-mine]').click();assert.equal(socket.sent.at(-1).baseRevision,3);assert.equal(socket.sent.at(-1).document.text,'After latest');
  socket.emit({type:'notes',room:'guest-room',revision:4,document:{text:'After latest',items:[]},by:'self'});await delay(10);input.value='Cancelled pending edit';input.dispatchEvent(new f.w.Event('input',{bubbles:true}));const before=socket.sent.filter(value=>value.type==='notes-update').length;f.q('[data-close]').click();await delay(920);assert.equal(socket.sent.filter(value=>value.type==='notes-update').length,before);assert.equal(socket.readyState,3);assert.equal(input.value,'');
});

test('guest chat and notes are opt-in and configuration completing after close opens no socket',async t=>{
  const guest=fixture(t,{permissions:{voice:true}});assert.equal(guest.q('[data-tab=chat]').hidden,true);assert.equal(guest.q('[data-tab=notes]').hidden,true);
  let finish;const late=fixture(t,{config:()=>new Promise(resolve=>{finish=resolve;})});late.q('[data-collaboration-home]').click();late.q('[data-close]').click();finish({ok:true,iceServers:[]});await delay(20);assert.equal(late.sockets.length,0);
});
