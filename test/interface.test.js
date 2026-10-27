'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),{JSDOM,CookieJar,VirtualConsole}=require('jsdom'),{createApp}=require('../server');
// Served pages parse the complete style/script set; allow loaded CI runners to
// finish real async UI work without changing the state assertions below.
// Check state after a delayed timer resumes, before declaring timeout. Keep
// synchronous DOM reads in the same turn as the deadline check.
async function until(predicate,timeout=10000){const end=Date.now()+timeout;for(;;){const result=predicate();if(result&&typeof result.then==='function'?await result:result)return;if(Date.now()>=end)throw Error('Interface did not reach the expected state');await new Promise(r=>setTimeout(r,15));}}
async function fixture(t,appOptions={}){const dir=await fs.mkdtemp(path.join(__dirname,'.transfer-check-')),errors=[],windows=[];const app=createApp({password:'serame',disableAgent:true,disableActions:true,transferDirectory:dir,...appOptions});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+app.server.address().port;
  async function page(options={}){const jar=new CookieJar(),console=new VirtualConsole();console.on('jsdomError',error=>{if(!error.message.includes('Could not parse CSS stylesheet'))errors.push(error.detail?.stack||error.message);});const dom=await JSDOM.fromURL(base,{runScripts:'dangerously',resources:'usable',pretendToBeVisual:true,cookieJar:jar,virtualConsole:console,beforeParse(window){
    if(options.android)window.PCRAndroid={postMessage:value=>options.android.push(JSON.parse(value))};
    if(options.sockets){
      class Socket extends window.EventTarget {
        static OPEN=1;static CONNECTING=0;
        constructor(url){super();this.url=url;this.readyState=1;this.bufferedAmount=0;this.sent=[];options.sockets.push(this);queueMicrotask(()=>this.dispatchEvent(new window.Event('open')));}
        send(value){this.sent.push(JSON.parse(value));}close(){this.readyState=3;this.onclose?.();}
        emit(value){this.onmessage?.({data:value instanceof window.Blob?value:JSON.stringify(value)});}
      }
      window.WebSocket=Socket;window.URL.createObjectURL=()=> 'blob:test';window.URL.revokeObjectURL=()=>{};
      window.Image=class{naturalWidth=540;naturalHeight=960;set src(value){queueMicrotask(()=>this.onload?.());}};
      window.HTMLCanvasElement.prototype.setPointerCapture=function(){};
    }
    window.TextEncoder=TextEncoder;window.TextDecoder=TextDecoder;window.AbortController=AbortController;window.ResizeObserver=class{observe(){}unobserve(){}disconnect(){}};
    window.matchMedia=query=>({matches:!!options.phone&&query==='(any-pointer: coarse)',addEventListener(){},removeEventListener(){}});
    if(options.phone){const viewport=new window.EventTarget();Object.assign(viewport,{height:800,width:390,offsetTop:0,scale:1});window.visualViewport=viewport;}
    window.HTMLDialogElement.prototype.showModal=function(){this.returnFocus=window.document.activeElement;this.open=true;this.querySelector('button,input,textarea')?.focus();};window.HTMLDialogElement.prototype.close=function(){if(!this.open)return;this.open=false;this.returnFocus?.focus();this.dispatchEvent(new window.Event('close'));};
    const context={clearRect(){},drawImage(){},setTransform(){},beginPath(){},moveTo(){},lineTo(){},stroke(){},arc(){},fill(){},save(){},restore(){},strokeRect(){},fillRect(){}};window.HTMLCanvasElement.prototype.getContext=()=>context;
    window.fetch=async(route,options={})=>{const url=new URL(route,base),headers={...options.headers,Cookie:await jar.getCookieString(url.href)};let response;try{response=await fetch(url,{...options,headers});}catch(error){throw Error(error.message+"; cause="+(error.cause?.code||error.cause?.message||"unknown"));}for(const value of response.headers.getSetCookie())await jar.setCookie(value,url.href);return response;};
    window.navigator.clipboard={writeText:async()=>{},readText:async()=>''};window.HTMLMediaElement.prototype.pause=function(){};window.HTMLMediaElement.prototype.load=function(){};
  }});windows.push(dom.window);await until(()=>dom.window.PCRGuestAccess&&dom.window.PCRAuth);await until(()=>dom.window.PCRWorkspaceSettings?.ready);return dom.window;}
  t.after(async()=>{for(const window of windows)window.eval('showPair()');await new Promise(r=>setTimeout(r,100));for(const window of windows)window.close();app.stop();await new Promise(r=>app.server.close(r));if(path.dirname(dir)===__dirname&&path.basename(dir).startsWith('.transfer-check-'))await fs.rm(dir,{recursive:true,force:true});assert.deepEqual(errors,[],'served interface must run without JavaScript exceptions');});
  return {page};
}
async function login(window,password){const doc=window.document;doc.getElementById('pin').value=password;doc.getElementById('rememberMe').checked=false;doc.getElementById('pairForm').dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true}));}
test('dashboard keyboard opens the remote editor directly and common keys stay within reach',async t=>{
  const f=await fixture(t),window=await f.page({phone:true}),doc=window.document;
  await login(window,'serame');await until(()=>window.PCRAuth?.signedIn);
  // Model a Windows capture source on all CI hosts; input/capture are stubbed.
  window.eval('rsRun=function(){rs.m={w:1920,h:1080};};$("screenBtn").classList.remove("hide");');
  await until(()=>doc.getElementById('homeKeyboard').dataset.pcrDenied==='false');
  const keyboard=doc.getElementById('homeKeyboard');assert.equal(keyboard.dataset.pcrDenied,'false');keyboard.click();
  await until(()=>window.PCRPages.current==='rs');
  assert.equal(doc.activeElement,doc.getElementById('typeText'));
  assert.equal(doc.getElementById('typeText').readOnly,false);
  for(const selector of ['#rsKeyboard','[data-remote-key="13"]','[data-remote-key="8"]','[data-files-button]','#rsFullscreen'])assert.ok(doc.querySelector('.dockQuickKeys').contains(doc.querySelector(selector)));
  for(const id of ['keyToggle','rsk'])assert.ok(doc.getElementById('remoteOptions').contains(doc.getElementById(id)));
  assert.equal(doc.getElementById('remoteOptions').contains(doc.getElementById('rsKeyboard')),false);
  assert.equal(doc.getElementById('rsk').classList.contains('hide'),true,'first use keeps optional shortcuts collapsed');
  assert.ok(doc.getElementById('remoteScrollRail'));
});

test('status polling keeps expanded history and avoids overlapping requests',async t=>{
  const f=await fixture(t),window=await f.page();await login(window,'serame');await until(()=>window.PCRAuth?.signedIn&&window.eval('statusPollGeneration===-1'));
  const original=window.fetch,logs=[{t:12345,text:'Text sent',preview:'An expanded preview'}];let pending=null,calls=0;
  window.fetch=(route,options)=>{
    if(route!=='/api/status')return original(route,options);
    calls++;const response={status:200,json:async()=>({cpu:12,mem:30,uptime:60,log:logs})};
    return pending?new Promise(resolve=>{pending=()=>resolve(response);}):Promise.resolve(response);
  };
  await window.poll();const preview=window.document.querySelector('.activityTextPreview'),row=preview.parentElement;preview.open=true;
  await window.poll();assert.equal(window.document.querySelector('.activityTextPreview'),preview);assert.equal(preview.open,true);assert.equal(preview.parentElement,row);
  pending=true;const first=window.poll();await window.poll();assert.equal(calls,3,'a second refresh shares the in-flight status request');pending();await first;
  assert.equal(window.eval('statusPollGeneration'),-1);
});

test('password eye toggles visibility, owner tools mount, and Presentation mode always restores controls',async t=>{
  const f=await fixture(t),window=await f.page(),doc=window.document,input=doc.getElementById('pin'),eye=doc.getElementById('passwordPeek');input.value='sample';assert.equal(input.type,'password');eye.click();assert.equal(input.type,'text');assert.equal(eye.getAttribute('aria-label'),'Hide password');eye.click();assert.equal(input.type,'password');
  assert.equal(doc.querySelector('.pairHelp,.guestLoginNote'),null,'requested bottom login text is removed');
  await login(window,'serame');await until(()=>window.PCRAuth?.signedIn);assert.equal(doc.getElementById('guestManageButton').hidden,false);assert.equal(window.getComputedStyle(doc.querySelector('.stats')).display,'grid');assert.ok(doc.getElementById('rsLens'));assert.ok(doc.getElementById('pcAppsButton'));assert.ok(doc.getElementById('filesDialog'));
  doc.getElementById('rsPresentation').click();assert.equal(doc.getElementById('rs').classList.contains('screenClean'),true);assert.equal(window.getComputedStyle(doc.getElementById('rsRestoreControls')).display,'inline-flex');doc.getElementById('rsRestoreControls').click();assert.equal(doc.getElementById('rs').classList.contains('screenClean'),false);
});

test('reference dashboard keeps its feature actions, power toggle and live status meters functional',async t=>{
  const f=await fixture(t),window=await f.page();await login(window,'serame');await until(()=>window.PCRAuth?.signedIn&&window.PCRDashboard);const doc=window.document;assert.ok(doc.querySelector('.referenceDashboard .connectedSummary #name'));assert.equal(doc.querySelector('.mediaWrap').parentElement.id,'homePanelMedia');assert.equal(doc.querySelector('.activity').parentElement.id,'homePanelHistory');assert.ok(doc.querySelector('.dashboardStatus>.section'));assert.ok(doc.querySelector('.heroactions>#pcAudioHome'));assert.ok(doc.querySelector('.heroactions>#webrtcVideoHome'));
  const drawer=doc.getElementById('powerDrawer'),power=doc.querySelector('.dashboardPowerTile'),powerPage=doc.getElementById('powerPage');assert.ok(powerPage.contains(drawer));assert.equal(powerPage.open,false);power.click();assert.equal(powerPage.open,true);assert.equal(window.PCRPages.current,'powerPage');powerPage.querySelector('[data-close]').click();assert.equal(powerPage.open,false);
  doc.querySelector('.filesHome').click();await until(()=>doc.getElementById('filesDialog').open);doc.getElementById('filesClose').click();assert.equal(doc.getElementById('filesDialog').open,false);window.PCRDashboard.updateStats({cpu:16,mem:61});assert.equal(doc.getElementById('cpuDial').getAttribute('aria-label'),'CPU 16%');assert.equal(doc.getElementById('memoryDial').getAttribute('aria-label'),'Memory 61%');
});

test('Android guest sharing asks the native app for consent, accepts a live preview and stops on sign-out',async t=>{
  const f=await fixture(t),owner=await f.page(),messages=[],phone=await f.page({android:messages});await login(owner,'serame');await until(()=>owner.PCRAuth?.signedIn);await login(phone,'guest');await until(()=>owner.document.querySelector('.guestRequestCard'));owner.document.querySelector('.guestApprove').click();await until(()=>phone.PCRAuth?.role==='guest');
  phone.document.querySelector('.guestScreenHome').click();phone.document.querySelector('#guestScreenDialog [data-share]').click();assert.deepEqual(messages,[{type:'start'}]);assert.equal(phone.document.querySelector('#guestScreenDialog [data-stop]').hidden,false);
  phone.PCRAndroid.onmessage({data:JSON.stringify({type:'sharing'})});phone.PCRAndroid.onmessage({data:JSON.stringify({type:'frame',data:'AAAA',width:540,height:960})});assert.equal(phone.document.querySelector('#guestScreenDialog img').hidden,false);
  Object.defineProperty(phone.document,'hidden',{configurable:true,value:true});phone.document.dispatchEvent(new phone.Event('visibilitychange'));assert.equal(messages.at(-1).type,'start','switching apps must not send a native stop');
  Object.defineProperty(phone.document,'hidden',{configurable:true,value:false});phone.document.dispatchEvent(new phone.Event('visibilitychange'));assert.match(phone.document.querySelector('.guestScreenStatus').textContent,/entire phone screen is live/);
  phone.PCRAndroid.onmessage({data:JSON.stringify({type:'control-state',state:'active'})});assert.equal(phone.document.querySelector('[data-phone-stop]').hidden,false);phone.document.querySelector('[data-phone-stop]').click();assert.equal(messages.at(-1).type,'control-stop');
  phone.eval('showPair()');assert.equal(messages.at(-1).type,'stop');assert.equal(phone.document.querySelector('#guestScreenDialog').open,false);
});

test('PC phone controls stay view-only until approval and send one action at a time for the displayed capture',async t=>{
  const f=await fixture(t),sockets=[],window=await f.page({sockets}),doc=window.document;await login(window,'serame');await until(()=>window.PCRAuth?.signedIn&&sockets.length);
  const socket=sockets.find(s=>s.url.includes('/api/guest-screen'));doc.querySelector('.guestScreenHome').click();socket.emit({type:'shares',shares:[{id:'phone'}]});socket.emit({type:'watching',id:'phone',marks:[],capture:{generation:1,width:1080,height:1920}});socket.emit({type:'control-state',state:'off',supported:true,canControl:false});
  doc.querySelector('[data-phone-key="home"]').click();assert.equal(socket.sent.some(v=>v.type==='control'),false);
  doc.querySelector('[data-request-control]').click();assert.equal(socket.sent.at(-1).type,'control-request');socket.emit({type:'control-state',state:'pending',supported:true});assert.equal(doc.querySelector('[data-request-control]').disabled,true);
  socket.emit({type:'control-state',state:'active',supported:true,canControl:true,id:'a'.repeat(32)});socket.emit(new window.Blob(['frame']));await new Promise(r=>setTimeout(r,20));
  doc.querySelector('[data-phone-key="home"]').click();assert.equal(socket.sent.at(-1).command.action,'home');assert.equal(socket.sent.at(-1).generation,1);const seq=socket.sent.at(-1).seq;
  doc.querySelector('[data-phone-key="back"]').click();assert.equal(socket.sent.at(-1).seq,seq,'buttons block overlapping actions');socket.emit({type:'control-result',seq,ok:true});
  socket.emit({type:'capture',generation:2,width:1920,height:1080});doc.querySelector('[data-phone-key="back"]').click();assert.equal(socket.sent.at(-1).seq,seq,'old images cannot send new-display actions');
  socket.emit(new window.Blob(['rotated']));await new Promise(r=>setTimeout(r,20));doc.querySelector('[data-phone-key="back"]').click();assert.equal(socket.sent.at(-1).generation,2);
  socket.emit({type:'control-result',seq:socket.sent.at(-1).seq,ok:true});
  const hold=doc.querySelector('.phoneControlTools .holdPreference input');hold.click();assert.equal(window.PCRHoldControl.can('phone'),false);const before=socket.sent.length;doc.querySelector('[data-phone-key="home"]').click();assert.equal(socket.sent.length,before);
  doc.dispatchEvent(new window.KeyboardEvent('keydown',{key:'Shift',bubbles:true}));doc.querySelector('[data-phone-key="home"]').click();assert.equal(socket.sent.at(-1).command.action,'home');doc.dispatchEvent(new window.KeyboardEvent('keyup',{key:'Shift',bubbles:true}));assert.equal(window.PCRHoldControl.can('phone'),false);
  doc.querySelector('#guestScreenDialog [data-close]').click();assert.equal(socket.sent.at(-1).type,'watch');assert.equal(socket.sent.at(-1).id,'');
});

test('Select all keeps partial selections and owner extensions update the guest ribbon without a new login',async t=>{
  // Delay a buffered stale snapshot, leaving its HTTP connection reusable. The
  // extension still must win over that snapshot and update the guest's session.
  const f=await fixture(t),owner=await f.page(),guest=await f.page();await login(owner,'serame');await until(()=>owner.PCRAuth?.signedIn);await login(guest,'guest');await until(()=>owner.document.querySelector('.guestRequestCard'));
  const card=owner.document.querySelector('.guestRequestCard'),all=card.querySelector('[data-select-all]'),permissions=Array.from(card.querySelectorAll('[data-permission]'));assert.equal(all.indeterminate,true);all.click();assert.ok(permissions.every(input=>input.checked));assert.equal(all.indeterminate,false);card.querySelector('[data-permission="power"]').click();assert.equal(all.indeterminate,true);assert.equal(all.checked,false);all.click();all.click();assert.ok(permissions.every(input=>!input.checked));all.click();
  card.querySelector('.guestDuration select').value='15';card.querySelector('.guestApprove').click();await until(()=>guest.PCRAuth?.role==='guest');const untilBefore=guest.PCRAuth.until;assert.equal(guest.document.querySelector('.guestAccountRibbon').hidden,false);assert.equal(guest.document.querySelector('.screenGuestBadge').hidden,false);assert.equal(owner.document.querySelector('.guestAccountRibbon').hidden,true);assert.ok(Object.values(guest.PCRAuth.permissions).every(Boolean));
  await until(()=>owner.document.querySelector('[data-extend-guest]'));const originalFetch=owner.fetch;let releaseStale;owner.fetch=async(...args)=>{const response=await originalFetch(...args);if(args[0]==='/api/guest/requests'&&!releaseStale){const body=await response.text();return new Promise(resolve=>{releaseStale=()=>resolve(new Response(body,{status:response.status,headers:response.headers}));});}return response;};owner.document.dispatchEvent(new owner.Event('visibilitychange'));await until(()=>releaseStale);const realNow=Date.now;owner.Date.now=()=>realNow()+14*60000;await until(()=>!owner.document.querySelector('.guestExpiryNotice').hidden);owner.document.querySelector('.guestExpiryNotice [data-extend]').click();await until(()=>owner.document.querySelector('.guestExpiryNotice p').textContent.includes('extended'),30000).catch(error=>{throw Error(error.message+'; extend status='+owner.document.querySelector('.guestExpiryNotice p').textContent+'; disabled='+owner.document.querySelector('.guestExpiryNotice [data-extend]').disabled+'; role='+owner.PCRAuth.role);});releaseStale();owner.fetch=originalFetch;await new Promise(r=>setTimeout(r,30));await until(()=>owner.document.querySelector('.guestExpiryNotice').hidden);guest.document.dispatchEvent(new guest.Event('visibilitychange'));await until(()=>guest.PCRAuth.until===untilBefore+30*60000);assert.equal(guest.PCRAuth.role,'guest');assert.equal(guest.document.getElementById('pairGate').classList.contains('hide'),true);assert.match(guest.document.querySelector('.guestSessionClock').textContent,/44:|45:/);
  guest.eval('showPair()');assert.equal(guest.document.querySelector('.guestAccountRibbon').hidden,true);assert.equal(guest.document.querySelector('.screenGuestBadge').hidden,true);
});

test('swiping dock sends relative motion, tap, scroll and drag while Hold-to-control releases queued input',async t=>{
  const f=await fixture(t),window=await f.page({phone:true}),doc=window.document;await login(window,'serame');await until(()=>window.PCRAuth?.signedIn&&window.PCRSwipeDock&&window.PCRHoldControl);window.eval("rs.on=1;rs.m={w:1920,h:1080};$('rs').classList.remove('hide');liveTyping=false;flush=()=>{};qq=[]");
  const released=[];window.PCRInputTransport={...window.PCRInputTransport,isOpen:true,sendInput:async cmds=>{released.push(...cmds);return {ok:true};}};const pad=doc.getElementById('remoteSwipePad');pad.setPointerCapture=()=>{};pad.getBoundingClientRect=()=>({left:0,top:0,width:360,height:80});const pointer=(target,type,id,x=60,y=30)=>{const event=new window.MouseEvent(type,{button:0,clientX:x,clientY:y,bubbles:true,cancelable:true});Object.defineProperty(event,'pointerId',{value:id});Object.defineProperty(event,'pointerType',{value:'touch'});target.dispatchEvent(event);};const commands=()=>Array.from(window.eval('qq')).concat(released);const clear=()=>{window.eval('qq=[]');released.length=0;};
  pointer(pad,'pointerdown',1);pointer(pad,'pointermove',1,90,35);assert.ok(commands().some(c=>c.startsWith('mv ')));pointer(pad,'pointerup',1,90,35);assert.equal(commands().some(c=>c.startsWith('click')),false);clear();pointer(pad,'pointerdown',2);pointer(pad,'pointerup',2);assert.deepEqual(commands(),['click l']);clear();
  doc.querySelector('.dockMouseButton[data-mouse-button="l"]').click();doc.querySelector('.dockMouseButton[data-mouse-button="r"]').click();assert.deepEqual(commands(),['click l','click r']);clear();const options=doc.getElementById('remoteOptions');assert.equal(doc.getElementById('screenTools').contains(options),true);assert.equal(options.contains(doc.getElementById('rsk')),true);assert.equal(doc.getElementById('remoteSwipeDock').contains(doc.getElementById('rsk')),false);assert.equal(options.contains(doc.querySelector('.rsbot')),true);options.open=true;const keysBefore=doc.getElementById('rsk').classList.contains('hide');doc.getElementById('keyToggle').click();assert.notEqual(doc.getElementById('rsk').classList.contains('hide'),keysBefore);assert.equal(options.open,true);doc.dispatchEvent(new window.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));assert.equal(options.open,false);
  pointer(pad,'pointerdown',3);pointer(pad,'pointerdown',4,100,30);pointer(pad,'pointermove',3,60,40);assert.ok(commands().some(c=>c.startsWith('wheel ')));pointer(pad,'pointerup',3);pointer(pad,'pointerup',4);clear();
  pointer(pad,'pointerdown',5);await new Promise(r=>setTimeout(r,480));assert.ok(commands().includes('down l'));pointer(pad,'pointerup',5);assert.equal(commands().at(-1),'up l');clear();
  const toggle=doc.querySelector('#workspaceControlPreferences .holdPreference input');toggle.click();assert.equal(window.localStorage.getItem('pcr_hold_control'),'true');pointer(pad,'pointerdown',6);pointer(pad,'pointermove',6,100);pointer(pad,'pointerup',6);assert.deepEqual(commands(),[]);
  const hold=doc.querySelector('[data-hold-scope=pc]');hold.setPointerCapture=()=>{};pointer(hold,'pointerdown',7);assert.equal(window.PCRHoldControl.can('pc'),true);pointer(pad,'pointerdown',8);pointer(pad,'pointermove',8,100);assert.ok(commands().some(c=>c.startsWith('mv ')));pointer(hold,'pointerup',7);assert.equal(window.PCRHoldControl.can('pc'),false);assert.ok(commands().every(c=>c.startsWith('up ')));pointer(pad,'pointerup',8);clear();
  doc.dispatchEvent(new window.KeyboardEvent('keydown',{key:'Shift',bubbles:true}));assert.equal(window.PCRHoldControl.can('pc'),true);window.eval("qc('down l');mouseDrag=true");doc.dispatchEvent(new window.KeyboardEvent('keyup',{key:'Shift',bubbles:true}));assert.ok(commands().includes('up l'));assert.equal(window.eval('mouseDrag'),false);assert.equal(window.PCRHoldControl.can('pc'),false);
  pointer(hold,'pointerdown',9);window.dispatchEvent(new window.Event('blur'));assert.equal(window.PCRHoldControl.can('pc'),false);assert.equal(doc.getElementById('keyToggle').isConnected,true,'Hide keys stays available');
});

test('media buttons use the Windows media service, prevent overlapping taps and report failures',async t=>{
  const calls=[],resolvers=[];const f=await fixture(t,{disableActions:false,nativeFeatures:{sendMedia:action=>new Promise((resolve,reject)=>{calls.push(action);resolvers.push({resolve,reject});}),close(){}}}),window=await f.page();await login(window,'serame');await until(()=>window.PCRAuth?.signedIn);
  for(const action of ['voldown','volup','mute','playpause','next','prev']){const button=window.document.querySelector('.media[data-a="'+action+'"]'),before=calls.length;button.click();await until(()=>calls.length===before+1);assert.equal(button.disabled,true);button.click();assert.equal(calls.length,before+1);resolvers.at(-1).resolve({ok:true,msg:action==='mute'?'Sound muted':'Volume 51%'});await until(()=>!button.disabled);assert.equal(calls.at(-1),action);assert.equal(button.hasAttribute('aria-busy'),false);}
  const mute=window.document.querySelector('[data-a="mute"]');mute.click();await until(()=>calls.length===7);resolvers.at(-1).reject(Error('Audio device unavailable'));await until(()=>!mute.disabled);assert.match(window.document.getElementById('msg').textContent,/Audio device unavailable/);
});
test('guest waits for owner approval, privacy defaults hide sensitive panels, and owner snippets never cross into guest UI',async t=>{
  const f=await fixture(t),owner=await f.page(),guest=await f.page();await login(owner,'serame');await until(()=>owner.PCRAuth?.signedIn);owner.localStorage.setItem('pcr_clipboard_history_v1',JSON.stringify([{text:'Owner private sample',source:'test',time:Date.now(),pinned:true}]));
  await login(guest,'guest');await until(()=>!guest.document.querySelector('.guestWaitingPanel').hidden);assert.equal(guest.PCRAuth?.signedIn,false);
  await until(()=>owner.document.querySelector('.guestRequestCard'));const card=owner.document.querySelector('.guestRequestCard');assert.equal(card.querySelector('[data-permission="screen"]').checked,true);assert.equal(card.querySelector('[data-permission="control"]').checked,false);assert.equal(card.querySelector('[data-permission="download"]').checked,false);card.querySelector('.guestDuration select').value='15';card.querySelector('.guestApprove').click();await until(()=>guest.PCRAuth?.role==='guest');
  for(const selector of ['.stats','.activity','.filesHome','#pcAudioHome','#pcAppsButton','#homeKeyboard','#homeApps','#rsm','.dashboardPowerTile','#powerDrawer','.mediaWrap'])assert.equal(guest.getComputedStyle(guest.document.querySelector(selector)).display,'none',selector);
  assert.notEqual(guest.getComputedStyle(guest.document.querySelector('.hero')).display,'none','guest can still open approved screen viewing');
  assert.equal(guest.document.getElementById('name').textContent,'Shared PC');assert.equal(guest.document.querySelector('.guestScreenHome').hidden,false);assert.equal(guest.document.getElementById('guestManageButton').hidden,true);
  // A role switch in the same browser must not render the owner's saved text.
  guest.localStorage.setItem('pcr_clipboard_history_v1',owner.localStorage.getItem('pcr_clipboard_history_v1'));guest.dispatchEvent(new guest.CustomEvent('pcr:auth',{detail:guest.PCRAuth}));assert.equal(guest.document.getElementById('clipboardHistoryList').textContent.includes('Owner private sample'),false);
});

test('phone keyboard toggle, Android-style dismissal and remote touches keep the editor closed without losing drafts',async t=>{
  const f=await fixture(t),window=await f.page({phone:true}),doc=window.document,viewport=window.visualViewport;
  const pin=doc.getElementById('pin');pin.focus();await login(window,'serame');await until(()=>window.PCRAuth?.signedIn);assert.notEqual(doc.activeElement,pin,'login releases the password field');
  window.eval("rs.on=1;rs.m={w:1920,h:1080};$('rs').classList.remove('hide');liveTyping=false;rsUpdateTypingUI()");
  const input=doc.getElementById('typeText'),button=doc.getElementById('rsKeyboard');
  const resize=height=>{viewport.height=height;viewport.dispatchEvent(new window.Event('resize'));};
  for(let cycle=0;cycle<3;cycle++){
    button.click();input.value='preserved draft';assert.equal(doc.activeElement,input);assert.equal(input.readOnly,false);
    resize(760);assert.equal(doc.activeElement,input,'browser chrome movement does not dismiss typing');
    resize(490);assert.equal(doc.activeElement,input,'opening the IME never clears focus');
    resize(800);assert.notEqual(doc.activeElement,input);assert.equal(input.readOnly,true);assert.equal(input.inputMode,'none');assert.equal(input.value,'preserved draft');assert.equal(button.getAttribute('aria-expanded'),'false');
    resize(780);resize(800);assert.notEqual(doc.activeElement,input,'later viewport changes do not reopen the IME');
  }
  button.click();button.click();assert.equal(input.readOnly,true);assert.notEqual(doc.activeElement,input);
  button.click();doc.getElementById('rsv').dispatchEvent(new window.Event('pointerdown',{bubbles:true}));assert.equal(input.readOnly,true);assert.notEqual(doc.activeElement,input);
  button.click();input.dispatchEvent(new window.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));assert.equal(input.readOnly,true);assert.equal(input.value,'preserved draft');
});

test('orientation and zoom do not close phone typing, and Files never restores a text editor',async t=>{
  const f=await fixture(t),window=await f.page({phone:true}),doc=window.document,viewport=window.visualViewport;
  await login(window,'serame');await until(()=>window.PCRAuth?.signedIn);
  window.eval("rs.on=1;rs.m={w:1920,h:1080};$('rs').classList.remove('hide');liveTyping=false;rsUpdateTypingUI()");
  const input=doc.getElementById('typeText');doc.getElementById('rsKeyboard').click();
  viewport.height=490;viewport.dispatchEvent(new window.Event('resize'));
  viewport.width=800;viewport.height=390;viewport.dispatchEvent(new window.Event('resize'));assert.equal(doc.activeElement,input,'rotation is not keyboard dismissal');
  viewport.scale=1.5;viewport.height=250;viewport.dispatchEvent(new window.Event('resize'));assert.equal(doc.activeElement,input,'pinch zoom does not blur an editor');
  const files=doc.querySelector('[data-files-button]');files.click();assert.equal(input.readOnly,true);assert.notEqual(doc.activeElement,input);
  const note=doc.getElementById('filesNote');doc.getElementById('textTab').click();note.focus();note.value='copied text';doc.getElementById('filesClose').click();assert.equal(doc.activeElement,files);assert.equal(note.value,'copied text');assert.equal(input.readOnly,true);
  files.click();doc.getElementById('textTab').click();note.focus();
  let rejectPaste;window.navigator.clipboard.readText=()=>new Promise((resolve,reject)=>{rejectPaste=reject;});doc.getElementById('clipboardPaste').click();doc.getElementById('filesClose').click();rejectPaste(Error('Dismissed'));
  await new Promise(r=>setTimeout(r,20));assert.equal(doc.activeElement,files,'late clipboard errors never focus a closed dialog');
});

test('device handoff moves the screen between signed-in owners and wake requests use only the configured local sender',async t=>{
  const wakeCalls=[],f=await fixture(t,{wakeSend:async(...args)=>wakeCalls.push(args)}),source=await f.page(),target=await f.page();await login(source,'serame');await login(target,'serame');await until(()=>source.PCRAuth?.signedIn&&target.PCRAuth?.signedIn);
  source.eval("rsRun=()=>{};rs.on=1;$('rs').classList.remove('hide')");target.eval('rsRun=()=>{}');
  const devices=window=>Array.from(window.document.querySelectorAll('.heroactions button')).find(b=>b.textContent.startsWith('Devices'));
  devices(source).click();await until(()=>source.document.querySelector('#sessionTools [data-network]').options.length);const sourceDialog=source.document.getElementById('sessionTools');sourceDialog.querySelector('[data-mac]').value='02:12:34:56:78:9A';sourceDialog.querySelector('[data-wake]').click();await until(()=>wakeCalls.length===1);assert.equal(wakeCalls[0][0].length,102);
  sourceDialog.querySelector('[data-create]').click();await until(()=>sourceDialog.querySelector('[data-code]').textContent.length===12);devices(target).click();const targetDialog=target.document.getElementById('sessionTools');targetDialog.querySelector('[data-claim]').value=sourceDialog.querySelector('[data-code]').textContent;targetDialog.querySelector('[data-accept]').click();await until(()=>target.eval('rs.on')===1);await until(()=>source.eval('rs.on')===0);assert.equal(targetDialog.open,false);
});

test('screen text and image clipboard interfaces use approved host actions and clear images on sign-out',async t=>{
  const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=',calls=[];
  const f=await fixture(t,{imageTools:async(mode,data)=>{calls.push({mode,data});return mode==='ocr'?{ok:true,text:'Example screen text'}:mode==='clipboard-image-read'?{ok:true,data:png}:{ok:true};}}),window=await f.page();await login(window,'serame');await until(()=>window.PCRAuth?.signedIn&&window.PCRImageTools);
  window.HTMLCanvasElement.prototype.toDataURL=()=> 'data:image/png;base64,'+png;await window.PCRImageTools.recognize({width:1000,height:160});assert.equal(window.document.querySelector('#screenTextDialog textarea').value,'Example screen text');window.document.querySelector('#screenTextDialog [data-close]').click();
  window.document.querySelector('.filesHome').click();await until(()=>window.document.getElementById('filesDialog').open);Array.from(window.document.querySelectorAll('#textPane button')).find(b=>b.textContent==='Image clipboard').click();const dialog=window.document.getElementById('imageClipboardDialog');dialog.querySelector('[data-get]').click();await until(()=>!dialog.querySelector('img').hidden);dialog.querySelector('[data-send]').click();await until(()=>calls.some(c=>c.mode==='clipboard-image-write'));window.eval('showPair()');assert.equal(dialog.open,false);assert.equal(dialog.querySelector('img').hasAttribute('src'),false);
});

test('voice starts the microphone only after Join and releases it when the session ends',async t=>{
  const f=await fixture(t),sockets=[],window=await f.page({sockets});await login(window,'serame');await until(()=>window.PCRAuth?.signedIn);let opened=0,stopped=0;
  const track={enabled:true,stop(){stopped++;}},stream={getTracks:()=>[track],getAudioTracks:()=>[track]};window.navigator.mediaDevices={getUserMedia:async options=>{opened++;assert.equal(options.video,false);return stream;}};
  window.RTCPeerConnection=class{addTrack(){}async createOffer(){return{type:'offer',sdp:'audio-offer'};}async setLocalDescription(d){this.localDescription=d;}async setRemoteDescription(d){this.remoteDescription=d;}async addIceCandidate(){}close(){this.connectionState='closed';}};
  Array.from(window.document.querySelectorAll('.heroactions button')).find(b=>b.textContent.startsWith('Collaborate')).click();await until(()=>sockets.some(s=>s.url.endsWith('/api/collaboration')));const socket=sockets.find(s=>s.url.endsWith('/api/collaboration'));socket.emit({type:'people',people:[{id:'phone',room:'guest-room',voice:true}]});await new Promise(r=>setTimeout(r,20));assert.equal(opened,0);
  window.document.querySelector('#collaborationDialog [data-voice]').click();await until(()=>socket.sent.some(v=>v.type==='voice-join'));assert.equal(opened,1);socket.emit({type:'voice-peer',id:'call-1',initiator:true});await until(()=>socket.sent.some(v=>v.type==='description'));assert.equal(socket.sent.find(v=>v.type==='description').id,'call-1');
  window.document.querySelector('#collaborationDialog [data-mute]').click();assert.equal(track.enabled,false);socket.emit({type:'voice-ended',id:'call-1'});await until(()=>stopped===1);
  window.document.querySelector('#collaborationDialog [data-join-board]').click();assert.equal(socket.sent.at(-1).type,'board-join');socket.emit({type:'board',strokes:[]});await new Promise(r=>setTimeout(r,20));const canvas=window.document.querySelector('#collaborationDialog canvas');canvas.getBoundingClientRect=()=>({left:0,top:0,width:600,height:340});canvas.dispatchEvent(new window.MouseEvent('pointerdown',{button:0,clientX:120,clientY:68}));canvas.dispatchEvent(new window.MouseEvent('pointermove',{clientX:300,clientY:170}));canvas.dispatchEvent(new window.MouseEvent('pointerup'));assert.equal(socket.sent.at(-1).type,'stroke');assert.equal(socket.sent.at(-1).points[0].x,.2);assert.equal(socket.sent.at(-1).points[0].y,.2);
  window.document.querySelector('#collaborationDialog [data-close]').click();assert.equal(stopped,1);
});
