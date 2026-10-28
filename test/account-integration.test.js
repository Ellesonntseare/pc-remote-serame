'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {createApp}=require('../server');
function request(port,route,{method='GET',body,headers={}}={}){return new Promise((resolve,reject)=>{const req=http.request({hostname:'127.0.0.1',port,path:route,method,headers:{'X-PCR':'1',...headers}},res=>{let text='';res.setEncoding('utf8');res.on('data',part=>text+=part);res.on('end',()=>{let json;try{json=JSON.parse(text);}catch{}resolve({status:res.statusCode,headers:res.headers,json});});});req.on('error',reject);req.end(body?JSON.stringify(body):undefined);});}
async function fixture(t){
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'pcr-account-integration-')),config={origin:'https://remote.example',clientId:'test-client',clientSecret:'test-only',ownerEmails:['owner@example.test']};let app,port,claims,clipboard='';
  async function start(){app=createApp({password:'workspace-check-only',disableAgent:true,disableActions:true,tunnelHostname:'remote.example',allowLan:true,googleSignIn:config,googleDependencies:{verify:async()=>claims},sessionFile:path.join(root,'sessions.json'),accountFile:path.join(root,'accounts.json'),workspaceFile:path.join(root,'workspace.sqlite'),syncFile:path.join(root,'sync.json'),transferDirectory:path.join(root,'Transfers'),clipboardProvider:{get:async()=>clipboard,set:async text=>clipboard=text}});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));port=app.server.address().port;}
  async function stop(){app.stop();await new Promise(r=>app.server.close(r));}await start();t.after(async()=>{await stop();assert.equal(path.dirname(root),os.tmpdir());assert.ok(path.basename(root).startsWith('pcr-account-integration-'));await fs.rm(root,{recursive:true,force:true});});
  const call=(cookie,route,body,extraHeaders={})=>request(port,route,{headers:{Cookie:cookie,...extraHeaders},...(body?{method:'POST',body}:{})});
  return{call,restart:async()=>{await stop();await start();},async local(cookie=''){const response=await call(cookie,'/api/pair',{password:'workspace-check-only',remember:true});assert.equal(response.status,200);return response.headers['set-cookie'][0].split(';')[0];},async google(email){const begin=await request(port,'/api/auth/google/start',{method:'POST',body:{device:true,remember:true}});const ticket=begin.json;assert.equal(begin.status,200);const browser=await request(port,'/api/auth/google/browser?ticket='+ticket.id,{headers:{Host:'remote.example'}});assert.equal(browser.status,303);const url=new URL(browser.headers.location);claims={iss:'https://accounts.google.com',aud:config.clientId,exp:Date.now()/1000+3600,nonce:url.searchParams.get('nonce'),sub:'subject-'+email,email,email_verified:true};const callback=await request(port,'/api/auth/google/callback?state='+ticket.id+'&code=test-code',{headers:{Host:'remote.example',Cookie:browser.headers['set-cookie'][0].split(';')[0]}});assert.equal(callback.status,200);const result=await request(port,'/api/auth/google/poll',{method:'POST',body:{id:ticket.id,secret:ticket.secret}});assert.equal(result.status,200);return result.headers['set-cookie'][0].split(';')[0];}};
}
test('Google and password owners share durable history/preferences, and other accounts remain separate',async t=>{
  const f=await fixture(t),local=await f.local(),google=await f.google('owner@example.test');assert.equal((await f.call(local,'/api/session')).json.workspaceId,'owner');assert.equal((await f.call(google,'/api/session')).json.workspaceId,'owner');const summary=(await f.call(local,'/api/sessions?summary=1')).json;assert.equal(summary.online,2);assert.equal(summary.accounts,1);
  assert.equal((await f.call(local,'/api/workspace',{changes:{'files.favourites':['@downloads','@pictures'],'files.view':'details'}})).status,200);const mirrored=(await f.call(google,'/api/workspace')).json;assert.deepEqual(mirrored.values['files.favourites'].value,['@downloads','@pictures']);assert.equal(mirrored.values['files.view'].value,'details');
  const text='Shared account copied text '+('long content '.repeat(100));assert.equal((await f.call(local,'/api/clipboard',{text})).status,200);const history=(await f.call(google,'/api/history?type=clipboard')).json;assert.equal(history.events.length,1);assert.ok(history.events[0].textLength>240);assert.equal((await f.call(google,'/api/history/'+encodeURIComponent(history.events[0].id))).json.event.text,text);
  const other=await f.google('other@example.test');assert.deepEqual((await f.call(other,'/api/workspace')).json.values,{});assert.equal((await f.call(other,'/api/history?type=clipboard')).json.events.length,0);assert.equal((await f.call(other,'/api/history/'+encodeURIComponent(history.events[0].id))).status,404);assert.equal((await f.call(local,'/api/workspace',{changes:{'auth.cookie':'should-stay-local'}})).status,400);
  await f.restart();assert.equal((await f.call(google,'/api/workspace')).json.values['files.view'].value,'details');assert.equal((await f.call(local,'/api/history?type=clipboard')).json.events.length,1);
});
test('settings, device inventories and shared deliveries follow the account rather than the session',async t=>{
  const f=await fixture(t),local=await f.local(),google=await f.google('owner@example.test'),other=await f.local(await f.google('other@example.test'));
  for(const [cookie,suffix]of [[local,'local'],[google,'google'],[other,'other']])assert.equal((await f.call(cookie,'/api/sync/register',{id:'device-account-'+suffix,name:suffix,platform:'browser'})).status,200);
  await f.call(local,'/api/sync/settings',{values:{pcr_appearance_v1:'light'}});assert.equal((await f.call(google,'/api/sync/state')).json.settings.pcr_appearance_v1,'light');assert.equal((await f.call(other,'/api/sync/state')).json.settings.pcr_appearance_v1,undefined);assert.equal((await f.call(local,'/api/sync/devices')).json.devices.length,2);assert.equal((await f.call(other,'/api/sync/devices')).json.devices.length,1);
  await f.call(local,'/api/sync/send',{text:'https://example.test/shared',target:'*'});assert.equal((await f.call(google,'/api/sync/state')).json.inbox.length,1);assert.equal((await f.call(other,'/api/sync/state')).json.inbox.length,0);
  const event={id:'phone-event-1',action:'camera.started',label:'Phone camera started',payload:{source:'phone'}};await f.call(local,'/api/history/events',{events:[event]});await f.call(google,'/api/history/events',{events:[event]});assert.equal((await f.call(local,'/api/history?type=camera')).json.events.length,1);
});

test('workspace conflicts are explicit and incremental waiting wakes only for the same account',async t=>{
  const f=await fixture(t),local=await f.local(),google=await f.google('owner@example.test'),other=await f.google('other@example.test');
  const first=(await f.call(local,'/api/workspace',{changes:{'files.view':'details'},expected:{'files.view':0}})).json;
  assert.equal(first.values['files.view'].revision,1);
  const historyAfter=(await f.call(local,'/api/workspace')).json.historyRevision;const waiting=f.call(google,'/api/workspace?after=1&historyAfter='+historyAfter+'&wait=1500');
  await f.call(other,'/api/workspace',{changes:{'files.view':'icons'}});
  await f.call(local,'/api/workspace',{changes:{'files.view':'icons'},expected:{'files.view':1}});
  const result=await waiting;assert.equal(result.status,200);assert.equal(result.json.values['files.view'].value,'icons');
  const conflict=await f.call(google,'/api/workspace',{changes:{'files.view':'details','files.favourites':['@downloads']},expected:{'files.view':1,'files.favourites':0}});
  assert.equal(conflict.status,409);assert.equal(conflict.json.conflicts['files.view'].value,'icons');assert.equal((await f.call(local,'/api/workspace')).json.values['files.favourites'],undefined);
});

test('saved text migration retains original time and is idempotent, and event batches reject invalid records atomically',async t=>{
  const f=await fixture(t),local=await f.local(),time=1700000000000,items=[{text:'An older pinned snippet',source:'Phone',time}];
  const first=await f.call(local,'/api/history/import',{items}),second=await f.call(local,'/api/history/import',{items});assert.deepEqual(first.json.accepted,second.json.accepted);
  const entry=(await f.call(local,'/api/history/'+encodeURIComponent(first.json.accepted[0].id))).json.event;assert.equal(entry.time,time);assert.equal(entry.text,items[0].text);
  const before=(await f.call(local,'/api/history')).json.eventCount;
  const result=await f.call(local,'/api/history/events',{events:[{id:'valid-first',action:'audio.started',label:'Audio'},{id:'invalid-last',action:'input.replay',label:'Must not run'}]});
  assert.equal(result.status,400);assert.equal((await f.call(local,'/api/history')).json.eventCount,before);
});

test('a stale tab cannot write its previous account state through a different account cookie',async t=>{
 const f=await fixture(t),owner=await f.local(),other=await f.google('other@example.test');const blocked=await f.call(other,'/api/workspace',{changes:{'drafts.compose':'Previous account text'}},{'X-PCR-Account':'owner'});assert.equal(blocked.status,409);assert.equal(blocked.json.accountChanged,true);assert.deepEqual((await f.call(other,'/api/workspace')).json.values,{});assert.equal((await f.call(owner,'/api/workspace',{changes:{'files.view':'details'}},{'X-PCR-Account':'owner'})).status,200);
});
