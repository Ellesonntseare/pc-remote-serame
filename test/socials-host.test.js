'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createApp}=require('../server');
function call(port,route,method='GET',body,cookie){return new Promise((resolve,reject)=>{const req=http.request({host:'127.0.0.1',port,path:route,method,headers:{'X-PCR':'1',...(cookie?{Cookie:cookie}:{}),...(method!=='GET'?{Origin:'http://127.0.0.1:'+port,'Content-Type':'application/json'}:{})}},res=>{let text='';res.on('data',c=>text+=c);res.on('end',()=>{let data;try{data=JSON.parse(text);}catch{data=text;}resolve({status:res.statusCode,headers:res.headers,data});});});req.on('error',reject);if(body)req.write(JSON.stringify(body));req.end();});}
test('Projects and Socials use Connect authentication and the same HTTP server',async()=>{
 const directory=process.env.ELLESON_SOCIALS_TEST_DIRECTORY;if(!directory)return;
 const data=fs.mkdtempSync(path.join(os.tmpdir(),'connect-socials-'));
 const app=createApp({port:0,pin:'12345678',disableAgent:true,disableActions:true,socialsDirectory:directory,socialsDataDirectory:data});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));const port=app.server.address().port;
 try{
  const back=await call(port,'/socials/connect/facebook?code=not-a-token&state=untrusted');assert.equal(back.status,200);assert.match(back.data,/socials-return.js/);assert.ok(!back.data.includes('not-a-token'));assert.equal(back.headers['referrer-policy'],'no-referrer');
  assert.equal((await call(port,'/api/projects')).status,401);assert.equal((await call(port,'/socials/api/posts')).status,401);
  const paired=await call(port,'/api/pair','POST',{pin:'12345678'}),cookie=paired.headers['set-cookie'][0].split(';')[0];
  const projects=await call(port,'/api/projects','GET',undefined,cookie);assert.equal(projects.status,200);assert.equal(projects.data.projects[0].available,true);
  const session=await call(port,'/socials/api/session','GET',undefined,cookie);assert.equal(session.status,200,JSON.stringify(session.data));assert.equal(session.data.user.role,'admin');
  const queue=await call(port,'/socials/api/queue','GET',undefined,cookie);assert.equal(queue.status,200);assert.equal(queue.data.scheduler.enabled,true);assert.ok(Array.isArray(queue.data.jobs));
  const posts=await call(port,'/socials/api/posts','GET',undefined,cookie);assert.equal(posts.data.length,65);
  const page=await call(port,'/socials/','GET',undefined,cookie);assert.equal(page.status,200);assert.match(page.data,/name="api-base" content="\/socials\/api\/"/);
  assert.equal((await call(port,'/socials/api/activity','GET',undefined,cookie)).data.length,100);
 }finally{await new Promise(r=>app.server.close(r));const resolved=path.resolve(data);assert.ok(resolved.startsWith(path.resolve(os.tmpdir())+path.sep+'connect-socials-'));fs.rmSync(resolved,{recursive:true,force:true});}
});
test('Projects accurately reports a missing standalone installation',async()=>{
 const app=createApp({port:0,pin:'12345678',disableAgent:true,disableActions:true});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));const port=app.server.address().port;
 try{const paired=await call(port,'/api/pair','POST',{pin:'12345678'}),cookie=paired.headers['set-cookie'][0].split(';')[0];const response=await call(port,'/api/projects','GET',undefined,cookie);assert.equal(response.status,200);assert.equal(response.data.projects[0].available,false);assert.equal((await call(port,'/socials/api/posts','GET',undefined,cookie)).status,503);}finally{await new Promise(r=>app.server.close(r));}
});
