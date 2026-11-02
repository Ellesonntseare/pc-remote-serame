'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{JSDOM}=require('jsdom');
test('Projects launcher follows account sign-in and opens the same-server Socials path',async()=>{
 const dom=new JSDOM('<div class="heroactions"></div>',{url:'http://localhost:7666/',runScripts:'outside-only'}),w=dom.window;
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'));};
 const requests=[];w.fetch=async url=>{requests.push(url);return {ok:true,json:async()=>({projects:[{name:'Elleson Socials',description:'Manage social posts',available:true}]})};};
 w.PCRAuth={signedIn:true,role:'owner'};w.eval(fs.readFileSync(path.join(__dirname,'../public/projects.js'),'utf8'));w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
 const button=w.document.getElementById('projectsButton');assert.equal(button.hidden,false);button.click();await new Promise(r=>setTimeout(r,0));assert.equal(w.document.getElementById('projectsPage').open,true);assert.deepEqual(requests,['/api/projects']);assert.equal(w.document.querySelector('.projectsOpen').getAttribute('href'),'/socials/');
 w.PCRAuth={signedIn:true,role:'guest'};w.dispatchEvent(new w.Event('pcr:auth'));assert.equal(button.hidden,true);assert.equal(w.document.getElementById('projectsPage').open,false);dom.window.close();
});
