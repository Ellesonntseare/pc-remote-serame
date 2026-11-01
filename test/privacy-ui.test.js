'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{JSDOM}=require('jsdom');
test('a non-successful privacy heartbeat schedules another attempt instead of silently abandoning its lease',async t=>{
 const dom=new JSDOM('<div id="rs"><div id="screenTools"></div></div>',{runScripts:'outside-only'}),w=dom.window;t.after(()=>w.close());let next=0,calls=0;const timers=new Map();w.setTimeout=(fn,ms)=>{const id=++next;timers.set(id,{fn,ms});return id;};w.clearTimeout=id=>timers.delete(id);w.PCRAuth={signedIn:true,role:'owner'};w.api=async()=>{calls++;return calls===2?{status:503,error:'Temporary failure'}:{ok:true,available:true,active:true,owned:true};};
 w.eval(fs.readFileSync(path.join(__dirname,'../public/privacy-mode.js'),'utf8'));w.document.getElementById('remotePrivacy').click();await new Promise(setImmediate);assert.equal(w.PCRPrivacy.active,true);await w.PCRPrivacy.refresh();assert.equal(calls,2);const retry=[...timers.values()].find(value=>value.ms===3000);assert.ok(retry);await retry.fn();assert.equal(calls,3);assert.equal(w.PCRPrivacy.active,true);
});
