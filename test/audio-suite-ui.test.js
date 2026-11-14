'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{JSDOM}=require('jsdom');
const tick=()=>new Promise(setImmediate);
test('Audio suite starts and stops the selected real stream and its visualizer follows measured audio',async t=>{
 const dom=new JSDOM('<body><div class="heroactions"></div><div class="rsbot"></div></body>',{url:'https://pc.test',runScripts:'outside-only',pretendToBeVisual:true});const w=dom.window;t.after(()=>w.close());
 w.PCRAuth={signedIn:true,role:'owner'};w.PCRCanAccess=()=>true;w.PCRNativeCapabilities={phoneAudio:true,phonePlaybackAudio:true};const messages=[];w.PCRAndroid={postMessage:raw=>messages.push(JSON.parse(raw))};w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;};
 for(const name of ['pc-audio.js','phone-audio.js','audio-hub.js','audio-suite-design.js'])w.eval(fs.readFileSync(path.join(__dirname,'../public',name),'utf8'));await tick();
 const page=w.document.getElementById('audioPage'),phone=w.document.getElementById('phoneAudioPage'),start=phone.querySelector('[data-start]'),toggle=page.querySelector('[data-suite-toggle]');assert.equal(page.querySelectorAll('.audioHubPane').length,2);assert.ok([...page.querySelectorAll('.audioSuiteWave i')].every(bar=>bar.style.height==='3%'));
 await w.PCRAudioHub.select('playback');assert.equal(page.dataset.direction,'playback');assert.equal(phone.querySelector('[data-start]'),start,'the original stream controls keep their handlers');toggle.click();assert.equal(messages.at(-1).type,'phone-audio-start');assert.equal(messages.at(-1).source,'playback');await tick();assert.equal(toggle.textContent,'Cancel connection');
 w.dispatchEvent(new w.CustomEvent('pcr:phone-audio',{detail:{state:'streaming',source:'playback',level:.24}}));await tick();assert.equal(toggle.textContent,'Stop audio');assert.ok([...page.querySelectorAll('.audioSuiteWave i')].some(bar=>parseFloat(bar.style.height)>3));
 phone.querySelector('[data-mute]').click();w.dispatchEvent(new w.CustomEvent('pcr:phone-audio',{detail:{state:'streaming',source:'playback',muted:true,level:.9}}));await tick();assert.equal(page.querySelector('[data-suite-status]').textContent,'Muted');assert.ok([...page.querySelectorAll('.audioSuiteWave i')].every(bar=>bar.style.height==='3%'));
 toggle.click();assert.equal(messages.at(-1).type,'phone-audio-stop');w.dispatchEvent(new w.CustomEvent('pcr:phone-audio',{detail:{state:'stopped'}}));await tick();assert.equal(toggle.textContent,'Start audio');assert.equal(toggle.disabled,false);
 w.PCRAuth={signedIn:false};w.dispatchEvent(new w.Event('pcr:auth'));assert.equal(page.open,false);
});
