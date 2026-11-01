'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{JSDOM}=require('jsdom');
test('a non-successful privacy heartbeat schedules another attempt instead of silently abandoning its lease',async t=>{
 const dom=new JSDOM('<div id="rs"><div id="screenTools"></div></div>',{runScripts:'outside-only'}),w=dom.window;t.after(()=>w.close());let next=0,calls=0;const timers=new Map();w.setTimeout=(fn,ms)=>{const id=++next;timers.set(id,{fn,ms});return id;};w.clearTimeout=id=>timers.delete(id);w.PCRAuth={signedIn:true,role:'owner'};w.api=async()=>{calls++;return calls===2?{status:503,error:'Temporary failure'}:{ok:true,available:true,active:true,owned:true};};
 w.eval(fs.readFileSync(path.join(__dirname,'../public/privacy-mode.js'),'utf8'));w.document.getElementById('remotePrivacy').click();await new Promise(setImmediate);assert.equal(w.PCRPrivacy.active,true);await w.PCRPrivacy.refresh();assert.equal(calls,2);const retry=[...timers.values()].find(value=>value.ms===3000);assert.ok(retry);await retry.fn();assert.equal(calls,3);assert.equal(w.PCRPrivacy.active,true);
});
test('privacy failure stays in a readable dialog, exposes the failed check, and copies diagnostic details',async t=>{
 const dom=new JSDOM('<div id="rs"><div id="screenTools"></div></div>',{runScripts:'outside-only'}),w=dom.window;t.after(()=>w.close());
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;};
 w.PCRAuth={signedIn:true,role:'owner'};let copied='';Object.defineProperty(w.navigator,'clipboard',{value:{writeText:async text=>{copied=text;}}});
 Object.defineProperty(w.document,'fullscreenElement',{value:w.document.getElementById('rs')});
 w.api=async()=>({ok:false,error:'Windows could not verify live updates. <img src=x onerror=alert(1)>',diagnostic:{stage:'live-update',matched:0,required:8,samples:9,restarts:1,displayRestored:true,elapsedMs:5200}});
 w.eval(fs.readFileSync(path.join(__dirname,'../public/privacy-mode.js'),'utf8'));w.document.getElementById('remotePrivacy').click();await new Promise(setImmediate);
 const dialog=w.document.getElementById('privacyFailure');assert.equal(dialog.open,true);assert.equal(dialog.parentElement.id,'rs');assert.match(dialog.querySelector('[data-stage]').textContent,/hidden desktop still updates/);assert.match(dialog.querySelector('[data-restored]').textContent,/covers have been removed/);assert.equal(dialog.querySelector('img'),null);
 dialog.querySelector('[data-copy]').click();await new Promise(setImmediate);assert.match(copied,/stage: live-update/);assert.match(copied,/elapsedMs: 5200/);assert.match(dialog.querySelector('[data-copy-status]').textContent,/copied/);dialog.querySelector('[data-close]').click();assert.equal(dialog.open,false);
});
test('connection errors do not falsely claim Windows restored the display',async t=>{
 const dom=new JSDOM('<div id="rs"><div id="screenTools"></div></div>',{runScripts:'outside-only'}),w=dom.window;t.after(()=>w.close());w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.PCRAuth={signedIn:true,role:'owner'};w.api=async()=>{throw Error('Connection lost');};
 w.eval(fs.readFileSync(path.join(__dirname,'../public/privacy-mode.js'),'utf8'));w.document.getElementById('remotePrivacy').click();await new Promise(setImmediate);
 const dialog=w.document.getElementById('privacyFailure');assert.equal(dialog.open,true);assert.match(dialog.querySelector('[data-restored]').textContent,/not confirmed/);assert.equal(w.document.getElementById('remotePrivacy').disabled,false);
});
