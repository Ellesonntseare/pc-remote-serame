'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{JSDOM}=require('jsdom');
const settle=()=>new Promise(setImmediate);
async function fixture(t){
  const dom=new JSDOM('<body></body>',{runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window;const starts=[],requests=[];let stops=0,screenClosed=0;
  w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'));};
  w.PCRScreenTools={presentation(){}};w.rsClose=()=>screenClosed++;w.rsOpen=()=>{};w.PCRAuth={signedIn:true};w.PCRNativeVideo={NativeVideoSession:class{constructor(options){this.options=options;}start(...args){starts.push(args);return true;}stop(){stops++;}}};
  w.fetch=(url,options)=>new Promise(resolve=>requests.push({url,options,reply:apps=>resolve({ok:true,json:async()=>({apps})})}));
  w.eval(fs.readFileSync(path.join(__dirname,'../public/window-presentation.js'),'utf8'));await settle();t.after(()=>w.close());return{w,page:w.document.getElementById('windowPresentation'),starts,requests,stops:()=>stops,screenClosed:()=>screenClosed};
}
const app={id:'a'.repeat(24),title:'My Chrome presentation',processName:'chrome'};
test('Present opens the window list directly and starts the chosen window with the smooth preset',async t=>{
  const f=await fixture(t);f.w.PCRWindowPresentation.open();assert.equal(f.page.open,true);assert.equal(f.screenClosed(),1);assert.equal(f.requests[0].url,'/api/apps');f.requests[0].reply([app]);await settle();f.page.querySelector('.presentationWindow').click();assert.equal(f.starts[0][0],'smooth');assert.equal(f.starts[0][1].windowId,app.id);assert.equal(f.w.PCRWindowPresentation.active,true);assert.equal(f.page.querySelector('.presentationSetup').hidden,true);
  f.page.querySelector('[data-pause]').click();assert.equal(f.w.PCRWindowPresentation.active,false);f.page.querySelector('[data-pause]').click();assert.equal(f.starts.length,2);assert.equal(f.starts[1][1].windowId,app.id);f.page.close();assert.equal(f.w.PCRWindowPresentation.active,false);
});
test('window search and quality changes retain the selected app; changing windows stops the old stream',async t=>{
  const f=await fixture(t);f.w.PCRWindowPresentation.open();f.requests[0].reply([app,{...app,id:'b'.repeat(24),title:'Budget',processName:'excel'}]);await settle();const search=f.page.querySelector('input');search.value='chrome';search.dispatchEvent(new f.w.Event('input'));assert.equal(f.page.querySelectorAll('.presentationWindow').length,1);f.page.querySelector('.presentationWindow').click();const quality=f.page.querySelector('select');quality.value='hd';quality.dispatchEvent(new f.w.Event('change'));assert.equal(f.starts.at(-1)[0],'hd');assert.equal(f.starts.at(-1)[1].windowId,app.id);const before=f.stops();f.page.querySelector('[data-change]').click();assert.ok(f.stops()>before);assert.equal(f.w.PCRWindowPresentation.active,false);assert.equal(f.page.querySelector('.presentationSetup').hidden,false);assert.equal(f.requests.length,2);
});
test('closing the presentation cancels a pending app listing and ignores its late response',async t=>{
  const f=await fixture(t);f.w.PCRWindowPresentation.open();f.page.close();assert.equal(f.requests[0].options.signal.aborted,true);f.requests[0].reply([app]);await settle();assert.equal(f.starts.length,0);assert.equal(f.page.querySelectorAll('.presentationWindow').length,0);
});
