'use strict';
// Opt-in real Chromium layout check; only synthetic files and a temporary host.
require('./use-sandbox-home.cjs');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
let chromium;try{({chromium}=require('playwright'));}catch{({chromium}=require(process.env.PLAYWRIGHT_MODULE||path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')));}
const {createApp}=require('../server');
(async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'elleson-phone-layout-')),out=path.join(root,'screenshots');await fs.mkdir(out);const downloads=path.join(root,'Downloads'),desktop=path.join(root,'Desktop');await fs.mkdir(downloads);await fs.mkdir(desktop);await fs.writeFile(path.join(desktop,'Desktop notes.txt'),'Synthetic desktop data');
 for(const name of ['Project notes.txt','A very long filename with important details that should remain readable on a small phone screen.txt','Budget 2026.csv'])await fs.writeFile(path.join(downloads,name),'Synthetic preview data');
 await fs.mkdir(path.join(downloads,'Documents'));let browser,app;
 try{
  app=createApp({transferDirectory:root,fileLocations:[{id:'@downloads',label:'Downloads',kind:'known',directory:downloads},{id:'@desktop',label:'Desktop',kind:'known',directory:desktop}],disableAgent:true,disableActions:true});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+app.server.address().port;
  browser=await chromium.launch({channel:process.env.PLAYWRIGHT_CHANNEL||'msedge',headless:true});
  for(const [width,height]of [[320,740],[390,844],[844,390],[1280,800]]){
   const context=await browser.newContext({viewport:{width,height},hasTouch:width<1000,isMobile:width<1000});
   await context.request.post(base+'/api/pair',{headers:{'X-PCR':'1'},data:{}});const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.goto(base);await page.waitForFunction(()=>window.EllesonFlow&&window.PCRAuth?.signedIn);
   await page.screenshot({path:path.join(out,`${width}-home.png`)});
   await page.evaluate(()=>window.EllesonFlow.navigate('files'));await page.waitForFunction(()=>window.PCRExplorerControls);await page.evaluate(()=>window.PCRFileManager.go('@downloads'));await page.locator('#filesDialog[open] .fmFile').first().waitFor();await page.waitForTimeout(450);
   await page.screenshot({path:path.join(out,`${width}-files.png`)});
   const metrics=await page.evaluate(()=>{const d=document.getElementById('filesDialog'),body=d.querySelector('.explorerBody'),content=d.querySelector('.explorerContent'),name=d.querySelector('.fmFileName');return{width:innerWidth,height:innerHeight,dialog:d.getBoundingClientRect().toJSON(),body:body.getBoundingClientRect().toJSON(),content:content.getBoundingClientRect().toJSON(),overflow:content.scrollWidth-content.clientWidth,rootOverflow:document.documentElement.scrollWidth-innerWidth,files:document.querySelectorAll('.fmFile').length,filenameHeight:name.getBoundingClientRect().height,commandOverflow:d.querySelector('.explorerCommands').scrollWidth-d.querySelector('.explorerCommands').clientWidth,sidebar:getComputedStyle(d.querySelector('.explorerSidebar')).display,structure:body.getBoundingClientRect().height<60?Array.from(d.querySelectorAll('#filesPane,.fileManager,[data-pc-files],.explorerAddress,.explorerCommands,.explorerStatus,.filesNotify')).map(e=>({node:e.id||e.className||e.tagName,height:e.getBoundingClientRect().height,flex:getComputedStyle(e).flex,minHeight:getComputedStyle(e).minHeight})):undefined};});
   console.log(JSON.stringify(metrics));assert.equal(metrics.overflow,0,'File contents must fit horizontally');if(width<1000)assert.equal(metrics.commandOverflow,0,'Commands must fit horizontally');assert.ok(metrics.rootOverflow<=0,'Page must fit horizontally');assert.ok(metrics.body.height>60,'A usable file area must remain');assert.deepEqual(errors,[]);
   if(width<=480){await page.locator('.phoneFoldersToggle').click();assert.equal(await page.locator('.phoneFoldersToggle').getAttribute('aria-expanded'),'true');await page.screenshot({path:path.join(out,`${width}-folders.png`)});await page.locator('.phoneFoldersToggle').click();}
   if(width===390){
    const select=page.locator('.fmSelect').first();await select.check();assert.equal(await select.isChecked(),true);await select.uncheck();
    const hit=await page.locator('.fmFile').first().evaluate(row=>{const name=row.querySelector('.fmFileName'),r=row.getBoundingClientRect(),n=name.getBoundingClientRect();return document.elementFromPoint(n.left+10,r.bottom-5)===name;});assert.equal(hit,true,'The filename action must cover the metadata tap area');
    await page.evaluate(async()=>{PCRFileManager.select(['@downloads/Project notes.txt']);PCRExplorerControls.copy();PCRFileManager.go('@desktop');await PCRFileManager.refresh();});
    await page.getByRole('button',{name:'Paste (Ctrl+V)',exact:true}).click();await page.locator('.fmFile[data-file="@desktop/Project notes.txt"]').waitFor();assert.equal(await fs.readFile(path.join(desktop,'Project notes.txt'),'utf8'),'Synthetic preview data');
    await page.evaluate(async()=>{PCRFileManager.select(['@desktop/Project notes.txt']);PCRExplorerControls.cut();PCRFileManager.go('@downloads/Documents');await PCRFileManager.refresh();});
    await page.getByRole('button',{name:'Paste (Ctrl+V)',exact:true}).click();await page.locator('.fmFile[data-file="@downloads/Documents/Project notes.txt"]').waitFor();await assert.rejects(fs.stat(path.join(desktop,'Project notes.txt')),{code:'ENOENT'});assert.equal(await fs.readFile(path.join(downloads,'Documents','Project notes.txt'),'utf8'),'Synthetic preview data');
    await page.evaluate(async()=>{PCRFileManager.go('@downloads');await PCRFileManager.refresh();});
    await page.locator('.explorerMore>summary').click();await page.waitForTimeout(50);await page.screenshot({path:path.join(out,'390-menu.png')});await page.locator('.explorerMore>summary').click();
    await page.evaluate(()=>PCRExplorerControls.showAddress());await page.locator('.explorerAddressEntry input').fill('Downloads\\Documents');await page.setViewportSize({width:390,height:400});await page.waitForFunction(()=>document.documentElement.classList.contains('phoneKeyboardOpen'));assert.equal(await page.locator('.explorerAddressEntry input').isVisible(),true);await page.screenshot({path:path.join(out,'390-address-keyboard.png')});await page.setViewportSize({width:390,height:844});await page.locator('.explorerAddressEntry').evaluate(e=>e.requestSubmit());await page.waitForFunction(()=>PCRFileManager.path==='@downloads/Documents');await page.evaluate(async()=>{await PCRFileManager.refresh();});
    await page.evaluate(()=>PCRFileManager.back());await page.waitForFunction(()=>PCRFileManager.path==='@downloads');await page.evaluate(async()=>{await PCRFileManager.refresh();});
    await page.evaluate(()=>{const row=document.querySelector('.fmFile');row.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:140,clientY:230}));});await page.screenshot({path:path.join(out,'390-context.png')});await page.locator('.explorerContextMenu').getByRole('menuitem',{name:'Properties',exact:true}).click();await page.screenshot({path:path.join(out,'390-properties.png')});await page.getByRole('button',{name:'Close details',exact:true}).click();
    await page.evaluate(async()=>{PCRFileManager.go('@desktop');await PCRFileManager.refresh();});await page.screenshot({path:path.join(out,'390-desktop.png')});await page.evaluate(async()=>{PCRFileManager.go('@downloads');await PCRFileManager.refresh();});
    await page.locator('.explorerSearch input').focus();await page.setViewportSize({width:390,height:400});await page.waitForFunction(()=>document.documentElement.classList.contains('phoneKeyboardOpen'));
    await page.screenshot({path:path.join(out,'390-keyboard.png')});
    const keyboard=await page.evaluate(()=>({dialog:document.getElementById('filesDialog').getBoundingClientRect().bottom,content:document.querySelector('.explorerContent').getBoundingClientRect().height,field:document.activeElement.getBoundingClientRect().bottom,nav:getComputedStyle(document.querySelector('#filesDialog .ecNavigation')).display}));console.log('Keyboard '+JSON.stringify(keyboard));assert.ok(keyboard.dialog<=400);assert.ok(keyboard.content>=60);assert.ok(keyboard.field<=400);assert.equal(keyboard.nav,'none');
    await page.setViewportSize({width:390,height:844});await page.waitForFunction(()=>!document.documentElement.classList.contains('phoneKeyboardOpen'));
   }
   if(width<1000){
    await page.evaluate(()=>{document.activeElement?.blur();window.rsRun=()=>{rs.m={w:1920,h:1080};window.PCRScreenTools?.metadata();};window.EllesonFlow.navigate('remote');});await page.waitForTimeout(450);
    await page.screenshot({path:path.join(out,`${width}-remote.png`)});
    const remote=await page.evaluate(()=>{const r=document.getElementById('rs'),v=document.getElementById('rsv'),f=document.getElementById('rsFullscreen');return{width:r.clientWidth,overflow:r.scrollWidth-r.clientWidth,view:v.getBoundingClientRect().height,fullscreen:f.getBoundingClientRect().toJSON()};});console.log('Remote '+JSON.stringify(remote));assert.ok(remote.overflow<=0);assert.ok(remote.view>50);assert.ok(remote.fullscreen.width>=48);assert.ok(remote.fullscreen.bottom<=height,'Fullscreen must remain reachable');
    await page.evaluate(()=>{window.PCRAndroid={postMessage(){}};});await page.locator('#rsFullscreen').click();await page.waitForTimeout(100);
    assert.equal(await page.locator('#rs').evaluate(e=>e.classList.contains('screenClean')),true);assert.equal(await page.locator('#remoteSwipeDock').isVisible(),false);
    const clean=await page.locator('#rsv').boundingBox();assert.ok(clean.width>=width-1);assert.ok(clean.height>=height-1);await page.screenshot({path:path.join(out,`${width}-fullscreen.png`)});await page.evaluate(()=>window.PCRScreenTools.restoreControls());
    if(width===390){
     await page.evaluate(()=>window.PCRPhoneWorkspaces.open());await page.locator('#phoneWorkspacePresets input').focus();await page.setViewportSize({width:390,height:400});await page.waitForFunction(()=>document.documentElement.classList.contains('phoneKeyboardOpen'));
     await page.waitForTimeout(400);const box=await page.locator('#phoneWorkspacePresets').boundingBox();console.log('Preset keyboard '+JSON.stringify(box));console.log(await page.locator('#phoneWorkspacePresets').evaluate(e=>{const s=getComputedStyle(e);return JSON.stringify({classes:e.className,height:s.height,min:s.minHeight,max:s.maxHeight,top:s.top,margin:s.margin,transform:s.transform,viewport:document.documentElement.style.getPropertyValue('--phone-viewport-height')});}));assert.ok(box.y>=0&&box.y+box.height<=400);await page.screenshot({path:path.join(out,'390-presets-keyboard.png')});await page.locator('#phoneWorkspacePresets').evaluate(e=>e.close());
    }
    assert.deepEqual(errors,[]);
   }
   await context.close();
  }
  console.log('Screenshots: '+out);
 }finally{await browser?.close();if(app){app.stop();await new Promise(r=>app.server.close(r));}}
})().catch(e=>{console.error(e);process.exitCode=1;});
