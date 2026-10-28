'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const {createFileTransfers}=require('../file-transfers');
function request(port,route,{method='GET',body,raw=false,token='owner',headers={}}={}){
  const data=body===undefined?undefined:raw?Buffer.from(body):Buffer.from(JSON.stringify(body));
  return new Promise((resolve,reject)=>{const req=http.request({host:'127.0.0.1',port,path:route,method,headers:{'X-PCR':'1',...token&&{Authorization:'Bearer '+token},...data&&{'Content-Length':data.length},...headers}},res=>{const chunks=[];res.on('data',c=>chunks.push(c));res.on('end',()=>{const bytes=Buffer.concat(chunks);let json;try{json=JSON.parse(bytes);}catch{}resolve({status:res.statusCode,headers:res.headers,bytes,json});});});req.on('error',reject);req.end(data);});
}
async function fixture(t){
  const root=await fs.mkdtemp(path.join(__dirname,'.resume-check-')),directory=path.join(root,'files');let transfers,server,port;
  const accounts=new Map([['owner','private-account-A'],['replacement','private-account-A'],['stranger','private-account-B']]);
  const respond=(res,status,data)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(data));};
  const readJson=async(req,max)=>{const chunks=[];let bytes=0;for await(const chunk of req){bytes+=chunk.length;if(bytes>max)throw Object.assign(Error('Too large'),{status:413});chunks.push(chunk);}return JSON.parse(Buffer.concat(chunks));};
  async function start(){transfers=createFileTransfers({directory,maxBytes:4*1024*1024});server=http.createServer(async(req,res)=>{const token=(req.headers.authorization||'').replace(/^Bearer /,'');if(!accounts.has(token))return respond(res,401,{error:'Sign in'});const handled=await transfers.handle(req,res,{pathname:new URL(req.url,'http://localhost').pathname,token,accountContext:accounts.get(token),readJson,respond});if(!handled)respond(res,404,{error:'Unknown'});});await new Promise(r=>server.listen(0,'127.0.0.1',r));port=server.address().port;}
  async function stop(){await transfers.close();await new Promise(r=>server.close(r));}
  await start();t.after(async()=>{await stop();const absolute=path.resolve(root);assert.equal(path.dirname(absolute),__dirname);assert.ok(path.basename(absolute).startsWith('.resume-check-'));await fs.rm(absolute,{recursive:true,force:true});});
  return {directory,get port(){return port;},request:(route,o)=>request(port,route,o),async restart(edit){await stop();if(edit)await edit();await start();},revoke:token=>transfers.revoke(token)};
}
const create=(f,name,size)=>f.request('/api/files/uploads',{method:'POST',body:{name,size}});
const put=(f,id,offset,body,token='owner')=>f.request('/api/files/uploads/'+id+'?offset='+offset,{method:'PUT',body,raw:true,token});
const resume=(f,u,token='replacement',resumeSecret=u.resumeSecret)=>f.request('/api/files/uploads/'+u.id+'/resume',{method:'POST',token,body:{resumeSecret}});
async function upload(f,name,body,conflict){const u=(await f.request('/api/files/uploads',{method:'POST',body:{name,size:body.length,...conflict&&{conflict}}})).json;if(body.length)return (await put(f,u.id,0,body)).json.file;return u.file;}

test('interrupted transfer resumes across a host restart and rotated login without restarting bytes',async t=>{
  const f=await fixture(t),content=crypto.randomBytes(1024*1024+67),created=await create(f,'music.mp3',content.length),u=created.json;
  assert.equal(created.status,200);assert.match(u.resumeSecret,/^[a-f0-9]{64}$/);
  assert.equal((await put(f,u.id,0,content.subarray(0,u.chunkBytes))).json.received,u.chunkBytes);
  const meta=await fs.readFile(path.join(f.directory,'.pcr-upload-'+u.id+'.json'),'utf8');assert.ok(!meta.includes(u.resumeSecret));assert.ok(!meta.includes('private-account-A'));
  await f.restart();assert.equal((await f.request('/api/files/uploads/'+u.id,{token:'replacement'})).status,404);
  const recovered=await resume(f,u);assert.equal(recovered.status,200);assert.equal(recovered.json.received,u.chunkBytes);
  assert.equal((await put(f,u.id,u.chunkBytes,content.subarray(u.chunkBytes),'owner')).status,404,'former token loses ownership after recovery');
  const done=await put(f,u.id,u.chunkBytes,content.subarray(u.chunkBytes),'replacement');assert.equal(done.json.complete,true);
  assert.deepEqual((await f.request('/api/files/download?name=music.mp3',{token:'replacement'})).bytes,content);
  await f.restart();const final=await resume(f,u);assert.equal(final.json.complete,true);assert.equal(final.json.file.name,'music.mp3');assert.equal((await f.request('/api/files')).json.total,1,'lost final acknowledgement cannot create duplicate files');
});

test('recovery requires authentication, the secret and the same private account; ordinary operations keep token ownership',async t=>{
  const f=await fixture(t),u=(await create(f,'private.zip',12)).json;
  assert.equal((await resume(f,u,null)).status,401);
  assert.equal((await resume(f,u,'stranger')).status,404);
  assert.equal((await resume(f,u,'replacement','f'.repeat(64))).status,404);
  assert.equal((await resume(f,u,'replacement','')).status,404);
  for(const method of ['GET','DELETE','PUT'])assert.equal((await f.request('/api/files/uploads/'+u.id+'?offset=0',{method,token:'replacement',...method==='PUT'&&{body:Buffer.from('x'),raw:true}})).status,404);
  assert.equal((await resume(f,u)).status,200);
  assert.equal((await f.request('/api/files/uploads/'+u.id,{method:'DELETE',token:'replacement'})).status,200);
  assert.equal((await resume(f,u)).status,404);assert.deepEqual(await fs.readdir(f.directory),[]);
});

test('restart truncates uncommitted bytes and rejects corrupt metadata without reading paths outside the transfer root',async t=>{
  const f=await fixture(t),u=(await create(f,'safe.bin',8)).json;await put(f,u.id,0,Buffer.from('abc'));
  const corrupt='a'.repeat(32);await f.restart(async()=>{await fs.appendFile(path.join(f.directory,'.pcr-upload-'+u.id+'.part'),'UNCOMMITTED');await fs.writeFile(path.join(f.directory,'.pcr-upload-'+corrupt+'.json'),JSON.stringify({version:1,id:corrupt,temp:'../outside',name:'../outside'}));await fs.writeFile(path.join(f.directory,'.pcr-upload-'+corrupt+'.part'),'bad');});
  assert.equal((await resume(f,u)).json.received,3);assert.equal((await fs.stat(path.join(f.directory,'.pcr-upload-'+u.id+'.part'))).size,3);
  assert.equal((await f.request('/api/files/uploads/'+corrupt)).status,404);assert.ok(!(await fs.readdir(f.directory)).some(name=>name.includes(corrupt)));
  await put(f,u.id,3,Buffer.from('defgh'),'replacement');assert.equal((await f.request('/api/files/download?name=safe.bin')).bytes.toString(),'abcdefgh');
});

test('a partially received HTTP chunk is never committed and can be resumed after restart',async t=>{
  const f=await fixture(t),u=(await create(f,'interrupted.bin',16)).json;await put(f,u.id,0,Buffer.from('abc'));
  await new Promise(resolve=>{const req=http.request({hostname:'127.0.0.1',port:f.port,path:'/api/files/uploads/'+u.id+'?offset=3',method:'PUT',headers:{Authorization:'Bearer owner','X-PCR':'1','Content-Length':10}});req.on('error',()=>{});req.flushHeaders();req.write('partial');setTimeout(()=>{req.destroy();resolve();},25);});
  await new Promise(r=>setTimeout(r,25));await f.restart();assert.equal((await resume(f,u)).json.received,3);
  assert.equal((await put(f,u.id,3,Buffer.from('defghijklmnop'),'replacement')).json.complete,true);assert.equal((await f.request('/api/files/download?name=interrupted.bin')).bytes.toString(),'abcdefghijklmnop');
});

test('recovery recognizes a file published just before the host stopped',async t=>{
  const f=await fixture(t),u=(await create(f,'published.bin',3)).json;
  await f.restart(async()=>{const meta=path.join(f.directory,'.pcr-upload-'+u.id+'.json'),part=path.join(f.directory,'.pcr-upload-'+u.id+'.part'),record=JSON.parse(await fs.readFile(meta,'utf8'));await fs.writeFile(part,'abc');record.received=3;record.publishName='published.bin';await fs.writeFile(meta,JSON.stringify(record));await fs.link(part,path.join(f.directory,'published.bin'));});
  const done=await resume(f,u);assert.equal(done.json.complete,true);assert.equal(done.json.file.name,'published.bin');assert.equal((await f.request('/api/files')).json.total,1);
});

test('byte ranges stream correct first, middle, suffix and final bytes and reject invalid boundaries',async t=>{
  const f=await fixture(t),body=Buffer.from('0123456789');await upload(f,'clip.mp4',body);
  for(const [range,expected,contentRange] of [['bytes=0-0','0','bytes 0-0/10'],['bytes=3-6','3456','bytes 3-6/10'],['bytes=8-','89','bytes 8-9/10'],['bytes=-3','789','bytes 7-9/10'],['bytes=8-999','89','bytes 8-9/10'],['bytes=-99','0123456789','bytes 0-9/10']]){const r=await f.request('/api/files/preview?name=clip.mp4',{headers:{Range:range}});assert.equal(r.status,206,range);assert.equal(r.bytes.toString(),expected);assert.equal(r.headers['content-range'],contentRange);assert.equal(Number(r.headers['content-length']),expected.length);assert.equal(r.headers['content-type'],'video/mp4');}
  for(const range of ['bytes=10-','bytes=6-3','bytes=-0','bytes=-','bytes=0-0,2-2','items=0-2','bytes=9007199254740993-']){const r=await f.request('/api/files/preview?name=clip.mp4',{headers:{Range:range}});assert.equal(r.status,416,range);assert.equal(r.headers['content-range'],'bytes */10');}
  const head=await f.request('/api/files/preview?name=clip.mp4',{method:'HEAD',headers:{Range:'bytes=2-4'}});assert.equal(head.status,206);assert.equal(head.bytes.length,0);assert.equal(head.headers['content-length'],'3');
  await upload(f,'empty.pdf',Buffer.alloc(0));assert.equal((await f.request('/api/files/preview?name=empty.pdf',{headers:{Range:'bytes=0-'}})).status,416);
});

test('only allowlisted safe MIME families preview; HTML, SVG and unknown types always download',async t=>{
  const f=await fixture(t);
  for(const name of ['active.html','active.svg','active.xhtml','active.txt','active.constructor','active.__proto__']){await upload(f,name,Buffer.from('<script>alert(1)</script>'));assert.equal((await f.request('/api/files/preview?name='+name)).status,415,name);const r=await f.request('/api/files/download?name='+name);assert.equal(r.headers['content-type'],name.endsWith('.txt')?'text/plain':'application/octet-stream');assert.match(r.headers['content-disposition'],/^attachment;/);assert.equal(r.headers['x-content-type-options'],'nosniff');}
  for(const [name,mime] of [['photo.PNG','image/png'],['music.mp3','audio/mpeg'],['movie.webm','video/webm'],['book.pdf','application/pdf']]){await upload(f,name,Buffer.from('safe fixture'));const r=await f.request('/api/files/preview?name='+name);assert.equal(r.status,200);assert.equal(r.headers['content-type'],mime);assert.match(r.headers['content-disposition'],/^inline;/);assert.match(r.headers['content-security-policy'],/sandbox/);assert.equal(r.headers['x-content-type-options'],'nosniff');}
  assert.equal((await f.request('/api/files/preview?name=book.pdf',{token:null})).status,401);assert.equal((await f.request('/api/files/preview?name=..%2Fsecret.pdf')).status,400);
  const list=(await f.request('/api/files')).json.files;assert.equal(list.find(f=>f.name==='active.svg').preview,null);assert.equal(list.find(f=>f.name==='book.pdf').preview.type,'pdf');assert.ok(list.every(f=>!f.name.startsWith('.')));
});

test('duplicate names preserve every completed file and logout discards only that token’s interrupted transfers',async t=>{
  const f=await fixture(t);const first=await upload(f,'same.txt',Buffer.from('first')),second=await upload(f,'same.txt',Buffer.from('second'),'rename');
  assert.equal(first.name,'same.txt');assert.equal(second.name,'same (1).txt');assert.equal((await f.request('/api/files/download?name=same.txt')).bytes.toString(),'first');
  const owner=(await create(f,'pending.zip',10)).json,other=(await f.request('/api/files/uploads',{method:'POST',token:'replacement',body:{name:'other.zip',size:10}})).json;await f.revoke('owner');assert.equal((await resume(f,owner)).status,404);assert.equal((await resume(f,other)).status,200);assert.equal((await f.request('/api/files')).json.total,2);
});
