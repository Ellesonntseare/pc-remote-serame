'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {setTimeout:pause}=require('node:timers/promises');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const start=html.indexOf('// Compose locally through IME');
const end=html.indexOf('function fitRemoteViewport()',start);
assert.ok(start>=0&&end>start,'served keyboard implementation exists');

function keyboard(){
  const nodes=new Map(),requests=[],timers=new Set();
  function node(id){
    if(!nodes.has(id))nodes.set(id,{value:'',selectionStart:0,selectionEnd:0,textContent:'',dataset:{},listeners:{},classList:{add(){},remove(){},toggle(){}},setAttribute(){},focus(){},blur(){},addEventListener(name,fn){this.listeners[name]=fn;},setRangeText(text,start,end){this.value=this.value.slice(0,start)+text+this.value.slice(end);this.selectionStart=this.selectionEnd=start+text.length;}});
    return nodes.get(id);
  }
  const context=vm.createContext({
    $:node,rs:{on:1,m:{w:1920,h:1080}},ls:()=>null,qb:0,qq:[],mouseDrag:false,g:null,flush(){},TextEncoder,Intl,AbortController,
    btoa:value=>Buffer.from(value,'binary').toString('base64'),navigator:{},
    setTimeout(fn,ms){const timer=setTimeout(()=>{timers.delete(timer);fn();},ms);timers.add(timer);return timer;},
    clearTimeout(timer){timers.delete(timer);clearTimeout(timer);},
    api(url,options){
      const request={url,...JSON.parse(options.body)};requests.push(request);
      return new Promise((resolve,reject)=>{request.resolve=()=>resolve({ok:true,status:200,delivered:true});request.reject=()=>reject(Error('Connection lost'));});
    }
  });
  vm.runInContext(html.slice(start,end),context);
  return {requests,node,run:source=>vm.runInContext(source,context),input(value){const input=node('typeText');input.value=value;input.selectionStart=input.selectionEnd=value.length;input.listeners.input({isComposing:false});},dispose(){for(const timer of timers)clearTimeout(timer);}};
}
async function until(predicate){for(let i=0;i<100;i++){if(predicate())return;await pause(10);}throw Error('Keyboard did not reach expected state');}
function edit(request){assert.equal(request.wait,true);assert.equal(request.cmds.length,1);assert.match(request.cmds[0],/^edit /);return JSON.parse(Buffer.from(request.cmds[0].slice(5),'base64').toString('utf8'));}

test('live typing serializes fast edits, backspace and corrections behind acknowledgements',async t=>{
  const k=keyboard();t.after(()=>k.dispose());
  k.input('h');await until(()=>k.requests.length===1);assert.deepEqual(edit(k.requests[0]),{remove:0,text:'h'});
  k.input('hello');await pause(80);assert.equal(k.requests.length,1,'no concurrent request');
  k.requests[0].resolve();await until(()=>k.requests.length===2);assert.deepEqual(edit(k.requests[1]),{remove:0,text:'ello'});
  k.requests[1].resolve();await until(()=>!k.run('typeBusy'));
  k.input('hell');await until(()=>k.requests.length===3);assert.deepEqual(edit(k.requests[2]),{remove:1,text:''});k.requests[2].resolve();await until(()=>!k.run('typeBusy'));
  k.input('Hello');await until(()=>k.requests.length===4);assert.deepEqual(edit(k.requests[3]),{remove:4,text:'Hello'});k.requests[3].resolve();await until(()=>!k.run('typeBusy'));
  assert.equal(k.run('live.sent'),'Hello');
});

test('IME waits for composition end and emits Unicode once',async t=>{
  const k=keyboard();t.after(()=>k.dispose());
  k.node('typeText').listeners.compositionstart();k.input('你好 👩🏽‍💻');await pause(100);assert.equal(k.requests.length,0);
  k.node('typeText').listeners.compositionend();await until(()=>k.requests.length===1);assert.deepEqual(edit(k.requests[0]),{remove:0,text:'你好 👩🏽‍💻'});
  k.requests[0].resolve();await until(()=>!k.run('typeBusy'));await pause(80);assert.equal(k.requests.length,1);
});

test('ambiguous delivery pauses live typing and preserves draft without replay',async t=>{
  const k=keyboard();t.after(()=>k.dispose());
  k.input('keep this');await until(()=>k.requests.length===1);k.requests[0].reject();await until(()=>k.run('live.paused'));
  k.input('keep this new draft');await pause(100);assert.equal(k.requests.length,1);assert.equal(k.node('typeText').value,'keep this new draft');
  assert.match(k.node('typeStatus').textContent,/paused/);
  k.run('rsNewField()');assert.equal(k.node('typeText').value,'');assert.equal(k.run('live.paused'),false);
  k.input('new field');await until(()=>k.requests.length===2);assert.deepEqual(edit(k.requests[1]),{remove:0,text:'new field'});k.requests[1].resolve();
});

test('stale acknowledgements cannot resume a disconnected typing context',async t=>{
  const k=keyboard();t.after(()=>k.dispose());
  k.input('in flight');await until(()=>k.requests.length===1);k.run("rsPauseLive('Screen disconnected')");
  k.input('draft after disconnect');k.requests[0].resolve();await until(()=>!k.run('typeBusy'));await pause(100);
  assert.equal(k.requests.length,1);assert.equal(k.run('live.sent'),'');assert.equal(k.run('live.paused'),true);assert.equal(k.node('typeText').value,'draft after disconnect');
});

test('Enter waits for pending text and starts a fresh typing context',async t=>{
  const k=keyboard();t.after(()=>k.dispose());
  k.input('hello');await until(()=>k.requests.length===1);const entering=k.run('rsTypeKey(13)');
  await pause(50);assert.equal(k.requests.length,1);k.requests[0].resolve();await until(()=>k.requests.length===2);
  assert.deepEqual(k.requests[1].cmds,['key 13']);k.requests[1].resolve();await entering;assert.equal(k.node('typeText').value,'');assert.equal(k.run('live.sent'),'');
});

test('repeated empty Backspace keys are queued ahead of newer text',async t=>{
  const k=keyboard();t.after(()=>k.dispose());
  const first=k.run('rsTypeKey(8)'),second=k.run('rsTypeKey(8)');k.input('a');
  await until(()=>k.requests.length===1);assert.deepEqual(k.requests[0].cmds,['key 8']);k.requests[0].resolve();
  await until(()=>k.requests.length===2);assert.deepEqual(k.requests[1].cmds,['key 8']);k.requests[1].resolve();
  assert.deepEqual(await Promise.all([first,second]),[true,true]);
  await until(()=>k.requests.length===3);assert.deepEqual(edit(k.requests[2]),{remove:0,text:'a'});k.requests[2].resolve();
});

test('Enter preserves ordering across repeated submits and continued typing',async t=>{
  const k=keyboard();t.after(()=>k.dispose());
  k.input('hello');const first=k.run('rsTypeKey(13)');assert.equal(k.node('typeText').value,'');
  k.input('world');const second=k.run('rsTypeKey(13)');k.input('next');
  await until(()=>k.requests.length===1);assert.equal(k.requests[0].cmds.length,2);assert.match(k.requests[0].cmds[0],/^edit /);assert.equal(k.requests[0].cmds[1],'key 13');
  assert.deepEqual(JSON.parse(Buffer.from(k.requests[0].cmds[0].slice(5),'base64').toString()),{remove:0,text:'hello'});k.requests[0].resolve();
  await until(()=>k.requests.length===2);assert.deepEqual(JSON.parse(Buffer.from(k.requests[1].cmds[0].slice(5),'base64').toString()),{remove:0,text:'world'});assert.equal(k.requests[1].cmds[1],'key 13');k.requests[1].resolve();
  assert.deepEqual(await Promise.all([first,second]),[true,true]);
  await until(()=>k.requests.length===3);assert.deepEqual(edit(k.requests[2]),{remove:0,text:'next'});k.requests[2].resolve();
});

test('failed queued Enter preserves unsent lines and cancels remaining keys',async t=>{
  const k=keyboard();t.after(()=>k.dispose());
  k.input('first line');const first=k.run('rsTypeKey(13)');k.input('second line');const second=k.run('rsTypeKey(13)');k.input('last line');
  await until(()=>k.requests.length===1);k.requests[0].reject();await until(()=>k.run('live.paused'));
  assert.deepEqual(await Promise.all([first,second]),[false,false]);assert.equal(k.node('typeText').value,'first line\nsecond line\nlast line');
  await pause(100);assert.equal(k.requests.length,1,'ambiguous keys never replay');
});

test('desktop shortcut waits for earlier text and newer typing starts at the new caret',async t=>{
  const k=keyboard();t.after(()=>k.dispose());
  k.input('typed text');const shortcut=k.run("rsQueueRemoteCommand('combo 17,65')");k.input('replacement');
  await until(()=>k.requests.length===1);assert.deepEqual(k.requests[0].cmds.slice(1),['combo 17,65']);
  assert.deepEqual(JSON.parse(Buffer.from(k.requests[0].cmds[0].slice(5),'base64').toString()),{remove:0,text:'typed text'});k.requests[0].resolve();assert.equal(await shortcut,true);
  await until(()=>k.requests.length===2);assert.deepEqual(edit(k.requests[1]),{remove:0,text:'replacement'});k.requests[1].resolve();
});

test('failed desktop shortcut preserves its captured text and cancels replay',async t=>{
  const k=keyboard();t.after(()=>k.dispose());
  k.input('saved before navigation');const shortcut=k.run("rsQueueRemoteCommand('key 9')");k.input('new draft');
  await until(()=>k.requests.length===1);k.requests[0].reject();await until(()=>k.run('live.paused'));assert.equal(await shortcut,false);
  assert.equal(k.node('typeText').value,'saved before navigation\nnew draft');await pause(100);assert.equal(k.requests.length,1);
});
