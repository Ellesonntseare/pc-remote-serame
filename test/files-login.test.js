'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const {createApp}=require('../server');
function request(port,route,{method='GET',body,raw=false,cookie,headers={}}={}){
  const data=body===undefined?undefined:raw?body:Buffer.from(JSON.stringify(body));
  return new Promise((resolve,reject)=>{
    const req=http.request({hostname:'127.0.0.1',port,path:route,method,headers:{'X-PCR':'1',...cookie&&{Cookie:cookie},...data&&{'Content-Length':data.length},...headers}},res=>{const chunks=[];res.on('data',c=>chunks.push(c));res.on('end',()=>{const bytes=Buffer.concat(chunks);let json;try{json=JSON.parse(bytes);}catch{}resolve({status:res.statusCode,headers:res.headers,bytes,json});});});req.on('error',reject);req.end(data);
  });
}
async function fixture(t,extra={}){
  const root=await fs.mkdtemp(path.join(__dirname,'.transfer-check-'));let app,port;
  async function start(){app=createApp({port:0,disableAgent:true,disableActions:true,password:'serame',sessionFile:path.join(root,'sessions.json'),transferDirectory:path.join(root,'files'),maxFileBytes:6*1024*1024,...extra});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));port=app.server.address().port;}
  async function stop(){app.stop();await new Promise(r=>app.server.close(r));}
  await start();t.after(async()=>{await stop();const absolute=path.resolve(root);assert.equal(path.dirname(absolute),__dirname);assert.ok(path.basename(absolute).startsWith('.transfer-check-'));await fs.rm(absolute,{recursive:true,force:true});});
  const f={get port(){return port;},root,request:(route,options)=>request(port,route,options),async restart(){await stop();await start();},async login(remember=false){const r=await request(port,'/api/pair',{method:'POST',body:{password:'serame',remember}});assert.equal(r.status,200);return r.headers['set-cookie'][0].split(';')[0];}};return f;
}
async function upload(f,cookie,name,bytes){
  const created=await f.request('/api/files/uploads',{method:'POST',cookie,body:{name,size:bytes.length}});assert.equal(created.status,200);let response=created;
  for(let offset=0;offset<bytes.length;offset+=created.json.chunkBytes){response=await f.request('/api/files/uploads/'+created.json.id+'?offset='+offset,{method:'PUT',cookie,body:bytes.subarray(offset,offset+created.json.chunkBytes),raw:true});assert.equal(response.status,200);}
  assert.equal(response.json.complete,true);return response.json.file;
}
test('password login is required and unchecked Remember me uses a browser-session cookie',async t=>{
  const f=await fixture(t);assert.equal((await f.request('/api/ping')).json.requirePassword,true);
  assert.equal((await f.request('/api/status')).status,401);assert.equal((await f.request('/api/files')).status,401);
  for(const body of [{},{password:'wrong'},{pin:'serame'}])assert.equal((await f.request('/api/pair',{method:'POST',body})).status,401);
  const correct=await f.request('/api/pair',{method:'POST',body:{password:'serame',remember:false}});assert.equal(correct.status,200);assert.match(correct.headers['set-cookie'][0],/HttpOnly/);assert.doesNotMatch(correct.headers['set-cookie'][0],/Max-Age/);
  const cookie=correct.headers['set-cookie'][0].split(';')[0];assert.equal((await f.request('/api/status',{cookie})).status,200);await f.restart();assert.equal((await f.request('/api/status',{cookie})).status,401);
});

test('direct LAN uploads negotiate larger chunks while the tunnel retains its smaller bound and exact resume position',async t=>{
  const f=await fixture(t,{tunnelHostname:'remote.example',allowLan:true,maxFileBytes:20*1024*1024}),cookie=await f.login(),cloudHeaders={Host:'remote.example'},content=crypto.randomBytes(9*1024*1024+31);
  const u=(await f.request('/api/files/uploads',{method:'POST',cookie,body:{name:'large-local.bin',size:content.length}})).json;assert.equal(u.chunkBytes,8*1024*1024);
  const first=await f.request('/api/files/uploads/'+u.id+'?offset=0',{method:'PUT',cookie,raw:true,body:content.subarray(0,u.chunkBytes)});assert.equal(first.status,200);assert.equal(first.json.received,u.chunkBytes);
  const resumed=await f.request('/api/files/uploads/'+u.id+'/resume',{method:'POST',cookie,body:{resumeSecret:u.resumeSecret},headers:cloudHeaders});assert.equal(resumed.status,200);assert.equal(resumed.json.received,u.chunkBytes);assert.equal(resumed.json.chunkBytes,1024*1024);
  const oversized=await f.request('/api/files/uploads/'+u.id+'?offset='+u.chunkBytes,{method:'PUT',cookie,raw:true,headers:cloudHeaders,body:content.subarray(u.chunkBytes)});assert.equal(oversized.status,413);
  for(let offset=u.chunkBytes;offset<content.length;offset+=resumed.json.chunkBytes){const r=await f.request('/api/files/uploads/'+u.id+'?offset='+offset,{method:'PUT',cookie,raw:true,headers:cloudHeaders,body:content.subarray(offset,offset+resumed.json.chunkBytes)});assert.equal(r.status,200);}
  const downloaded=await f.request('/api/files/download?name=large-local.bin',{cookie});assert.deepEqual(downloaded.bytes,content);
});
test('remembered login survives a host restart, stores only a token hash, and logout revokes it',async t=>{
  const f=await fixture(t),cookie=await f.login(true),stored=await fs.readFile(path.join(f.root,'sessions.json'),'utf8');
  assert.doesNotMatch(stored,/serame/);assert.ok(!stored.includes(cookie.split('=')[1]));
  const record=JSON.parse(stored);assert.equal(record[0][0],crypto.createHash('sha256').update(cookie.split('=')[1]).digest('hex'));
  await f.restart();assert.equal((await f.request('/api/status',{cookie})).status,200);
  assert.equal((await f.request('/api/unpair',{method:'POST',body:{},cookie})).status,200);await f.restart();assert.equal((await f.request('/api/status',{cookie})).status,401);
});
test('arbitrary binary files, multi-chunk audio, empty PDFs and Unicode text round-trip byte for byte',async t=>{
  const f=await fixture(t),cookie=await f.login();
  for(const [name,bytes] of [['audio.mp3',crypto.randomBytes(2*1024*1024+139)],['empty.pdf',Buffer.alloc(0)],['Notes 世界.txt',Buffer.from('Hello\n😀\nمرحبا','utf8')],['arbitrary.custom-extension',crypto.randomBytes(371)]]){
    const file=await upload(f,cookie,name,bytes);assert.equal(file.name,name);const download=await f.request('/api/files/download?name='+encodeURIComponent(file.name),{cookie});assert.equal(download.status,200);assert.deepEqual(download.bytes,bytes);assert.match(download.headers['content-disposition'],/^attachment;/);assert.equal(download.headers['content-type'],'application/octet-stream');
  }
  const list=await f.request('/api/files',{cookie});assert.equal(list.json.total,4);assert.equal(list.json.maxBytes,6*1024*1024);assert.ok(list.json.files.every(file=>!file.name.startsWith('.')));
});
test('duplicate filenames preserve previous files instead of overwriting them',async t=>{
  const f=await fixture(t),cookie=await f.login();const a=await upload(f,cookie,'note.txt',Buffer.from('first')),b=await upload(f,cookie,'note.txt',Buffer.from('second'));
  assert.equal(a.name,'note.txt');assert.equal(b.name,'note (1).txt');assert.equal((await f.request('/api/files/download?name=note.txt',{cookie})).bytes.toString(),'first');
});
test('file paths, chunk positions, ownership and limits are enforced',async t=>{
  const f=await fixture(t),cookie=await f.login(),other=await f.login();
  for(const name of ['../escape.txt','..\\escape.txt','CON.txt','NUL','.secret','bad:name.txt','trailing.'])assert.equal((await f.request('/api/files/uploads',{method:'POST',cookie,body:{name,size:1}})).status,400,name);
  assert.equal((await f.request('/api/files/uploads',{method:'POST',cookie,body:{name:'large.zip',size:7*1024*1024}})).status,413);
  const start=await f.request('/api/files/uploads',{method:'POST',cookie,body:{name:'unfinished.mp3',size:10}}),id=start.json.id;
  assert.equal((await f.request('/api/files/uploads/'+id,{cookie:other})).status,404);
  assert.equal((await f.request('/api/files/uploads/'+id+'?offset=1',{method:'PUT',cookie,body:Buffer.from('x'),raw:true})).status,409);
  assert.equal((await f.request('/api/files/uploads/'+id+'?offset=0',{method:'PUT',cookie,body:Buffer.alloc(11),raw:true})).status,413);
  assert.equal((await f.request('/api/files/uploads/'+id,{method:'DELETE',cookie})).status,200);
  assert.equal((await f.request('/api/files')).status,401);assert.equal((await f.request('/api/files/download?name=..%2Fsecret',{cookie})).status,400);
  assert.equal((await f.request('/api/files/uploads',{method:'POST',cookie,body:{name:'x',size:0},headers:{'X-PCR':'0'}})).status,403);
  assert.equal((await fs.readdir(path.join(f.root,'files'))).length,0);
});

test('clipboard text works both ways without opening a remote screen and stays authenticated',async t=>{
  let clipboard='PC text\n😀\nمرحبا';
  const f=await fixture(t,{clipboardProvider:{get:async()=>clipboard,set:async text=>{clipboard=text;}}}),cookie=await f.login();
  assert.equal((await f.request('/api/clipboard')).status,401);
  assert.equal((await f.request('/api/clipboard',{cookie,headers:{'X-PCR':'0'}})).status,403);
  assert.equal((await f.request('/api/clipboard',{cookie})).json.text,clipboard);
  const text='From phone\n世界\nhttps://example.com';
  assert.equal((await f.request('/api/clipboard',{method:'POST',cookie,body:{text}})).status,200);assert.equal(clipboard,text);
  assert.equal((await f.request('/api/clipboard',{cookie})).json.text,text);
  const activity=(await f.request('/api/status',{cookie})).json.log;assert.ok(activity.some(entry=>entry.text==='Copied text from PC'&&entry.preview===text));assert.ok(activity.some(entry=>entry.text==='Copied text to PC'&&entry.preview===text));
  for(const invalid of [null,1,'\0','\ud800','a'.repeat(250001)])assert.equal((await f.request('/api/clipboard',{method:'POST',cookie,body:{text:invalid}})).status,400);
  assert.equal(clipboard,text,'rejected text must not modify the clipboard');
});

test('clipboard failures are reported without exposing a false success',async t=>{
  const f=await fixture(t,{clipboardProvider:{get:async()=>{throw Error('Clipboard is busy.');},set:async()=>{throw Error('Clipboard is busy.');}}}),cookie=await f.login();
  for(const options of [{cookie},{cookie,method:'POST',body:{text:'hello'}}]){const r=await f.request('/api/clipboard',options);assert.equal(r.status,503);assert.equal(r.json.error,'Clipboard is busy.');}
});
