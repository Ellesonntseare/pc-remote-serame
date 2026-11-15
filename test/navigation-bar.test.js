'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const {JSDOM} = require('jsdom');
const source = fs.readFileSync(require.resolve('../public/navigation-bar.js'), 'utf8');
const key = 'elleson_navigation_bar_v1';

function fixture(t, saved) {
  const dom = new JSDOM('<html class="ecFlow"><body><div class="app"><nav class="ecNavigation" data-environment="home"><button data-ec-go="files">Files</button></nav></div><dialog id="filesDialog" open></dialog></body></html>', {url: 'https://pc.test', runScripts: 'outside-only', pretendToBeVisual: true});
  const w = dom.window, bar = w.document.querySelector('nav');
  t.after(() => w.close());
  w.innerWidth = 390;
  w.innerHeight = 844;
  if (saved) w.localStorage.setItem(key, saved);
  const timers = new Map();
  let count = 0;
  w.setTimeout = callback => {timers.set(++count, callback);return count;};
  w.clearTimeout = id => timers.delete(id);
  bar.getBoundingClientRect = () => {
    const value = (name, fallback) => bar.dataset.navCustom ? Number.parseFloat(bar.style.getPropertyValue(`--ec-nav-${name}`)) : fallback;
    return {left:value('left',12), top:value('top',748), width:value('width',366), height:value('height',87)};
  };
  w.eval(source);
  w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
  function pointer(node, type, x, y) {
    const event = new w.MouseEvent(type, {bubbles:true, cancelable:true, button:0, clientX:x, clientY:y});
    Object.defineProperty(event, 'pointerId', {value:1});
    node.dispatchEvent(event);
  }
  return {w, bar, pointer, saved:()=>w.localStorage.getItem(key), idle:()=>[...timers.values()].forEach(fn=>fn())};
}

test('moving and resizing the same navigation bar preserves its Files action and bounds', t => {
  const f = fixture(t), move = f.bar.querySelector('.ecNavMove'), resize = f.bar.querySelector('.ecNavResize');
  let opened = 0;
  const files = f.bar.querySelector('[data-ec-go=files]');
  files.onclick = () => opened++;
  f.pointer(move, 'pointerdown', 180, 750);
  f.pointer(move, 'pointermove', 180, 100);
  f.pointer(move, 'pointerup', 180, 100);
  assert.equal(f.bar.getBoundingClientRect().top, 98);
  f.pointer(resize, 'pointerdown', 360, 180);
  f.pointer(resize, 'pointermove', 280, 175);
  f.pointer(resize, 'pointerup', 280, 175);
  assert.equal(f.bar.getBoundingClientRect().width, 286);
  f.w.document.getElementById('filesDialog').append(f.bar);
  f.bar.dataset.environment = 'files';
  f.w.dispatchEvent(new f.w.Event('pcr:page'));
  assert.equal(f.bar.getBoundingClientRect().top, 98);
  files.click();
  assert.equal(opened, 1);
  f.w.innerWidth = 270;
  f.w.dispatchEvent(new f.w.Event('resize'));
  assert.ok(f.bar.getBoundingClientRect().left + f.bar.getBoundingClientRect().width <= 263);
});

test('idle fade keeps tabs interactive and the hide state survives reload with a way to show tabs', t => {
  const f = fixture(t);
  f.idle();
  assert.equal(f.bar.classList.contains('ecNavIdle'), true);
  let opened = 0;
  const files = f.bar.querySelector('[data-ec-go=files]');
  files.onclick = () => opened++;
  f.pointer(files, 'pointerdown', 180, 750);
  files.click();
  assert.equal(opened, 1);
  assert.equal(f.bar.classList.contains('ecNavIdle'), false);
  f.bar.querySelector('.ecNavHide').click();
  assert.equal(f.bar.dataset.navCollapsed, 'true');
  const reloaded = fixture(t, f.saved());
  assert.equal(reloaded.bar.dataset.navCollapsed, 'true');
  reloaded.bar.querySelector('.ecNavShow').click();
  assert.equal(reloaded.bar.dataset.navCollapsed, 'false');
  assert.equal(JSON.parse(reloaded.saved()).hidden, false);
});

test('phone Remote keeps bottom tabs visible without changing saved layouts on other pages',t=>{
 const saved=JSON.stringify({hidden:true,rail:{x:.8,y:.1,width:90,height:320},bottom:{x:.2,y:.2,width:300,height:90}}),f=fixture(t,saved);
 f.w.innerWidth=844;f.w.innerHeight=390;f.w.matchMedia=()=>({matches:true});f.bar.dataset.environment='remote';f.w.dispatchEvent(new f.w.Event('pcr:page'));
 assert.equal(f.bar.dataset.navShape,'bottom');assert.equal(f.bar.dataset.navCollapsed,'false');assert.equal(f.bar.dataset.navCustom,undefined);
 f.bar.querySelector('.ecNavHide').click();assert.equal(f.bar.dataset.navCollapsed,'false');assert.equal(JSON.parse(f.saved()).hidden,true);
 f.bar.dataset.environment='files';f.w.dispatchEvent(new f.w.Event('pcr:page'));assert.equal(f.bar.dataset.navCollapsed,'true');
});
