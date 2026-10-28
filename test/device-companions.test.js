'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),http=require('node:http');
const {WebSocket}=require('ws'),{createDeviceCompanions}=require('../device-companions'),{createSharedClipboard}=require('../shared-clipboard'),{createAccountWorkspace}=require('../account-workspace');
async function fixture(t){
 const store=createAccountWorkspace(),clipboard=createSharedClipboard({store}),sessions=new Map([['owner',{role:'owner',scope:'owner'}],['other',{role:'owner',scope:'google:other'}],['guest',{role:'guest',scope:null}]]);
 const companions=createDeviceCompanions({clipboard,sessions,auth:req=>sessions.has(req.headers.cookie)?req.headers.cookie:null,scopeFor:token=>sessions.get(token)?.scope,sessionExpiry:()=>()=>{}}),server=http.createServer(),clients=[];
 server.on('upgrade',(req,socket,head)=>companions.upgrade(req,socket,head,req.headers.cookie));await new Promise(r=>server.listen(0,'127.0.0.1',r));
 t.after(async()=>{companions.close();for(const client of clients)client.ws.terminate();await new Promise(r=>server.close(r));await clipboard.close();store.close();});
 async function connect(token,id='device-phone-1234'){
  const ws=new WebSocket('ws://127.0.0.1:'+server.address().port,{headers:{Cookie:token}}),messages=[],waiters=[];
  ws.on('message',bytes=>{const value=JSON.parse(bytes);messages.push(value);for(const wake of [...waiters])wake();});
  const client={ws,messages,wait(predicate){return new Promise((resolve,reject)=>{const find=()=>{const index=messages.findIndex(predicate);if(index<0)return;messages.splice(index,1);clearTimeout(timer);waiters.splice(waiters.indexOf(find),1);resolve();};const timer=setTimeout(()=>{waiters.splice(waiters.indexOf(find),1);reject(Error('Expected device message did not arrive'));},2000);waiters.push(find);find();});}};clients.push(client);
  await new Promise((resolve,reject)=>{ws.once('open',resolve);ws.once('error',reject);});
  ws.send(JSON.stringify({type:'hello',deviceId:id,name:'Test phone',capabilities:{clipboardText:true,clipboardImages:true,keyboard:true}}));return client;
 }
 return{clipboard,companions,sessions,connect};
}
test('connected phones receive same-account clipboard changes and lightweight unchanged revisions',async t=>{
 const f=await fixture(t),phone=await f.connect('owner'),other=await f.connect('other');await phone.wait(v=>v.type==='connected');await other.wait(v=>v.type==='connected');await phone.wait(v=>v.type==='clipboard');await other.wait(v=>v.type==='clipboard');
 const value=await f.clipboard.copy('owner',{id:'copy-between-devices',kind:'text',text:'  preserve whitespace\n'});await phone.wait(v=>v.type==='clipboard'&&v.text==='  preserve whitespace\n');assert.equal(other.messages.some(v=>v.text),false);assert.equal(f.companions.devices('owner').length,1);assert.equal(f.companions.devices('google:other').length,1);
 phone.ws.send(JSON.stringify({type:'clipboard-resume',after:value.revision}));await phone.wait(v=>v.type==='clipboard'&&v.changed===false&&v.text===undefined);
});
test('device commands cannot be answered by a different phone and revocation ends outstanding work',async t=>{
 const f=await fixture(t),phone=await f.connect('owner'),other=await f.connect('other');await phone.wait(v=>v.type==='connected');await other.wait(v=>v.type==='connected');
 const result=f.companions.request('owner','device-phone-1234','ring');await phone.wait(v=>{if(v.type!=='command')return false;other.ws.send(JSON.stringify({type:'reply',id:v.id,ok:true,result:{wrong:true}}));phone.ws.send(JSON.stringify({type:'reply',id:v.id,ok:true,result:{ringing:true}}));return true;});assert.deepEqual(await result,{ringing:true});
 const waiting=f.companions.request('owner','device-phone-1234','file-roots');const rejected=assert.rejects(waiting,/session ended/);await phone.wait(v=>v.type==='command');f.companions.revoke('owner');await rejected;assert.equal(f.companions.devices('owner').length,0);assert.equal(f.companions.devices('google:other').length,1);
});
test('reconnecting the same phone replaces its old connection and guests cannot register',async t=>{
 const f=await fixture(t),old=await f.connect('owner');await old.wait(v=>v.type==='connected');const replacement=await f.connect('owner');await replacement.wait(v=>v.type==='connected');assert.equal(f.companions.devices('owner').length,1);
 const guest=await f.connect('guest');if(guest.ws.readyState!==WebSocket.CLOSED)await new Promise(r=>guest.ws.once('close',r));assert.equal(f.companions.devices(null).length,0);
});
