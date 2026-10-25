'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{JSDOM}=require('jsdom');
test('Create account uses Google; a new profile moves to PC linking and sign-out restores the login page',async t=>{
 const dom=new JSDOM('<form id="pairForm"><h1 id="loginTitle"></h1><p id="loginDescription"></p><label id="loginLabel"></label><div class="passwordField"><input id="pin"></div><label id="rememberChoice"><input type="checkbox" id="rememberMe" checked></label><button id="pairSubmit"></button><p id="pairError"></p></form>',{url:'https://remote.example',runScripts:'outside-only'});t.after(()=>dom.window.close());const w=dom.window,messages=[],requests=[];
 w.PCRAndroid={postMessage:value=>messages.push(JSON.parse(value))};w.PCRAuth={signedIn:false};
 w.init=()=>{w.dispatchEvent(new w.Event('pcr:auth'));w.PCRAccount={id:'new-account',email:'customer@gmail.com',newAccount:true};w.dispatchEvent(new w.CustomEvent('pcr:account',{detail:w.PCRAccount}));};
 w.unpair=()=>{w.PCRAccount=null;w.dispatchEvent(new w.Event('pcr:auth'));};
 w.fetch=async(route,options)=>{requests.push({route,body:JSON.parse(options.body)});return {ok:true,json:async()=>route.endsWith('/start')?{id:'ticket',secret:'app-secret',url:'https://remote.example/api/auth/google/browser?ticket=ticket',expires:Date.now()+60000}:{ok:true}};};
 w.eval(fs.readFileSync(path.join(__dirname,'../public/google-signin.js'),'utf8'));await new Promise(r=>w.addEventListener('load',r,{once:true}));const doc=w.document;
 doc.querySelector('[data-account-mode=signup]').click();assert.equal(doc.querySelector('[data-google-signin]').textContent,'Sign up with Google');assert.equal(doc.getElementById('loginTitle').textContent,'Create your account.');assert.equal(w.getComputedStyle(doc.querySelector('.passwordField')).display,'none');
 doc.querySelector('[data-google-signin]').click();for(let i=0;i<10&&!w.PCRAccount;i++)await new Promise(r=>setTimeout(r,5));
 assert.equal(messages[0].type,'open-link');assert.equal(requests[0].body.device,true);assert.equal(requests[0].body.remember,true);assert.equal(doc.querySelector('.googleAccountReady').hidden,false);assert.equal(doc.querySelector('[data-account-email]').textContent,'customer@gmail.com');assert.equal(doc.querySelector('.googleAccountReady strong').textContent,'Account created');assert.equal(doc.getElementById('loginLabel').textContent,'PC password');assert.equal(doc.querySelector('.googleSignIn').hidden,true);
 doc.querySelector('.googleAccountReady button').click();assert.equal(doc.querySelector('.googleAccountReady').hidden,true);assert.equal(doc.querySelector('.googleSignIn').hidden,false);assert.equal(doc.querySelector('[data-google-signin]').textContent,'Sign in with Google');
});
