'use strict';
require('./use-sandbox-home.cjs');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
let chromium;try{({chromium}=require('playwright'));}catch{({chromium}=require(process.env.PLAYWRIGHT_MODULE||path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')));}
const {createApp}=require('../server');
(async()=>{const root=await fs.mkdtemp(path.join(os.tmpdir(),'elleson-pointer-alignment-'));let browser,app;try{
 app=createApp({transferDirectory:root,disableAgent:true,disableActions:true,clipboardProvider:{get:async()=>'',set:async()=>{}}});await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+app.server.address().port;
 browser=await chromium.launch({channel:process.env.PLAYWRIGHT_CHANNEL||'msedge',headless:true});
 for(const [width,height]of [[390,844],[844,390]]){
  const context=await browser.newContext({viewport:{width,height},isMobile:true,hasTouch:true});await context.addInitScript(()=>localStorage.setItem('pcr_engine','compatibility'));await context.request.post(base+'/api/pair',{headers:{'X-PCR':'1'},data:{}});const page=await context.newPage();await page.goto(base);await page.waitForFunction(()=>window.EllesonFlow&&window.PCRCursor&&window.PCRTypingControls);
  await page.evaluate(()=>{window.rsRun=()=>{rs.on=1;rs.m={w:1920,h:1080};const canvas=document.getElementById('rsc');canvas.width=1920;canvas.height=1080;const c=canvas.getContext('2d');c.fillStyle='#293544';c.fillRect(0,0,1920,1080);for(let x=0;x<1920;x+=120){c.fillStyle='#6e8299';c.fillRect(x,0,1,1080);}for(let y=0;y<1080;y+=120)c.fillRect(0,y,1920,1);window.PCRScreenTools.metadata();window.PCRScreenTools.frame();};window.qc=command=>{window.pointerCommands.push(command);window.PCRCursor.preview(command);if(command.startsWith('abs ')){const[,x,y]=command.split(' ').map(Number);window.PCRCursor.report({x,y,visible:true});}};window.pointerCommands=[];window.typingRequest=async()=>({editable:false});window.EllesonFlow.navigate('remote');});await page.waitForTimeout(450);
  for(const zoom of [1,2]){
   await page.evaluate(zoom=>window.PCRScreenTools.setZoom(zoom),zoom);await page.waitForTimeout(80);const box=await page.locator('#rsv').boundingBox();const x=box.x+box.width*.55,y=box.y+box.height*.45;await page.touchscreen.tap(x,y);await page.waitForTimeout(170);
   const result=await page.evaluate(({x,y})=>{const canvas=document.getElementById('rsc'),pointer=document.querySelector('.remoteCursor'),rect=canvas.getBoundingClientRect(),arrow=pointer.getBoundingClientRect();return{tap:{x,y},canvas:rect.toJSON(),pointer:arrow.toJSON(),offsets:{x:canvas.offsetLeft,y:canvas.offsetTop},size:{w:canvas.clientWidth,h:canvas.clientHeight},command:window.pointerCommands.filter(command=>command.startsWith('abs ')).at(-1),error:{x:arrow.x-x,y:arrow.y-y}};},{x,y});console.log(JSON.stringify({width,height,zoom,...result}));assert.ok(result.command);assert.ok(Math.abs(result.error.x)<2&&Math.abs(result.error.y)<2,'pointer tip must match the tapped PC pixel');
  }
  await page.evaluate(()=>{window.PCRScreenTools.setZoom(1);window.rsKb();});await page.waitForTimeout(180);
  const target=await page.evaluate(()=>{const b=window.PCRScreenTools.imageBox();return{x:b.x+b.w*.62,y:b.y+b.h*.37,expectedX:Math.round(.62*(rs.m.w-1)),expectedY:Math.round(.37*(rs.m.h-1))};});
  await page.touchscreen.tap(target.x,target.y);await page.waitForTimeout(180);
  const sent=await page.evaluate(()=>window.pointerCommands.filter(c=>c.startsWith('abs ')).at(-1));console.log(JSON.stringify({width,height,keyboardTap:target,sent}));assert.equal(sent,'abs '+target.expectedX+' '+target.expectedY,'closing the phone keyboard must not retarget the tap');
  // The Android mini view fits the whole desktop inside a differently shaped
  // canvas. Its black margins are outside the desktop's input coordinate space.
  await page.evaluate(()=>{window.rsTypeClose();const c=document.getElementById('rsc');c.style.setProperty('width','300px','important');c.style.setProperty('height','280px','important');c.style.setProperty('object-fit','contain','important');});await page.waitForTimeout(120);
  const fitted=await page.evaluate(()=>{const r=document.getElementById('rsc').getBoundingClientRect(),w=r.width,h=w*1080/1920;return{x:r.x+w*.62,y:r.y+(r.height-h)/2+h*.37,expectedX:Math.round(.62*1919),expectedY:Math.round(.37*1079)};});
  await page.touchscreen.tap(fitted.x,fitted.y);await page.waitForTimeout(180);
  const fitResult=await page.evaluate(()=>({sent:window.pointerCommands.filter(c=>c.startsWith('abs ')).at(-1),arrow:document.querySelector('.remoteCursor').getBoundingClientRect().toJSON()}));console.log(JSON.stringify({width,height,fittedTap:fitted,...fitResult}));assert.equal(fitResult.sent,'abs '+fitted.expectedX+' '+fitted.expectedY,'black margins must not shift the desktop target');assert.ok(Math.abs(fitResult.arrow.x-fitted.x)<2&&Math.abs(fitResult.arrow.y-fitted.y)<2,'the fitted-image arrow must point at the tapped pixel');
  const margin=await page.evaluate(()=>{const c=document.getElementById('rsc').getBoundingClientRect(),image=window.PCRScreenTools.imageBox();return{x:image.x+image.w/2,y:c.y+8,count:window.pointerCommands.length};});await page.touchscreen.tap(margin.x,margin.y);await page.waitForTimeout(150);assert.equal(await page.evaluate(()=>window.pointerCommands.length),margin.count,'a black-margin tap must not click the PC');
  await page.screenshot({path:path.join(root,width+'-alignment.png')});await context.close();
 }
 console.log('Previews: '+root);
}finally{await browser?.close();if(app){app.stop();await new Promise(resolve=>app.server.close(resolve));}}})().catch(error=>{console.error(error);process.exitCode=1;});
