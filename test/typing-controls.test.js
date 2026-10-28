'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{JSDOM}=require('jsdom');
const source=fs.readFileSync(path.join(__dirname,'../public/typing-controls.js'),'utf8');
function fixture(t){
  const dom=new JSDOM('<div id="rs"><div class="screenConnectionGroup"></div><button id="rsKeyboard">Keyboard</button><section id="typePanel" class="hide"><div class="typeTop"></div><textarea id="typeText" readonly></textarea><p id="typeStatus"></p></section><div id="rsv"><canvas id="rsc"></canvas></div></div>',{runScripts:'outside-only',pretendToBeVisual:true});t.after(()=>dom.window.close());
  const drafts=[];const window=dom.window,doc=window.document,input=doc.getElementById('typeText'),panel=doc.getElementById('typePanel'),requests=[],scheduled=[],messages=[],clicks=[];let focused=0,allowed=true;
  window.PCRAccountWorkspace={set:(key,value)=>drafts.push({key,value})};window.rs={on:1,m:{w:1920,h:1080}};window.live={paused:false,sent:'',generation:0,keys:[]};window.liveTyping=true;window.typeBusy=false;window.qb=0;window.qq=[];window.composing=false;
  window.rsTypingDirty=()=>false;window.PCRCanAccess=()=>allowed;window.PCRDeviceInput={focusKeyboard:()=>focused++};window.PCRScreenTools={imageBox:()=>({x:10,y:20,w:200,h:100})};window.msg=message=>messages.push(message);
  window.rsTypeStatus=(message,state)=>{doc.getElementById('typeStatus').textContent=message;doc.getElementById('typeStatus').dataset.state=state||'success';};window.rsScheduleLive=()=>{if(!window.live.paused&&window.liveTyping)scheduled.push(input.value);};
  window.rsPauseLive=message=>{window.live.paused=true;window.live.generation++;window.rsTypeStatus(message,'error');};window.rsResetTypingContext=()=>{window.live.paused=false;window.live.sent='';window.live.generation++;input.value='';};
  window.qc=command=>clicks.push(command);window.typingRequest=commands=>new Promise(resolve=>requests.push({commands:Array.from(commands),resolve}));window.submitTyping=commands=>{window.typeBusy=true;return new Promise(resolve=>requests.push({commands:Array.from(commands),resolve:ok=>{window.typeBusy=false;resolve(ok);}}));};
  window.rsKb=()=>{input.readOnly=false;panel.classList.remove('hide');doc.getElementById('rs').classList.add('typing');input.focus();};window.rsTypeClose=()=>{input.readOnly=true;panel.classList.add('hide');doc.getElementById('rs').classList.remove('typing');input.blur();};
  doc.getElementById('rsKeyboard').addEventListener('click',()=>window.rsKb());
  doc.addEventListener('pointerdown',event=>{if(!panel.classList.contains('hide')&&!panel.contains(event.target)&&event.target.id!=='rsKeyboard')window.rsTypeClose();},true);
  doc.getElementById('rsv').addEventListener('pointerdown',()=>messages.push('ordinary remote pointer ran'));
  window.eval(source);doc.dispatchEvent(new window.Event('DOMContentLoaded'));
  const pointer=(type,id=1,x=100,y=75)=>{const event=new window.MouseEvent(type,{button:0,clientX:x,clientY:y,bubbles:true,cancelable:true});Object.defineProperty(event,'pointerId',{value:id});doc.getElementById('rsc').dispatchEvent(event);};
  const choose=()=>doc.getElementById('choosePCField').click();
  return{window,doc,input,panel,drafts,requests,scheduled,messages,clicks,pointer,choose,focused:()=>focused,deny:()=>{allowed=false;}};
}

test('a direct screen tap opens the keyboard only after Windows confirms an editable field',async t=>{
  const f=fixture(t),tap=f.window.PCRTypingControls.tap({x:100,y:75});
  assert.deepEqual(f.clicks,['abs 864 593','click l']);await new Promise(r=>setTimeout(r,140));assert.deepEqual(f.requests[0].commands,['focus 864 593']);
  assert.equal(f.input.readOnly,true,'ordinary screen buttons must not summon the keyboard while checking focus');
  f.requests[0].resolve({editable:true});await tap;
  assert.equal(f.doc.activeElement,f.input);assert.equal(f.input.readOnly,false);
  assert.equal(f.doc.getElementById('remoteTypingState').dataset.state,'active');
  f.window.rsTypeClose();const button=f.window.PCRTypingControls.tap({x:100,y:75});await new Promise(r=>setTimeout(r,140));f.requests[1].resolve({editable:false});await button;assert.equal(f.input.readOnly,true);
});

test('a pending field check never blocks the second tap and only the latest field can open the keyboard',async t=>{const f=fixture(t),first=f.window.PCRTypingControls.tap({x:100,y:75});await new Promise(r=>setTimeout(r,140));assert.equal(f.window.typeBusy,false);const second=f.window.PCRTypingControls.tap({x:140,y:75});assert.equal(f.clicks.length,4,'both clicks are delivered immediately');f.requests[0].resolve({editable:true});await first;assert.equal(f.input.readOnly,true,'superseded focus must not summon the IME');await new Promise(r=>setTimeout(r,140));f.requests[1].resolve({editable:false});await second;assert.equal(f.input.readOnly,true);});

test('trackpad clicks check the actual PC cursor field and open the keyboard without another click',async t=>{
 const f=fixture(t);f.window.PCRTypingControls.afterPointer('click l');await new Promise(r=>setTimeout(r,250));assert.deepEqual(f.requests[0].commands,['focuscurrent']);assert.equal(f.clicks.length,0,'the original trackpad click must not be replayed');f.requests[0].resolve({editable:true});await new Promise(setImmediate);assert.equal(f.input.readOnly,false);assert.equal(f.doc.activeElement,f.input);
});

test('direct typing has no field picker, app text menu or draft confirmation',async t=>{
 const f=fixture(t);f.window.rsKb();assert.equal(f.doc.activeElement,f.input);assert.equal(f.doc.getElementById('choosePCField'),null);assert.equal(f.doc.getElementById('typingTextOptions'),null);assert.equal(f.doc.getElementById('typingResumeDraft'),null);assert.equal(f.doc.getElementById('rs').classList.contains('directTyping'),true);assert.equal(f.doc.getElementById('typeStatus').hidden,true);
});

test('a new PC field starts direct typing and saves an uncertain old draft in Text and links',async t=>{
 const f=fixture(t);f.input.value='Unsent draft';f.window.live.paused=true;const tap=f.window.PCRTypingControls.tap({x:100,y:75});await new Promise(r=>setTimeout(r,140));f.requests[0].resolve({editable:true});await tap;assert.equal(f.input.value,'');assert.equal(f.window.live.paused,false);assert.deepEqual(f.drafts,[{key:'drafts.compose',value:'Unsent draft'}]);assert.deepEqual(f.scheduled,[]);assert.equal(f.doc.getElementById('typingResumeDraft'),null);
});

test('right clicks and a field check cancelled by navigation cannot summon the keyboard',async t=>{
 const f=fixture(t);f.window.PCRTypingControls.afterPointer('click r');await new Promise(r=>setTimeout(r,250));assert.equal(f.requests.length,0);f.window.PCRTypingControls.afterPointer('click l');f.window.dispatchEvent(new f.window.CustomEvent('pcr:page',{detail:{id:'filesDialog'}}));await new Promise(r=>setTimeout(r,250));assert.equal(f.requests.length,0);assert.equal(f.input.readOnly,true);
});

test('a delayed Windows field response retries without another tap and switches compose mode to direct typing',async t=>{
  const f=fixture(t);f.window.liveTyping=false;const tap=f.window.PCRTypingControls.tap({x:100,y:75});await new Promise(r=>setTimeout(r,140));f.requests[0].resolve({editable:null});await new Promise(r=>setTimeout(r,180));assert.equal(f.requests.length,2);assert.equal(f.clicks.length,2,'retry checks focus without clicking again');f.requests[1].resolve({editable:true});await tap;assert.equal(f.input.readOnly,false);assert.equal(f.window.liveTyping,true);assert.equal(f.window.live.paused,false);f.input.value='Direct';f.window.rsScheduleLive();assert.deepEqual(f.scheduled,['Direct']);
});

test('closing and reopening the keyboard retains the phone text, baseline and selection',t=>{
  const f=fixture(t);f.window.rsKb();f.input.value='Keep typing here';f.window.live.sent=f.input.value;f.input.setSelectionRange(5,5);f.window.rsTypeClose();f.window.rsKb();assert.equal(f.input.value,'Keep typing here');assert.equal(f.window.live.sent,'Keep typing here');assert.equal(f.input.selectionStart,5);assert.equal(f.input.selectionEnd,5);assert.deepEqual(f.scheduled,[]);
});

test('returning to the same PC field resumes the existing text without another click or resending it',async t=>{
  const f=fixture(t),field={editable:true,fieldId:'a'.repeat(32),fieldBounds:{x:0,y:0,width:1920,height:1080}};let tap=f.window.PCRTypingControls.tap({x:100,y:75});await new Promise(r=>setTimeout(r,140));f.requests[0].resolve(field);await tap;f.input.value='Already sent';f.window.live.sent=f.input.value;f.input.setSelectionRange(4,4);f.window.rsTypeClose();tap=f.window.PCRTypingControls.tap({x:140,y:75});assert.equal(f.clicks.length,2);f.requests[1].resolve(field);await tap;assert.equal(f.input.value,'Already sent');assert.equal(f.window.live.sent,'Already sent');assert.equal(f.input.selectionStart,4);assert.equal(f.window.live.paused,false);assert.deepEqual(f.scheduled,[]);assert.equal(f.clicks.length,2,'resuming does not move the PC caret or reset text');
});

test('a different PC field receives its own fresh typing context instead of editing the old text',async t=>{
  const f=fixture(t),field={editable:true,fieldId:'a'.repeat(32),fieldBounds:{x:0,y:0,width:1920,height:1080}};let tap=f.window.PCRTypingControls.tap({x:100,y:75});await new Promise(r=>setTimeout(r,140));f.requests[0].resolve(field);await tap;f.input.value='Old field';f.window.live.sent=f.input.value;f.window.rsTypeClose();tap=f.window.PCRTypingControls.tap({x:140,y:75});const next={...field,fieldId:'b'.repeat(32)};f.requests[1].resolve(next);await new Promise(r=>setTimeout(r,140));f.requests[2].resolve(next);await tap;assert.equal(f.input.value,'');assert.equal(f.window.live.sent,'');assert.equal(f.clicks.length,4);assert.equal(f.window.live.paused,false);
});
