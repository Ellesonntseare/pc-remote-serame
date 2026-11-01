'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{JSDOM}=require('jsdom'),fs=require('node:fs'),path=require('node:path');
const settle=()=>new Promise(r=>setTimeout(r,35));
function fixture(t){
 const dom=new JSDOM('<input id="search"><textarea id="typeText"></textarea><dialog id="filesDialog"><div class="explorerCommands"></div><div class="explorerSidebar"><button>Documents</button></div><div class="explorerContent"></div></dialog>',{runScripts:'outside-only',pretendToBeVisual:true});t.after(()=>dom.window.close());const w=dom.window,v=new w.EventTarget();Object.assign(v,{width:390,height:844,offsetTop:0,scale:1});Object.defineProperty(w,'visualViewport',{value:v});w.eval(fs.readFileSync(path.join(__dirname,'../public/phone-workspaces.js'),'utf8'));w.document.dispatchEvent(new w.Event('DOMContentLoaded'));return {w,v,d:w.document};
}
test('keyboard contraction resizes pages and hides navigation, then restores it without confusing rotation with a keyboard',async t=>{
 const {w,v,d}=fixture(t);d.getElementById('search').focus();v.height=400;v.offsetTop=12;v.dispatchEvent(new w.Event('resize'));await settle();assert.equal(d.documentElement.classList.contains('phoneKeyboardOpen'),true);assert.equal(d.documentElement.style.getPropertyValue('--phone-viewport-height'),'400px');assert.equal(d.documentElement.style.getPropertyValue('--phone-viewport-top'),'12px');
 v.height=844;v.offsetTop=0;v.dispatchEvent(new w.Event('resize'));await settle();assert.equal(d.documentElement.classList.contains('phoneKeyboardOpen'),false);
 v.width=844;v.height=390;v.dispatchEvent(new w.Event('resize'));await settle();assert.equal(d.documentElement.classList.contains('phoneKeyboardOpen'),false);
});
test('pinch zoom does not shrink page layout or trigger keyboard handling',async t=>{
 const {w,v,d}=fixture(t);d.getElementById('search').focus();v.scale=2;v.height=350;v.dispatchEvent(new w.Event('resize'));await settle();assert.equal(d.documentElement.style.getPropertyValue('--phone-viewport-height'),'844px');assert.equal(d.documentElement.classList.contains('phoneKeyboardOpen'),false);
});
test('folder drawer exposes its state, closes on navigation, and Escape closes only the drawer',t=>{
 const {w,d}=fixture(t),files=d.getElementById('filesDialog'),toggle=d.querySelector('.phoneFoldersToggle');toggle.click();assert.equal(toggle.getAttribute('aria-expanded'),'true');assert.equal(files.classList.contains('phoneFoldersOpen'),true);d.querySelector('.explorerSidebar button').click();assert.equal(toggle.getAttribute('aria-expanded'),'false');toggle.click();const escape=new w.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true});files.dispatchEvent(escape);assert.equal(escape.defaultPrevented,true);assert.equal(files.classList.contains('phoneFoldersOpen'),false);assert.equal(d.activeElement,toggle);
});
