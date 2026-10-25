'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),http=require('node:http'),{createGoogleSignIn}=require('../google-signin'),{createApp}=require('../server');
const config={origin:'https://remote.example',clientId:'test.apps.googleusercontent.com',clientSecret:'test-only',allowedEmails:['owner@gmail.com']};
function identity(nonce,extra={}){return {sub:'google-account-id',iss:'https://accounts.google.com',aud:config.clientId,exp:Date.now()/1000+3600,nonce,email:'owner@gmail.com',email_verified:true,...extra};}
function fixture(extra={}){let claims;const google=createGoogleSignIn(config,{verify:async(code,verifier)=>{assert.equal(code,'code');assert.match(verifier,/^[A-Za-z0-9_-]{43}$/);return claims;},...extra});const ticket=google.start({device:true,ip:'phone',remember:true}),browser=google.browser(ticket.id),url=new URL(browser.url);claims=identity(url.searchParams.get('nonce'));return {google,ticket,browser,url,setClaims:v=>{claims=v;},callback:()=>google.callback({id:ticket.id,code:'code',cookie:browser.cookie})};}

test('Google app handoff uses PKCE and returns a single-use app session identity only to the initiating phone',async()=>{
  const f=fixture();assert.equal(f.url.searchParams.get('scope'),'openid email');assert.equal(f.url.searchParams.get('code_challenge_method'),'S256');assert.notEqual(f.url.searchParams.get('code_challenge'),f.ticket.secret);
  assert.throws(()=>f.google.browser(f.ticket.id),/already opened/);assert.deepEqual(f.google.poll({...f.ticket,ip:'phone'}),{pending:true});
  await assert.rejects(f.google.callback({id:f.ticket.id,code:'code',cookie:'wrong'}),/could not be verified/);
  assert.deepEqual(await f.callback(),{device:true});assert.throws(()=>f.google.poll({...f.ticket,ip:'other-phone'}),/Invalid/);assert.throws(()=>f.google.poll({...f.ticket,secret:'wrong',ip:'phone'}),/Invalid/);
  const result=f.google.poll({...f.ticket,ip:'phone'});assert.equal(result.identity.subject,'google-account-id');assert.equal(result.remember,true);assert.throws(()=>f.google.poll({...f.ticket,ip:'phone'}),/expired/);
});

test('Google accepts new verified users and rejects unverified email, wrong issuer/audience/nonce and expired tokens',async()=>{
  const newcomer=fixture();newcomer.setClaims(identity(newcomer.url.searchParams.get('nonce'),{email:'new-person@gmail.com'}));await newcomer.callback();assert.equal(newcomer.google.poll({...newcomer.ticket,ip:'phone'}).identity.email,'new-person@gmail.com');
  for(const change of [{email_verified:false},{iss:'https://evil.example'},{aud:'other-client'},{nonce:'wrong'},{exp:1}]){const f=fixture();f.setClaims(identity(f.url.searchParams.get('nonce'),change));await assert.rejects(f.callback(),/could not verify/);assert.throws(()=>f.google.poll({...f.ticket,ip:'phone'}),/cancelled|not approved/);}
});

test('Google denies expired transactions, disabled configuration and provider failures without exposing secrets',async()=>{
  assert.throws(()=>createGoogleSignIn().start({}),/not enabled/);let now=Date.now();const f=fixture({now:()=>now});now+=6*60*1000;await assert.rejects(f.callback(),/expired/);
  const g=fixture({verify:async()=>{throw Error('client_secret=PRIVATE');}});await assert.rejects(g.callback(),error=>error.status===502&&!error.message.includes('PRIVATE'));
});

function request(port,route,{method='GET',body,headers={}}={}){return new Promise((resolve,reject)=>{const req=http.request({hostname:'127.0.0.1',port,path:route,method,headers:{'X-PCR':'1',...headers}},res=>{const chunks=[];res.on('data',c=>chunks.push(c));res.on('end',()=>{const text=Buffer.concat(chunks).toString();let json;try{json=JSON.parse(text);}catch{}resolve({status:res.statusCode,headers:res.headers,json,text});});});req.on('error',reject);req.end(body?JSON.stringify(body):undefined);});}
test('Google callback authenticates the Android requester over local HTTP without sending Google tokens to its WebView',async t=>{
  let claims;const app=createApp({password:'test-owner',disableAgent:true,disableActions:true,tunnelHostname:'remote.example',allowLan:true,googleSignIn:config,googleDependencies:{verify:async()=>claims}});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));const port=app.server.address().port;t.after(async()=>{app.stop();await new Promise(r=>app.server.close(r));});
  const start=await request(port,'/api/auth/google/start',{method:'POST',body:{device:true,remember:false}});assert.equal(start.status,200);
  const headers={Host:'remote.example'},browser=await request(port,new URL(start.json.url).pathname+new URL(start.json.url).search,{headers});assert.equal(browser.status,303);assert.match(browser.headers['set-cookie'][0],/HttpOnly; Secure; SameSite=Lax/);
  const url=new URL(browser.headers.location);claims=identity(url.searchParams.get('nonce'));const callback=await request(port,'/api/auth/google/callback?state='+url.searchParams.get('state')+'&code=code',{headers:{...headers,Cookie:browser.headers['set-cookie'][0].split(';')[0]}});assert.equal(callback.status,200);assert.match(callback.text,/Return to the PC Remote app/);
  const poll=await request(port,'/api/auth/google/poll',{method:'POST',body:{id:start.json.id,secret:start.json.secret}});assert.equal(poll.status,200);assert.deepEqual(poll.json,{ok:true});assert.doesNotMatch(poll.headers['set-cookie'][0],/Secure|Max-Age/);
  const session=await request(port,'/api/session',{headers:{Cookie:poll.headers['set-cookie'][0].split(';')[0]}});assert.equal(session.json.role,'owner');assert.equal((await request(port,'/api/auth/google/poll',{method:'POST',body:{id:start.json.id,secret:start.json.secret}})).status,410);
});
