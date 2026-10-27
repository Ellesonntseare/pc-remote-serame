'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{JSDOM}=require('jsdom');
const script=fs.readFileSync(path.join(__dirname,'../public/folder-sync.js'),'utf8');
async function fixture(t){
  const dom=new JSDOM('<section data-sync-folder-settings></section><section data-folder-sync></section>',{runScripts:'outside-only',pretendToBeVisual:true,url:'https://pc.test'}),w=dom.window,messages=[],timers=new Map();let now=100000,id=0,hidden=false;
  w.PCRNativeCapabilities={folderSync:true};w.PCRAuth={role:'owner',signedIn:true};w.PCRAndroid={postMessage:text=>messages.push(JSON.parse(text))};
  w.Date.now=()=>now;w.setTimeout=(fn,delay)=>{timers.set(++id,{fn,at:now+delay});return id;};w.clearTimeout=id=>timers.delete(id);Object.defineProperty(w.document,'hidden',{get:()=>hidden});
  w.eval(script);await new Promise(setImmediate);t.after(()=>w.close());
  return {w,messages,timers,changes:()=>messages.filter(row=>row.type==='folder-sync-pc-change').length,revision:value=>w.dispatchEvent(new w.CustomEvent('pcr:sync',{detail:{fileRevision:value}})),advance:ms=>{now+=ms;for(const [key,timer]of [...timers])if(timer.at<=now){timers.delete(key);timer.fn();}},hide:value=>{hidden=value;w.document.dispatchEvent(new w.Event('visibilitychange'));}};
}
test('rapid PC changes coalesce into a trailing sync even without another revision',async t=>{
  const f=await fixture(t);f.revision(1);assert.equal(f.changes(),1);f.advance(3000);f.revision(2);f.advance(3000);f.revision(3);assert.equal(f.timers.size,1);assert.equal(f.changes(),1);f.advance(3999);assert.equal(f.changes(),1);f.advance(1);assert.equal(f.changes(),2);assert.equal(f.timers.size,0);f.revision(3);f.advance(20000);assert.equal(f.changes(),2);
});
test('sign-out cancels queued changes and a new owner session starts fresh',async t=>{
  const f=await fixture(t);f.revision(1);f.advance(1000);f.revision(2);f.w.PCRAuth={signedIn:false};f.w.dispatchEvent(new f.w.Event('pcr:auth'));assert.equal(f.timers.size,0);f.advance(20000);f.revision(3);assert.equal(f.changes(),1);f.w.PCRAuth={signedIn:true,role:'owner'};f.w.dispatchEvent(new f.w.Event('pcr:auth'));f.revision(3);assert.equal(f.changes(),2);
});
test('backgrounding defers pending sync until return; page exit clears the timer',async t=>{
  const f=await fixture(t);f.revision(1);f.advance(1000);f.revision(2);f.hide(true);assert.equal(f.timers.size,0);f.advance(20000);assert.equal(f.changes(),1);f.hide(false);assert.equal(f.changes(),2);f.advance(1000);f.revision(3);f.w.dispatchEvent(new f.w.Event('pagehide'));assert.equal(f.timers.size,0);f.advance(20000);assert.equal(f.changes(),2);
});
