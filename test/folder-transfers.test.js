'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),http=require('node:http');
const {createFileTransfers,relativePath,crc32}=require('../file-transfers');
function request(port,route,{method='GET',body,raw=false,headers={}}={}){const bytes=body===undefined?null:Buffer.from(raw?body:JSON.stringify(body));return new Promise((resolve,reject)=>{const req=http.request({host:'127.0.0.1',port,path:route,method,headers:{'X-PCR':'1',...headers,...bytes&&{'Content-Length':bytes.length}}},res=>{const chunks=[];res.on('data',chunk=>chunks.push(chunk));res.on('end',()=>{const data=Buffer.concat(chunks);let json;try{json=JSON.parse(data);}catch{}resolve({status:res.statusCode,headers:res.headers,data,json});});});req.on('error',reject);req.end(bytes);});}
async function fixture(t){const root=await fs.mkdtemp(path.join(__dirname,'.transfer-check-')),directory=path.join(root,'files');let transfers,server,port;
  async function start(){transfers=createFileTransfers({directory,maxBytes:8*1024*1024});server=http.createServer(async(req,res)=>{const respond=(response,status,body)=>{response.writeHead(status,{'Content-Type':'application/json'});response.end(JSON.stringify(body));};await transfers.handle(req,res,{pathname:new URL(req.url,'http://localhost').pathname,token:'owner',accountContext:'account',readJson:async request=>{let text='';for await(const chunk of request)text+=chunk;return JSON.parse(text);},respond});});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));port=server.address().port;}
  async function stop(){await transfers.close();await new Promise(resolve=>server.close(resolve));}await start();t.after(async()=>{await stop();assert.equal(path.dirname(root),__dirname);assert.ok(path.basename(root).startsWith('.transfer-check-'));await fs.rm(root,{recursive:true,force:true});});
  return {root,directory,request:(route,options)=>request(port,route,options),async restart(){await stop();await start();}};
}
async function upload(f,relative,content,conflict){const body=Buffer.from(content),created=await f.request('/api/files/uploads',{method:'POST',body:{name:relative.split('/').at(-1),relativePath:relative,size:body.length,...conflict&&{conflict}}});assert.equal(created.status,200);if(!body.length)return created.json.file;const done=await f.request('/api/files/uploads/'+created.json.id+'?offset=0',{method:'PUT',body,raw:true});assert.equal(done.status,200);return done.json.file;}
function unzipStored(zip){const end=zip.length-22;assert.equal(zip.readUInt32LE(end),0x06054b50);const count=zip.readUInt16LE(end+10);let offset=zip.readUInt32LE(end+16);const files=new Map();for(let n=0;n<count;n++){assert.equal(zip.readUInt32LE(offset),0x02014b50);assert.equal(zip.readUInt16LE(offset+10),0);const crc=zip.readUInt32LE(offset+16),size=zip.readUInt32LE(offset+24),nameBytes=zip.readUInt16LE(offset+28),extra=zip.readUInt16LE(offset+30),comment=zip.readUInt16LE(offset+32),source=zip.readUInt32LE(offset+42),name=zip.subarray(offset+46,offset+46+nameBytes).toString('utf8');assert.equal(zip.readUInt32LE(source),0x04034b50);const start=source+30+zip.readUInt16LE(source+26)+zip.readUInt16LE(source+28),content=zip.subarray(start,start+size);assert.equal((crc32(content)^0xffffffff)>>>0,crc);files.set(name,content);offset+=46+nameBytes+extra+comment;}return files;}
test('folder paths reject traversal, drive paths, hidden files and Windows aliases',()=>{
  assert.equal(relativePath('Documents/世界/notes.txt'),'Documents/世界/notes.txt');
  for(const name of ['../secret','Folder/../secret','/absolute','C:/outside','Folder\\file.txt','Folder//file','Folder/.pcr-secret','Folder/CON.txt','Folder/trailing.','Folder/aux','Folder/'+Array(13).fill('deep').join('/')])assert.throws(()=>relativePath(name),{status:400},name);
});
test('folder upload, nested duplicate names, restart recovery and streamed ZIP preserve exact bytes',async t=>{
  const f=await fixture(t);const first=await upload(f,'Folder/A/same.txt','one'),second=await upload(f,'Folder/B/same.txt','two'),duplicate=await upload(f,'Folder/A/same.txt','three','rename'),empty=await upload(f,'Folder/empty.txt','');
  assert.equal(first.name,'Folder/A/same.txt');assert.equal(second.name,'Folder/B/same.txt');assert.equal(duplicate.name,'Folder/A/same (1).txt');assert.equal(empty.name,'Folder/empty.txt');await f.restart();
  const list=await f.request('/api/files');assert.equal(list.json.total,4);assert.deepEqual(list.json.folders,[{name:'Folder',size:11,count:4}]);
  const archive=await f.request('/api/files/folder?name=Folder');assert.equal(archive.status,200);assert.equal(archive.headers['content-type'],'application/zip');assert.equal(Number(archive.headers['content-length']),archive.data.length);const files=unzipStored(archive.data);assert.equal(files.size,4);assert.equal(files.get('Folder/A/same.txt').toString(),'one');assert.equal(files.get('Folder/B/same.txt').toString(),'two');assert.equal(files.get('Folder/A/same (1).txt').toString(),'three');assert.equal(files.get('Folder/empty.txt').length,0);
  const downloaded=await f.request('/api/files/download?name='+encodeURIComponent(first.name));assert.equal(downloaded.data.toString(),'one');
});
test('folder upload and downloads never follow a directory junction outside the transfer root',async t=>{
  const f=await fixture(t);await fs.mkdir(f.directory,{recursive:true});const outside=path.join(f.root,'outside');await fs.mkdir(outside);await fs.writeFile(path.join(outside,'private.txt'),'outside');
  try{await fs.symlink(outside,path.join(f.directory,'Linked'),process.platform==='win32'?'junction':'dir');}catch(error){if(['EPERM','EACCES'].includes(error.code)){t.skip('Directory link permission is unavailable');return;}throw error;}
  for(const route of ['/api/files/download?name=Linked/private.txt','/api/files/folder?name=Linked'])assert.equal((await f.request(route)).status,400);
  const result=await f.request('/api/files/uploads',{method:'POST',body:{name:'new.txt',relativePath:'Linked/new.txt',size:0}});assert.equal(result.status,400);assert.deepEqual(await fs.readdir(outside),['private.txt']);assert.deepEqual((await f.request('/api/files')).json.files,[]);
});

test('file manager browses immediate children, creates empty folders and rejects paths outside the transfer root',async t=>{
 const f=await fixture(t);await upload(f,'Photos/Trip/a.txt','hello');
 assert.equal((await f.request('/api/files/mkdir',{method:'POST',body:{path:'Photos/Empty'}})).status,200);
 const top=await f.request('/api/files/browse');assert.deepEqual(top.json.entries.map(e=>[e.label,e.directory]),[['Photos',true]]);
 const photos=await f.request('/api/files/browse?path=Photos');assert.deepEqual(photos.json.entries.map(e=>e.label),['Empty','Trip']);
 const nested=await f.request('/api/files/browse?path=Photos%2FTrip');assert.equal(nested.json.entries[0].name,'Photos/Trip/a.txt');
 for(const name of ['../outside','Photos/../../outside','C:/outside','Photos/.pcr-private','Photos/CON'])assert.equal((await f.request('/api/files/mkdir',{method:'POST',body:{path:name}})).status,400);
 assert.equal((await f.request('/api/files/browse?path=..')).status,400);
 assert.equal((await f.request('/api/files/browse?path=Photos%2FTrip%2Fa.txt')).status,400);
});
test('download resumes exact bytes only while its ETag still matches',async t=>{
 const f=await fixture(t);await upload(f,'sample.txt','abcdefgh');
 const original=await f.request('/api/files/download?name=sample.txt');const etag=original.headers.etag;assert.ok(etag);
 const resumed=await f.request('/api/files/download?name=sample.txt',{headers:{Range:'bytes=3-','If-Range':etag}});assert.equal(resumed.status,206);assert.equal(resumed.data.toString(),'defgh');
 const changed=await f.request('/api/files/download?name=sample.txt',{headers:{Range:'bytes=3-','If-Range':'"old-file"'}});assert.equal(changed.status,200);assert.equal(changed.data.toString(),'abcdefgh');
});
