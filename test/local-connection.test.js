'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{JSDOM}=require('jsdom');
const {parseAddress}=require('../public/local-connection');

test('local IP entry accepts all three dots, full local URLs and ports, while rejecting malformed destinations',()=>{
  for(const input of ['192.168.8.100','http://192.168.8.100:7666/',' 192.168.8.100 '])assert.deepEqual(parseAddress(input),{ip:'192.168.8.100',port:7666,url:'http://192.168.8.100:7666/'});
  assert.equal(parseAddress('010.001.002.003:9000').url,'http://10.1.2.3:9000/');
  for(const input of ['192.1688100','192.168.8.256','192.168.8','8.8.8.8','https://192.168.8.100','192.168.8.100:0','192.168.8.100:65536','192.168.8.100/path','http://user@192.168.8.100'])assert.equal(parseAddress(input),null,input);
});

test('login, Devices and Files open a real address page; native switching preserves dots and protects active transfers',async t=>{
  const dom=new JSDOM('<body><form class="mcLoginBottom"><button type="button" data-login-help>Local connection</button></form><dialog id="sessionTools"><header></header></dialog><dialog id="filesDialog"><div class="filesTabs"></div><div id="filesProgress" hidden></div></dialog></body>',{url:'https://remote.example',runScripts:'outside-only',pretendToBeVisual:true});t.after(()=>dom.window.close());
  const w=dom.window,messages=[];w.PCRNativeCapabilities={localConnection:true};w.PCRAndroid={postMessage:value=>messages.push(JSON.parse(value))};w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'));};
  w.eval(fs.readFileSync(path.join(__dirname,'../public/local-connection.js'),'utf8'));await new Promise(r=>w.addEventListener('load',r,{once:true}));
  const doc=w.document,page=doc.getElementById('localConnectionPage');assert.ok(page);doc.querySelector('[data-local-open]').click();assert.equal(page.open,true);
  const input=doc.getElementById('localPcAddress');assert.equal(input.type,'text');assert.equal(input.inputMode,'url');input.value='192.168.8.100';
  doc.getElementById('filesProgress').hidden=false;page.querySelector('[data-connect]').click();assert.equal(messages.length,0);assert.match(page.querySelector('[role=status]').textContent,/transfer/);
  doc.getElementById('filesProgress').hidden=true;input.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));assert.deepEqual(messages,[{type:'connect-local',address:'192.168.8.100',port:7666}]);
  w.PCRLocalConnection.nativeStatus({state:'error',message:'PC unavailable'});assert.equal(page.querySelector('[data-connect]').disabled,false);assert.match(page.querySelector('[role=status]').textContent,/PC unavailable/);
  page.close();doc.querySelector('#sessionTools [data-local-open]').click();assert.equal(page.open,true);page.close();doc.querySelector('#filesDialog .localFilesShortcut').click();assert.equal(page.open,true);
});
