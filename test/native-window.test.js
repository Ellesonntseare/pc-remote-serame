'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{JSDOM}=require('jsdom');
async function fixture(t){
  const dom=new JSDOM('<div id="rs"><div class="screenViewGroup"><button id="rsZoomReset">175%</button></div><details id="remoteOptions"><div class="remoteAdvancedView"></div></details><div id="rsv"><div id="screenStage"><canvas id="rsc"></canvas></div></div></div>',{runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window,d=w.document,messages=[],zooms=[];let releases=0,closes=0;
  w.rs={on:1,m:{w:1920,h:1080}};w.PCRAuth={signedIn:true};w.PCRNativeCapabilities={miniWindow:true};w.PCRAndroid={postMessage:text=>messages.push(JSON.parse(text))};w.PCRScreenTools={setZoom:value=>zooms.push(value)};w.PCRPointerSafety={release:()=>releases++};w.rsTypeClose=()=>closes++;w.requestAnimationFrame=fn=>{fn();return 1;};w.msg=text=>messages.push({message:text});
  w.eval(fs.readFileSync(path.join(__dirname,'../public/native-window.js'),'utf8'));await new Promise(setImmediate);t.after(()=>w.close());
  return{w,d,messages,zooms,releases:()=>releases,closes:()=>closes,event:detail=>w.dispatchEvent(new w.CustomEvent('pcr:mini-window',{detail}))};
}
test('Minimise releases held input, dismisses typing and preserves the working view on expand',async t=>{
  const f=await fixture(t),view=f.d.getElementById('rsv');view.scrollLeft=123;view.scrollTop=456;const button=f.d.getElementById('rsMinimise');assert.equal(button.hidden,false);button.click();button.click();assert.equal(f.messages.length,1);assert.deepEqual(f.messages[0],{type:'minimise',width:1920,height:1080});assert.equal(f.releases(),1);assert.equal(f.closes(),1);assert.equal(f.d.body.classList.contains('pcrMiniWindow'),true);f.event({active:true});assert.equal(f.w.PCRMiniWindow.active,true);f.event({active:false});assert.equal(f.w.PCRMiniWindow.active,false);assert.equal(f.d.body.classList.contains('pcrMiniWindow'),false);assert.deepEqual(f.zooms,[1.75]);assert.equal(view.scrollLeft,123);assert.equal(view.scrollTop,456);
});
test('a declined floating-window request restores the full screen and reports Android settings',async t=>{
  const f=await fixture(t);f.d.getElementById('rsMinimise').click();f.event({active:false,message:'Allow Picture-in-picture in Android settings.'});assert.equal(f.d.body.classList.contains('pcrMiniWindow'),false);assert.match(f.messages.at(-1).message,/Android settings/);f.d.getElementById('rsMinimise').click();assert.equal(f.messages.filter(row=>row.type==='minimise').length,2);
});
test('browser clients and disconnected screens cannot enter the native floating window',async t=>{
  const f=await fixture(t);f.w.PCRNativeCapabilities={};f.w.dispatchEvent(new f.w.Event('pcr:native-ready'));assert.equal(f.d.getElementById('rsMinimise').hidden,true);f.w.PCRMiniWindow.minimise();assert.equal(f.messages.length,0);f.w.PCRNativeCapabilities={miniWindow:true};f.w.rs.on=0;f.w.PCRMiniWindow.minimise();assert.equal(f.messages.length,0);
});

test('Home eligibility follows the active remote screen and Minimise stays inside Tools',async t=>{
  const f=await fixture(t);assert.ok(f.d.getElementById('remoteOptions').contains(f.d.getElementById('rsMinimise')));f.w.PCRNativeCapabilities.homeMiniWindow=true;f.w.dispatchEvent(new f.w.Event('pcr:native-ready'));assert.equal(f.messages.at(-1).type,'mini-window-state');assert.equal(f.messages.at(-1).active,true);const count=f.messages.length;f.w.PCRMiniWindow.update();assert.equal(f.messages.length,count);f.w.rs.on=0;f.w.PCRMiniWindow.update();assert.equal(f.messages.at(-1).active,false);f.w.rs.on=1;f.w.PCRAuth.signedIn=false;f.w.dispatchEvent(new f.w.Event('pcr:auth'));assert.equal(f.messages.at(-1).active,false);
});

test('Android Home entry prepares the floating view without an explicit Minimise click',async t=>{
  const f=await fixture(t),view=f.d.getElementById('rsv');view.scrollTop=220;f.event({active:true});assert.equal(f.closes(),1);assert.equal(f.releases(),1);assert.equal(f.w.PCRMiniWindow.active,true);assert.equal(f.messages.filter(row=>row.type==='minimise').length,0);f.event({active:false});assert.equal(view.scrollTop,220);assert.deepEqual(f.zooms,[1.75]);
});
