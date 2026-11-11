'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {JSDOM} = require('jsdom');
const source = fs.readFileSync(path.join(__dirname,'../public/connection-health.js'),'utf8');
const settle = () => new Promise(setImmediate);

function fixture(t) {
  const dom = new JSDOM('<section id="workspaceSettings"><section data-settings-section="connection"><div class="settingsGroupContent"></div></section></section>',{url:'https://connect.example.test',runScripts:'outside-only'});
  t.after(() => dom.window.close());
  const w = dom.window;
  w.HTMLDialogElement.prototype.showModal = function(){this.open = true;};
  w.HTMLDialogElement.prototype.close = function(){this.open = false;};
  w.PCRAuth = {signedIn:true,role:'owner'};
  return w;
}

test('Connection health reports the local and website results in Settings',async t => {
  const w = fixture(t), messages = [];
  w.PCRNativeCapabilities = {routeRecovery:true,automaticRoute:true};
  w.PCRAndroid = {postMessage:raw => messages.push(JSON.parse(raw))};
  w.fetch = async () => ({ok:true,json:async () => ({ok:true,requirePassword:true})});
  w.eval(source);
  await settle();
  const card = w.document.querySelector('[data-settings-section=connection] .connectionHealth');
  card.querySelector('[data-check]').click();
  await settle();
  assert.ok(messages.some(message => message.type === 'connection-health'));
  w.dispatchEvent(new w.CustomEvent('pcr:connection-health',{detail:{host:'Reachable',local:'Connect to the same network.',website:'Reachable',automatic:false}}));
  assert.deepEqual([...card.querySelectorAll('dd')].map(node => node.textContent),['Reachable','Connect to the same network.','Reachable']);
  assert.equal(card.querySelector('[data-auto]').checked,false);
});

test('a restart reconnects only after a different host run responds',async t => {
  const w = fixture(t), previous = '1'.repeat(32), next = '2'.repeat(32);
  let hostRunId = previous, reconnected = 0, retry;
  const setTimeout = w.setTimeout.bind(w);
  w.setTimeout = (fn,delay) => {if(delay===3500){retry=fn;return 1000;}return setTimeout(fn,delay);};
  w.fetch = async () => ({ok:true,json:async () => ({ok:true,paired:true,hostRunId})});
  w.init = () => {reconnected++;};
  w.eval(source);
  await settle();
  w.dispatchEvent(new w.CustomEvent('pcr:restart-requested',{detail:{hostRunId:previous}}));
  await settle();
  assert.equal(reconnected,0);
  assert.match(w.document.querySelector('[data-restart-status]').textContent,/Waiting for Windows/);
  hostRunId = next;
  await retry();
  assert.equal(reconnected,1);
  assert.match(w.document.querySelector('[data-restart-status]').textContent,/back online/);
  assert.equal(w.sessionStorage.getItem('elleson_restart_watch_v1'),null);
});
