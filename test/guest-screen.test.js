'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs/promises'),path=require('node:path'),{WebSocket}=require('ws');
const {createApp}=require('../server'),{jpegSize,validMark}=require('../guest-screen');
const {command}=require('../phone-control');
const jpeg=Buffer.from('ffd8ffc00011080002000303012200021101031101ffd9','hex');
function request(port,route,{method='GET',body,cookie}={}){return new Promise((resolve,reject)=>{const req=http.request({hostname:'127.0.0.1',port,path:route,method,headers:{'X-PCR':'1',...cookie&&{Cookie:cookie}}},res=>{let text='';res.on('data',c=>text+=c);res.on('end',()=>resolve({status:res.statusCode,json:JSON.parse(text),cookie:res.headers['set-cookie']?.[0].split(';')[0]}));});req.on('error',reject);if(body)req.write(JSON.stringify(body));req.end();});}
async function fixture(t,nativeOverrides={}){const dir=await fs.mkdtemp(path.join(__dirname,'.transfer-check-'));let audioStops=0,audioOpens=0;const app=createApp({password:'serame',disableAgent:true,disableActions:true,transferDirectory:dir,clipboardProvider:{get:async()=>'',set:async()=>{}},nativeFeatures:{...nativeOverrides,close(){},openAudio(callbacks){audioOpens++;setImmediate(()=>{callbacks.onMetadata({type:'format',encoding:'f32le',sampleRate:48000,channels:2,source:'system-output'});callbacks.onPcm(Buffer.alloc(32));});let stopped=false;return {stop(){if(!stopped){audioStops++;stopped=true;}}};}}});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));const port=app.server.address().port,call=(route,options)=>request(port,route,options),owner=(await call('/api/pair',{method:'POST',body:{password:'serame'}})).cookie,sockets=[];
  function ws(cookie,route='/api/guest-screen',origin='http://127.0.0.1:'+port){const client=new WebSocket('ws://127.0.0.1:'+port+route,{headers:{Cookie:cookie,Origin:origin}});client.queue=[];client.on('message',(data,binary)=>client.queue.push(binary?Buffer.from(data):JSON.parse(data.toString())));sockets.push(client);return client;}
  t.after(async()=>{for(const s of sockets)s.terminate();app.stop();await new Promise(r=>app.server.close(r));if(path.dirname(dir)===__dirname&&path.basename(dir).startsWith('.transfer-check-'))await fs.rm(dir,{recursive:true,force:true});});
  async function guest(permissions={}){const pending=(await call('/api/pair',{method:'POST',body:{password:'guest'}})).cookie,id=(await call('/api/guest/requests',{cookie:owner})).json.requests[0].id;await call('/api/guest/decide',{method:'POST',cookie:owner,body:{id,approve:true,permissions}});return {id,cookie:(await call('/api/guest/poll',{method:'POST',cookie:pending,body:{}})).cookie};}
  return {call,owner,ws,guest,get audioStops(){return audioStops;},get audioOpens(){return audioOpens;}};
}
async function next(client,predicate){const end=Date.now()+2500;while(Date.now()<end){const index=client.queue.findIndex(predicate);if(index>=0)return client.queue.splice(index,1)[0];await new Promise(r=>setTimeout(r,10));}throw Error('Timed out waiting for sharing event');}
async function opened(client){if(client.readyState===WebSocket.OPEN)return;await new Promise((resolve,reject)=>{client.once('open',resolve);client.once('error',reject);});}
async function rejected(client){return new Promise((resolve,reject)=>{client.on('error',()=>{});client.once('unexpected-response',(_req,res)=>{res.resume();resolve(res.statusCode);});client.once('open',()=>reject(Error('Upgrade should be rejected')));});}
test('screen relay accepts bounded JPEG dimensions and normalized annotation coordinates only',()=>{assert.deepEqual(jpegSize(jpeg),{width:3,height:2});assert.equal(jpegSize(Buffer.from('not an image')),null);const large=Buffer.from(jpeg);large.writeUInt16BE(65000,9);assert.equal(jpegSize(large),null);assert.equal(validMark({tool:'pen',points:[{x:.1,y:.9}]}),true);assert.equal(validMark({tool:'laser',points:[{x:1.1,y:0}]}),false);assert.equal(validMark({tool:'eval',points:[]}),false);});
test('sharing rejects anonymous clients, other origins and unapproved guests',async t=>{const f=await fixture(t);assert.equal(await rejected(f.ws('')),401);assert.equal(await rejected(f.ws(f.owner,'/api/guest-screen','https://wrong.example')),403);const pending=await f.call('/api/pair',{method:'POST',body:{password:'guest'}});assert.equal(await rejected(f.ws(pending.cookie)),401);});
test('only owner watches explicit guest sharing; frames and annotation strokes stop immediately when revoked',async t=>{
  const f=await fixture(t),guest=await f.guest(),otherGuest=await f.guest(),owner=f.ws(f.owner),sender=f.ws(guest.cookie),other=f.ws(otherGuest.cookie);await Promise.all([opened(owner),opened(sender),opened(other)]);await next(owner,v=>v.type==='ready');sender.send(JSON.stringify({type:'start'}));await next(owner,v=>v.type==='shares'&&v.shares.length===1);owner.send(JSON.stringify({type:'watch',id:guest.id}));await next(owner,v=>v.type==='watching');sender.send(jpeg);assert.deepEqual(await next(owner,Buffer.isBuffer),jpeg);
  other.send(JSON.stringify({type:'watch',id:guest.id}));await new Promise(r=>setTimeout(r,25));assert.equal(other.queue.some(v=>v.type==='watching'||Buffer.isBuffer(v)),false);
  const mark={type:'mark',tool:'pen',points:[{x:.2,y:.3},{x:.4,y:.5}]};owner.send(JSON.stringify(mark));assert.deepEqual((await next(sender,v=>v.type==='mark')).points,mark.points);assert.equal(other.queue.some(v=>v.type==='mark'),false);
  owner.send(JSON.stringify({type:'watch',id:guest.id}));assert.equal((await next(owner,v=>v.type==='watching')).marks.length,1);
  const closed=new Promise(r=>sender.once('close',r));await f.call('/api/guest/revoke',{method:'POST',cookie:f.owner,body:{id:guest.id}});await closed;await next(owner,v=>v.type==='stopped');
});
test('guest stop removes the shared view and clears its annotations',async t=>{const f=await fixture(t),guest=await f.guest(),owner=f.ws(f.owner),sender=f.ws(guest.cookie);await Promise.all([opened(owner),opened(sender)]);sender.send(JSON.stringify({type:'start'}));await next(owner,v=>v.type==='shares'&&v.shares.length);owner.send(JSON.stringify({type:'watch',id:guest.id}));await next(owner,v=>v.type==='watching');sender.send(JSON.stringify({type:'stop'}));await next(owner,v=>v.type==='stopped');sender.send(JSON.stringify({type:'start'}));await next(owner,v=>v.type==='shares'&&v.shares.length);owner.send(JSON.stringify({type:'watch',id:guest.id}));assert.deepEqual((await next(owner,v=>v.type==='watching')).marks,[]);});

test('late PC viewers receive the latest live phone frame, and stopped or revoked shares retain no frame',async t=>{
  const f=await fixture(t),guest=await f.guest(),sender=f.ws(guest.cookie);await opened(sender);
  sender.send(JSON.stringify({type:'start'}));await next(sender,v=>v.type==='sharing');sender.send(jpeg);
  const owner=f.ws(f.owner);await opened(owner);await next(owner,v=>v.type==='shares'&&v.shares.length);
  owner.send(JSON.stringify({type:'watch',id:guest.id}));await next(owner,v=>v.type==='watching');assert.deepEqual(await next(owner,Buffer.isBuffer),jpeg,'no new phone frame is needed to start viewing');
  sender.send(JSON.stringify({type:'stop'}));await next(owner,v=>v.type==='stopped');sender.send(JSON.stringify({type:'start'}));await next(sender,v=>v.type==='sharing');owner.send(JSON.stringify({type:'watch',id:guest.id}));await next(owner,v=>v.type==='watching');
  await new Promise(r=>setTimeout(r,40));assert.equal(owner.queue.some(Buffer.isBuffer),false,'the old share has no cached frame');
  sender.send(jpeg);assert.deepEqual(await next(owner,Buffer.isBuffer),jpeg);await f.call('/api/guest/revoke',{method:'POST',cookie:f.owner,body:{id:guest.id}});await next(owner,v=>v.type==='stopped');
  owner.send(JSON.stringify({type:'watch',id:guest.id}));await next(owner,v=>v.type==='stopped');await new Promise(r=>setTimeout(r,30));assert.equal(owner.queue.some(Buffer.isBuffer),false,'revocation releases the cached phone image');
});
test('audio needs a selected permission and revocation releases the native capture',async t=>{const f=await fixture(t),denied=await f.guest(),allowed=await f.guest({audio:true});assert.equal(await rejected(f.ws(denied.cookie,'/api/audio')),403);assert.equal(f.audioOpens,0);const audio=f.ws(allowed.cookie,'/api/audio');await opened(audio);await next(audio,v=>v.type==='format');assert.equal((await next(audio,Buffer.isBuffer)).length,32);const closed=new Promise(r=>audio.once('close',r));await f.call('/api/guest/revoke',{method:'POST',cookie:f.owner,body:{id:allowed.id}});await closed;assert.equal(f.audioStops,1);});

test('phone input rejects invalid gestures, executable commands and oversized text',()=>{
  assert.equal(command({action:'shell',text:'anything'}),null);assert.equal(command({action:'tap',points:[{x:2,y:0}]}),null);
  assert.equal(command({action:'swipe',points:[{x:0,y:0},{x:1,y:1}],duration:5000}),null);assert.equal(command({action:'text',text:'x'.repeat(2001)}),null);
  assert.equal(command({action:'text',text:'\0'}),null);assert.deepEqual(command({action:'tap',points:[{x:.5,y:.5,ignored:'extra'}]}),{action:'tap',points:[{x:.5,y:.5}]});
});

test('phone control needs publisher consent and only its requesting PC gets ordered commands for the current display',async t=>{
  const f=await fixture(t),guest=await f.guest(),sender=f.ws(guest.cookie),owner=f.ws(f.owner),other=f.ws(f.owner);await Promise.all([opened(sender),opened(owner),opened(other)]);
  sender.send(JSON.stringify({type:'start',controlSupported:true}));await next(sender,v=>v.type==='sharing');sender.send(JSON.stringify({type:'capture',generation:1,width:1080,height:2400}));sender.send(jpeg);
  await next(owner,v=>v.type==='shares'&&v.shares.length);owner.send(JSON.stringify({type:'watch',id:guest.id}));await next(owner,v=>v.type==='watching');await next(owner,Buffer.isBuffer);
  owner.send(JSON.stringify({type:'control',id:'a'.repeat(32),seq:1,generation:1,command:{action:'home'}}));assert.equal((await next(owner,v=>v.type==='control-result')).ok,false);
  owner.send(JSON.stringify({type:'control-request'}));const request=await next(sender,v=>v.type==='control-request');assert.match(request.id,/^[a-f0-9]{32}$/);
  sender.send(JSON.stringify({type:'control-response',id:request.id,approved:true}));const active=await next(owner,v=>v.type==='control-state'&&v.state==='active');assert.equal(active.canControl,true);
  other.send(JSON.stringify({type:'watch',id:guest.id}));await next(other,v=>v.type==='watching');assert.equal((await next(other,v=>v.type==='control-state')).canControl,false);
  other.send(JSON.stringify({type:'control',id:request.id,seq:1,generation:1,command:{action:'home'}}));assert.equal((await next(other,v=>v.type==='control-result')).ok,false);
  owner.send(JSON.stringify({type:'control',id:request.id,seq:1,generation:1,command:{action:'tap',points:[{x:.2,y:.3}]}}));const input=await next(sender,v=>v.type==='control');assert.deepEqual(input.command,{action:'tap',points:[{x:.2,y:.3}]});
  sender.send(JSON.stringify({type:'control-result',id:request.id,seq:1,ok:true}));assert.equal((await next(owner,v=>v.type==='control-result'&&v.seq===1)).ok,true);
  owner.send(JSON.stringify({type:'control',id:request.id,seq:1,generation:1,command:{action:'home'}}));assert.equal((await next(owner,v=>v.type==='control-result')).ok,false,'no replay');
  sender.send(JSON.stringify({type:'capture',generation:2,width:2400,height:1080}));await next(owner,v=>v.type==='capture');owner.send(JSON.stringify({type:'control',id:request.id,seq:2,generation:1,command:{action:'home'}}));assert.equal((await next(owner,v=>v.type==='control-result')).ok,false,'rotation invalidates old coordinates');
  await new Promise(r=>setTimeout(r,85));sender.send(jpeg);await next(owner,Buffer.isBuffer);owner.send(JSON.stringify({type:'control',id:request.id,seq:2,generation:2,command:{action:'home'}}));await next(sender,v=>v.type==='control'&&v.seq===2);
  sender.send(JSON.stringify({type:'control-result',id:request.id,seq:2,ok:true}));await next(owner,v=>v.type==='control-result'&&v.seq===2);
  owner.send(JSON.stringify({type:'watch',id:''}));await next(sender,v=>v.type==='control-state'&&v.state==='off');
});

test('a phone can decline control and ending its share cancels pending approval',async t=>{
  const f=await fixture(t),guest=await f.guest(),sender=f.ws(guest.cookie),owner=f.ws(f.owner);await Promise.all([opened(sender),opened(owner)]);
  sender.send(JSON.stringify({type:'start',controlSupported:true}));await next(sender,v=>v.type==='sharing');sender.send(JSON.stringify({type:'capture',generation:1,width:1080,height:2400}));sender.send(jpeg);await next(owner,v=>v.type==='shares'&&v.shares.length);
  owner.send(JSON.stringify({type:'watch',id:guest.id}));await next(owner,v=>v.type==='watching');await next(owner,Buffer.isBuffer);owner.send(JSON.stringify({type:'control-request'}));const request=await next(sender,v=>v.type==='control-request');
  sender.send(JSON.stringify({type:'control-response',id:request.id,approved:false}));await next(owner,v=>v.type==='control-state'&&v.state==='off');
  owner.send(JSON.stringify({type:'control',id:request.id,seq:1,generation:1,command:{action:'home'}}));assert.equal((await next(owner,v=>v.type==='control-result')).ok,false);
  sender.send(JSON.stringify({type:'stop'}));await next(owner,v=>v.type==='stopped');sender.send(JSON.stringify({type:'control-response',id:request.id,approved:true}));await new Promise(r=>setTimeout(r,30));assert.equal(owner.queue.some(v=>v.type==='control-state'&&v.state==='active'),false);
});

test('an owner phone can publish and accept its PC mouse without a guest login; pointer updates do not block gestures',async t=>{
  const f=await fixture(t),phone=f.ws(f.owner),pc=f.ws(f.owner),other=f.ws(f.owner),guest=await f.guest(),outsider=f.ws(guest.cookie);
  await Promise.all([opened(phone),opened(pc),opened(other),opened(outsider)]);
  phone.send(JSON.stringify({type:'start',controlSupported:true,mouseSupported:true,device:'My phone'}));await next(phone,v=>v.type==='sharing');
  phone.send(JSON.stringify({type:'capture',generation:1,width:1080,height:2400}));phone.send(jpeg);
  const list=await next(pc,v=>v.type==='shares'&&v.shares.length);const id=list.shares[0].id;assert.match(id,/^[a-f0-9]{32}$/);assert.equal(list.shares[0].device,'My phone');
  pc.send(JSON.stringify({type:'watch',id}));await next(pc,v=>v.type==='watching');await next(pc,Buffer.isBuffer);
  outsider.send(JSON.stringify({type:'watch',id}));await new Promise(r=>setTimeout(r,20));assert.equal(outsider.queue.some(Buffer.isBuffer),false);
  pc.send(JSON.stringify({type:'control-request'}));const request=await next(phone,v=>v.type==='control-request');phone.send(JSON.stringify({type:'control-response',id:request.id,approved:true}));
  assert.equal((await next(pc,v=>v.type==='control-state'&&v.state==='active')).mouseSupported,true);
  const input=(type,seq,command,generation=1)=>({type,id:request.id,seq,generation,command});
  pc.send(JSON.stringify(input('control',1,{action:'tap',points:[{x:.5,y:.5}]})));await next(phone,v=>v.type==='control');
  pc.send(JSON.stringify(input('pointer',2,{action:'pointer',points:[{x:.3,y:.7}]})));assert.equal((await next(phone,v=>v.type==='pointer')).seq,2,'cursor remains responsive while Android is tapping');
  phone.send(JSON.stringify({type:'control-result',id:request.id,seq:1,ok:true}));assert.equal((await next(pc,v=>v.type==='control-result'&&v.seq===1)).ok,true);
  other.send(JSON.stringify({type:'watch',id}));await next(other,v=>v.type==='watching');other.send(JSON.stringify(input('pointer',3,{action:'pointer',points:[{x:.9,y:.1}]})));assert.equal((await next(other,v=>v.type==='control-result')).ok,false);
  pc.send(JSON.stringify(input('pointer',2,{action:'pointer',points:[{x:.9,y:.1}]})));assert.equal((await next(pc,v=>v.type==='control-result'&&v.seq===2)).ok,false,'replayed cursor cannot move the phone');
  pc.send(JSON.stringify(input('pointer',3,{action:'pointer',points:[{x:.9,y:.1}]},2)));assert.equal((await next(pc,v=>v.type==='control-result'&&v.seq===3)).ok,false,'stale capture dimensions cannot move the cursor');
  pc.send(JSON.stringify(input('pointer',3,{action:'hide-pointer'})));assert.equal((await next(phone,v=>v.type==='pointer'&&v.seq===3)).command.action,'hide-pointer');
  phone.send(JSON.stringify({type:'control-stop'}));await next(pc,v=>v.type==='control-state'&&v.state==='off');
  pc.send(JSON.stringify(input('pointer',4,{action:'pointer',points:[{x:.1,y:.1}]})));assert.equal((await next(pc,v=>v.type==='control-result'&&v.seq===4)).ok,false);
});

test('desktop mouse requires the approved PC, receives rotation dimensions and releases on a lost phone connection',async t=>{
  let native=null,stops=0,lastDimensions=null;
  const f=await fixture(t,{openPhoneInput:options=>{native=options;return {stop(){stops++},release(){},update(value){lastDimensions=value}}}}),phone=f.ws(f.owner),pc=f.ws(f.owner),other=f.ws(f.owner);
  await Promise.all([opened(phone),opened(pc),opened(other)]);
  const key='b'.repeat(32),clientKey='c'.repeat(32),proof='d'.repeat(32);
  phone.send(JSON.stringify({type:'start',shareKey:key,controlSupported:true,mouseSupported:true,advancedInput:true}));await next(phone,v=>v.type==='sharing');phone.send(JSON.stringify({type:'capture',generation:1,width:1080,height:2400}));phone.send(jpeg);
  const id=(await next(pc,v=>v.type==='shares'&&v.shares.length)).shares[0].id;pc.send(JSON.stringify({type:'watch',id}));await next(pc,v=>v.type==='watching');await next(pc,Buffer.isBuffer);
  pc.send(JSON.stringify({type:'desktop-start',side:'right',sensitivity:1}));await next(pc,v=>v.type==='desktop-state'&&v.state==='off');assert.equal(native,null);
  pc.send(JSON.stringify({type:'control-request',clientKey}));const request=await next(phone,v=>v.type==='control-request');assert.equal(request.clientKey,clientKey);
  phone.send(JSON.stringify({type:'control-response',id:request.id,approved:true,resumeProof:proof,expiresIn:120000}));const active=await next(pc,v=>v.type==='control-state'&&v.state==='active');assert.equal(active.resumeProof,proof);assert.ok(active.expiresIn<=120000);
  other.send(JSON.stringify({type:'watch',id}));await next(other,v=>v.type==='watching');const unapproved=await next(other,v=>v.type==='control-state');assert.equal(unapproved.resumeProof,undefined);
  other.send(JSON.stringify({type:'desktop-start',side:'right',sensitivity:1}));await next(other,v=>v.type==='desktop-state');assert.equal(native,null);
  pc.send(JSON.stringify({type:'desktop-start',side:'left',sensitivity:1.2}));await next(pc,v=>v.type==='desktop-state'&&v.state==='armed');assert.equal(native.width,1080);assert.equal(native.side,'left');
  native.onEvent({kind:'text',text:'fixture'});assert.equal((await next(pc,v=>v.type==='desktop-input')).event.text,'fixture');
  phone.send(JSON.stringify({type:'capture',generation:2,width:2400,height:1080}));await next(pc,v=>v.type==='capture');assert.equal(lastDimensions.width,2400);
  phone.terminate();assert.equal((await next(pc,v=>v.type==='stopped')).reconnect,true);assert.equal(stops,1);
  const rejoined=f.ws(f.owner);await opened(rejoined);rejoined.send(JSON.stringify({type:'start',shareKey:key,controlSupported:true,mouseSupported:true,advancedInput:true}));await next(rejoined,v=>v.type==='sharing');rejoined.send(JSON.stringify({type:'capture',generation:2,width:2400,height:1080}));rejoined.send(jpeg);
  assert.equal((await next(pc,v=>v.type==='shares'&&v.shares.length)).shares[0].id,id,'the same projection keeps its identity');
  pc.send(JSON.stringify({type:'watch',id}));await next(pc,v=>v.type==='watching');await next(pc,Buffer.isBuffer);pc.send(JSON.stringify({type:'control-request',clientKey,resumeProof:proof}));assert.equal((await next(rejoined,v=>v.type==='control-request')).resumeProof,proof,'only the phone can approve the previous session proof');
});

test('phone file drop delivers original names to only the selected registered owner device',async t=>{
  const f=await fixture(t),target='phone-device-0123456789';
  await f.call('/api/sync/register',{method:'POST',cookie:f.owner,body:{id:target,name:'Fixture phone',platform:'android'}});
  const phone=f.ws(f.owner);await opened(phone);phone.send(JSON.stringify({type:'start',deviceId:target}));await next(phone,v=>v.type==='sharing');
  const name='Photo + résumé.png',upload=await f.call('/api/files/uploads',{method:'POST',cookie:f.owner,body:{name,relativePath:'Phone drops/fixture/'+name,size:0}});assert.equal(upload.status,200);
  const body={target,names:[upload.json.file.name],group:'a'.repeat(32)};
  const delivered=await f.call('/api/phone/files',{method:'POST',cookie:f.owner,body});assert.equal(delivered.status,200);assert.equal(delivered.json.receiving,true);
  const offer=(await next(phone,v=>v.type==='file-offer')).offers[0];assert.equal(offer.name,name);assert.equal(offer.size,0);assert.match(offer.path,/^\/api\/files\/download\?name=/);
  const inbox=await f.call('/api/phone/inbox',{cookie:f.owner});assert.equal(inbox.status,200);assert.equal(inbox.json.inbox[0].id,offer.id);assert.equal(inbox.json.clipboard,undefined,'file receiving does not fetch clipboard contents');
  assert.equal((await f.call('/api/phone/files',{method:'POST',cookie:f.owner,body:{...body,names:['../outside.txt']}})).status,400);
  const guest=await f.guest();assert.equal((await f.call('/api/phone/files',{method:'POST',cookie:guest.cookie,body})).status,403);
});
