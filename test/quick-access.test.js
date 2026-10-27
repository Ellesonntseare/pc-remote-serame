'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{JSDOM}=require('jsdom');
test('one shared navigation bar preserves Files state and opens Audio and Screen directly',t=>{
 const dom=new JSDOM('<div class="app"><nav class="mcBottomNav"><button>Old navigation</button></nav></div><dialog id="filesDialog" open><input value="Kept folder search"></dialog><button class="filesHome">Files</button>',{runScripts:'outside-only'}),w=dom.window,d=w.document;t.after(()=>w.close());let homes=0,opens=0,audios=0,fileOpens=0;
 w.PCRAuth={signedIn:true,role:'owner'};w.PCRCanAccess=()=>true;w.PCRPages={current:'filesDialog',home:()=>homes++};w.PCRAudioHub={open:()=>audios++};w.rsOpen=()=>opens++;d.querySelector('.filesHome').onclick=()=>fileOpens++;w.eval(fs.readFileSync(path.join(__dirname,'../public/accessibility.js'),'utf8'));
 assert.equal(d.querySelectorAll('nav').length,1);assert.equal(d.querySelector('.mcBottomNav').parentElement.id,'filesDialog');d.querySelector('[data-quick-action=file]').click();assert.equal(homes,0);assert.equal(fileOpens,0);assert.equal(d.querySelector('#filesDialog input').value,'Kept folder search');
 d.querySelector('[data-quick-action=audio]').click();assert.equal(homes,1);assert.equal(audios,1);d.querySelector('[data-quick-action=screen]').click();assert.equal(opens,1);
 w.PCRPages.current='rs';w.dispatchEvent(new w.CustomEvent('pcr:page',{detail:{id:'rs'}}));assert.equal(d.querySelector('.mcBottomNav').hidden,true,'remote screen keeps its dedicated keys rather than a second bar');
});
