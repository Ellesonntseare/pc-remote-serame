'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{JSDOM}=require('jsdom');
test('the redesigned login preserves password visibility, PIN mode, failure feedback and original authentication payloads',async t=>{
 const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8'),form=html.match(/<form id="pairForm"[\s\S]*?<\/form>/)[0],dom=new JSDOM('<body>'+form+'</body>',{url:'https://pc.test',runScripts:'outside-only'}),w=dom.window;t.after(()=>w.close());
 const lines=html.split(/\r?\n/),calls=[];let reply={ok:false,error:'Wrong password'},initialized=0;w.api=async(route,options)=>{calls.push({route,body:JSON.parse(options.body)});return reply;};w.init=()=>initialized++;
 w.eval("const $=id=>document.getElementById(id);let passwordMode=true;"+lines.filter(line=>line.startsWith('function concealPassword')||line.startsWith("$('passwordPeek').addEventListener")||line.startsWith('function configureLogin')||line.startsWith("$('pairForm').addEventListener")).join('\n'));
 const q=id=>w.document.getElementById(id),submit=async()=>{q('pairForm').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));assert.equal(q('pairSubmit').disabled,true);await new Promise(setImmediate);};
 w.configureLogin({requirePassword:true});q('pin').value='test password';q('rememberMe').checked=false;q('passwordPeek').click();assert.equal(q('pin').type,'text');q('passwordPeek').click();assert.equal(q('pin').type,'password');await submit();assert.deepEqual(calls.at(-1).body,{password:'test password',remember:false});assert.equal(q('pairError').textContent,'Wrong password');assert.equal(q('pairSubmit').disabled,false);assert.equal(initialized,0);
 reply={ok:true};await submit();assert.equal(q('pin').value,'');assert.equal(initialized,1);
 w.configureLogin({requirePassword:false});assert.equal(q('rememberChoice').hidden,true);assert.equal(q('passwordPeek').hidden,true);assert.equal(q('pin').maxLength,8);q('pin').value='12345678';await submit();assert.deepEqual(calls.at(-1).body,{pin:'12345678'});
});
