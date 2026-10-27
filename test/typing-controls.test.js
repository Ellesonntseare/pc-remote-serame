'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{JSDOM}=require('jsdom');
const source=fs.readFileSync(path.join(__dirname,'../public/typing-controls.js'),'utf8');
function fixture(t){
  const dom=new JSDOM('<div id="rs"><button id="rsKeyboard">Keyboard</button><section id="typePanel" class="hide"><div class="typeTop"></div><textarea id="typeText" readonly></textarea><p id="typeStatus"></p></section><div id="rsv"><canvas id="rsc"></canvas></div></div>',{runScripts:'outside-only',pretendToBeVisual:true});t.after(()=>dom.window.close());
  const window=dom.window,doc=window.document,input=doc.getElementById('typeText'),panel=doc.getElementById('typePanel'),requests=[],scheduled=[],messages=[],clicks=[];let focused=0,allowed=true;
  window.rs={on:1,m:{w:1920,h:1080}};window.live={paused:false,sent:'',generation:0,keys:[]};window.liveTyping=true;window.typeBusy=false;window.qb=0;window.qq=[];window.composing=false;
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
  return{window,doc,input,panel,requests,scheduled,messages,clicks,pointer,choose,focused:()=>focused,deny:()=>{allowed=false;}};
}

test('Keyboard immediately focuses the phone editor and offers compact controls',t=>{
  const f=fixture(t);f.doc.getElementById('rsKeyboard').click();assert.equal(f.doc.activeElement,f.input);assert.equal(f.input.readOnly,false);assert.equal(f.focused(),1);assert.ok(f.doc.getElementById('rs').classList.contains('compactTyping'));
  f.doc.getElementById('typingTextOptions').click();assert.equal(f.doc.getElementById('rs').classList.contains('compactTyping'),false);f.doc.getElementById('typingDone').click();assert.equal(f.input.readOnly,true);
});

test('choosing a PC field keeps the IME focused and waits for click acknowledgment before typing',async t=>{
  const f=fixture(t);f.window.rsKb();f.choose();assert.equal(f.window.PCRTypingControls.choosing,true);f.pointer('pointerdown');f.pointer('pointerup');
  assert.deepEqual(f.requests[0].commands,['abs 864 593','click l']);assert.equal(f.panel.classList.contains('hide'),false);assert.equal(f.doc.activeElement,f.input);assert.equal(f.messages.includes('ordinary remote pointer ran'),false);
  f.input.value='Typed while selecting';f.window.rsScheduleLive();assert.deepEqual(f.scheduled,[]);f.requests[0].resolve(true);await new Promise(setImmediate);assert.deepEqual(f.scheduled,['Typed while selecting']);assert.equal(f.window.PCRTypingControls.choosing,false);
});

test('previously paused drafts require explicit sending after a confirmed field selection',async t=>{
  const f=fixture(t);f.window.live.paused=true;f.input.value='Keep this draft';f.window.rsKb();f.choose();f.pointer('pointerdown');f.pointer('pointerup');f.requests[0].resolve(true);await new Promise(setImmediate);
  assert.equal(f.input.value,'Keep this draft');assert.equal(f.window.live.paused,true);assert.deepEqual(f.scheduled,[]);assert.equal(f.doc.getElementById('typingResumeDraft').hidden,false);
  f.doc.getElementById('typingResumeDraft').click();assert.deepEqual(f.scheduled,['Keep this draft']);assert.equal(f.doc.getElementById('typingResumeDraft').hidden,true);
});

test('letterbox taps and swipes cannot select a field or forward ordinary remote input',t=>{
  const f=fixture(t);f.window.rsKb();f.choose();f.pointer('pointerdown',1,2,2);f.pointer('pointerup',1,2,2);assert.equal(f.requests.length,0);
  f.pointer('pointerdown',2,100,75);f.pointer('pointermove',2,150,75);f.pointer('pointerup',2,150,75);assert.equal(f.requests.length,0);assert.equal(f.messages.includes('ordinary remote pointer ran'),false);
});

test('lost acknowledgments and changed screen metadata keep drafts paused',async t=>{
  const f=fixture(t);f.input.value='Do not lose this';f.window.rsKb();f.choose();f.pointer('pointerdown');f.pointer('pointerup');f.window.rs.m={w:1920,h:1080};f.requests[0].resolve(true);await new Promise(setImmediate);
  assert.equal(f.input.value,'Do not lose this');assert.equal(f.window.live.paused,true);assert.deepEqual(f.scheduled,[]);
  f.choose();f.pointer('pointerdown',2);f.pointer('pointerup',2);f.requests[1].resolve(false);await new Promise(setImmediate);assert.equal(f.input.value,'Do not lose this');assert.equal(f.window.live.paused,true);assert.match(f.doc.getElementById('typeStatus').textContent,/did not confirm/);
});

test('cancel preserves an acknowledged field context and denied guests cannot open input',t=>{
  const f=fixture(t);f.window.live.sent='Already delivered';f.input.value='Already delivered';f.window.rsKb();f.choose();assert.equal(f.input.value,'');f.choose();assert.equal(f.input.value,'Already delivered');assert.equal(f.window.live.paused,false);
  f.window.rsTypeClose();f.deny();f.window.rsKb();assert.equal(f.input.readOnly,true);assert.equal(f.panel.classList.contains('hide'),true);assert.equal(f.window.PCRTypingControls.choose(),false);assert.equal(f.requests.length,0);
});

test('a direct screen tap opens the keyboard only after Windows confirms an editable field',async t=>{
  const f=fixture(t),tap=f.window.PCRTypingControls.tap({x:100,y:75});
  assert.deepEqual(f.clicks,['abs 864 593','click l']);await new Promise(r=>setTimeout(r,140));assert.deepEqual(f.requests[0].commands,['focus 864 593']);
  assert.equal(f.input.readOnly,true,'ordinary screen buttons must not summon the keyboard while checking focus');
  f.requests[0].resolve({editable:true});await tap;
  assert.equal(f.doc.activeElement,f.input);assert.equal(f.input.readOnly,false);
  assert.equal(f.doc.getElementById('remoteTypingFeedback').dataset.state,'active');
  f.window.rsTypeClose();const button=f.window.PCRTypingControls.tap({x:100,y:75});await new Promise(r=>setTimeout(r,140));f.requests[1].resolve({editable:false});await button;assert.equal(f.input.readOnly,true);
});

test('automatic field focus keeps uncertain drafts local and ignores stale screen replies',async t=>{
  const f=fixture(t);f.input.value='Keep my draft';f.window.live.paused=true;
  const tap=f.window.PCRTypingControls.tap({x:100,y:75});await new Promise(r=>setTimeout(r,140));f.requests[0].resolve({editable:true});await tap;
  assert.equal(f.input.value,'Keep my draft');assert.equal(f.window.live.paused,true);assert.equal(f.doc.getElementById('typingResumeDraft').hidden,false);assert.deepEqual(f.scheduled,[]);
  f.window.rsTypeClose();const stale=f.window.PCRTypingControls.tap({x:100,y:75});await new Promise(r=>setTimeout(r,140));f.window.rs.m={w:1920,h:1080};f.requests[1].resolve({editable:true});await stale;assert.equal(f.input.readOnly,true);
});

test('a pending field check never blocks the second tap and only the latest field can open the keyboard',async t=>{const f=fixture(t),first=f.window.PCRTypingControls.tap({x:100,y:75});await new Promise(r=>setTimeout(r,140));assert.equal(f.window.typeBusy,false);const second=f.window.PCRTypingControls.tap({x:140,y:75});assert.equal(f.clicks.length,4,'both clicks are delivered immediately');f.requests[0].resolve({editable:true});await first;assert.equal(f.input.readOnly,true,'superseded focus must not summon the IME');await new Promise(r=>setTimeout(r,140));f.requests[1].resolve({editable:false});await second;assert.equal(f.input.readOnly,true);});
