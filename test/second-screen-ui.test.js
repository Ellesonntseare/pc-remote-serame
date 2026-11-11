'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{JSDOM}=require('jsdom');
test('extended-display SVG cursor follows Windows pointer reports, hides off-display and resets on disconnect',async t=>{
 const dom=new JSDOM('<div class="heroactions"></div>',{url:'https://pc.test',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window;t.after(()=>w.close());
 const sockets=[];w.WebSocket=class{static OPEN=1;constructor(){this.readyState=1;this.bufferedAmount=0;sockets.push(this);}send(){}close(){}};
 w.ResizeObserver=class{observe(){}};w.PCRAuth={signedIn:true,role:'owner'};w.PCRAndroid={postMessage(){}};w.PCRNativeCapabilities={secondScreen:true};
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'));};
 w.PCRMseVideo={MseVideoSession:class{start(){}stop(){}}};w.fetch=async()=>({ok:true,json:async()=>({installed:true,phoneRegistered:true})});
 w.localStorage.setItem('elleson_second_screen_v1',JSON.stringify({fast:false}));
 for(const file of ['second-screen-policy.js','second-screen.js'])w.eval(fs.readFileSync(path.join(__dirname,'../public',file),'utf8'));
 w.document.dispatchEvent(new w.Event('DOMContentLoaded'));w.PCRSecondScreen.open();await new Promise(setImmediate);
 const page=w.document.getElementById('secondScreenPage'),stage=page.querySelector('.secondScreenStage'),cursor=page.querySelector('.secondScreenCursor');
 Object.defineProperties(stage,{clientWidth:{value:300},clientHeight:{value:200}});
 page.querySelector('[data-start]').click();const socket=sockets[0];socket.onopen();
 const report=value=>socket.onmessage({data:JSON.stringify(value)});
 report({type:'ready',monitorId:'a'.repeat(24),width:1920,height:1080});
 assert.equal(cursor.hasAttribute('hidden'),true);
 report({type:'pointer',visible:true,x:.5,y:.5});assert.equal(cursor.hasAttribute('hidden'),false,'SVG hidden attribute must be removed, not assigned as a JavaScript property');assert.equal(cursor.style.left,'150px');assert.equal(cursor.style.top,'100px');
 report({type:'pointer',visible:true,x:.25,y:.25});assert.equal(cursor.style.left,'75px');assert.equal(cursor.style.top,'57.8125px');
 report({type:'pointer',visible:false,x:0,y:0});assert.equal(cursor.hasAttribute('hidden'),true);
 report({type:'pointer',visible:true,x:.7,y:.4});assert.equal(cursor.hasAttribute('hidden'),false);
 w.PCRSecondScreen.stop();assert.equal(cursor.hasAttribute('hidden'),true);
 delete w.PCRAndroid;w.dispatchEvent(new w.Event('pcr:auth'));
 assert.equal(w.document.querySelector('.secondScreenHome').hidden,false,'owner browsers can find Second screen and read its requirements');
 w.PCRAuth={signedIn:true,role:'guest'};w.dispatchEvent(new w.Event('pcr:auth'));
 assert.equal(w.document.querySelector('.secondScreenHome').hidden,true);

});
