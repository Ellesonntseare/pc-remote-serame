'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{createApp}=require('../server');
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64');
test('normal clipboard requests preserve text and pictures, authenticate image bytes and reject stale account writes',async t=>{
 const applied=[],app=createApp({password:'clipboard-fixture-only',disableAgent:true,disableActions:true,sharedClipboardProvider:{apply:async value=>applied.push(value)}});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));t.after(async()=>{app.stop();await new Promise(r=>app.server.close(r));});const origin='http://127.0.0.1:'+app.server.address().port;
 const pair=await fetch(origin+'/api/pair',{method:'POST',headers:{'X-PCR':'1'},body:JSON.stringify({password:'clipboard-fixture-only'})});assert.equal(pair.status,200);const cookie=pair.headers.get('set-cookie').split(';')[0];
 const call=(route,body,headers={})=>fetch(origin+route,{headers:{Cookie:cookie,'X-PCR':'1',...headers},...(body?{method:'POST',body:JSON.stringify(body)}:{})});
 assert.equal((await fetch(origin+'/api/clipboard/current')).status,401);
 const copy=await call('/api/clipboard/current',{id:'http-copy-text',kind:'text',text:'  Text sent directly\n'});assert.equal(copy.status,200);const first=await copy.json();assert.equal(first.text,'  Text sent directly\n');assert.equal(applied[0].text,first.text);
 assert.equal((await call('/api/clipboard/current?after='+first.revision).then(r=>r.json())).text,undefined);assert.equal((await call('/api/clipboard/current',{id:'http-copy-text',kind:'text',text:first.text}).then(r=>r.json())).duplicate,true);assert.equal(applied.length,1);
 assert.equal((await call('/api/clipboard/current',{kind:'text',text:'Old account'},{'X-PCR-Account':'google:another'})).status,409);
 const picture=await call('/api/clipboard/current',{id:'http-copy-picture',kind:'image',data:png.toString('base64')});assert.equal(picture.status,200);const value=await picture.json();const download=await call(value.url);assert.equal(download.headers.get('content-type'),'image/png');assert.deepEqual(Buffer.from(await download.arrayBuffer()),png);assert.equal(applied[1].kind,'image');assert.equal((await fetch(origin+value.url)).status,401);
 assert.equal((await call('/api/clipboard/current',{kind:'image',data:'not-a-picture'})).status,400);assert.equal(applied.length,2);
 await call('/api/unpair',{});assert.equal((await call(value.url)).status,401);
});
