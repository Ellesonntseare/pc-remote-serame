'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http');
const crypto=require('node:crypto');
const {EventEmitter}=require('node:events');
const {PassThrough,Writable}=require('node:stream');
const {createApp}=require('../server');
const {gunzipSync}=require('node:zlib');

function request(port,path,{method='GET',body,headers={}}={}){
  return new Promise((resolve,reject)=>{
    const req=http.request({hostname:'127.0.0.1',port,path,method,headers:{'X-PCR':'1',...headers}},res=>{
      const chunks=[];res.on('data',chunk=>chunks.push(chunk));
      res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body:Buffer.concat(chunks)}));
    });
    req.on('error',reject);req.end(body===undefined?undefined:JSON.stringify(body));
  });
}
async function host(t,options={}){
  const app=createApp({port:0,disableAgent:true,disableActions:true,...options});
  await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
  t.after(async()=>{app.stop();await new Promise(resolve=>app.server.close(resolve));});
  return {app,port:app.server.address().port};
}
function packet(type,value){
  const payload=Buffer.from(JSON.stringify(value)),header=Buffer.alloc(5);
  header[0]=type;header.writeUInt32BE(payload.length,1);return Buffer.concat([header,payload]);
}

test('public assets revalidate by content without retransferring unchanged bytes',async t=>{
  const {port}=await host(t);
  for(const path of ['/desktop-controls.js','/desktop-controls.css','/icons/icon-192.png']){
    const asset=await request(port,path);
    assert.equal(asset.status,200);
    assert.equal(asset.headers['cache-control'],'private, no-cache');
    const etag='"'+crypto.createHash('sha256').update(asset.body).digest('base64url')+'"';
    assert.equal(asset.headers.etag,etag,'the validator describes the returned content');
    for(const validator of [etag,'W/'+etag,'"older-content", '+etag,'*']){
      const cached=await request(port,path,{headers:{'If-None-Match':validator}});
      assert.equal(cached.status,304);assert.equal(cached.body.length,0);
      assert.equal(cached.headers.etag,etag);
      assert.equal(cached.headers['cache-control'],'private, no-cache');
    }
    const changed=await request(port,path,{headers:{'If-None-Match':'"older-content"'}});
    assert.equal(changed.status,200);assert.deepEqual(changed.body,asset.body);
  }
  const blocked=await request(port,'/desktop-controls.js',{headers:{Host:'evil.example','If-None-Match':'*'}});
  assert.equal(blocked.status,403,'conditional requests retain the host check');
});

test('the worker, page, manifest and protected responses remain uncached',async t=>{
  const {port}=await host(t);
  for(const path of ['/sw.js','/','/manifest.webmanifest','/api/ping','/api/status']){
    const response=await request(port,path,{headers:{'If-None-Match':'*'}});
    assert.equal(response.status,path==='/api/status'?401:200);
    assert.equal(response.headers['cache-control'],'no-store');
    assert.equal(response.headers.etag,undefined);assert.ok(response.body.length);
    if(path==='/sw.js')assert.equal(response.headers['service-worker-allowed'],'/');
  }
});
test('text responses compress once, preserve exact bytes and use separate cache validators per encoding',async t=>{
  const {port}=await host(t);
  for(const path of ['/','/desktop-controls.js','/workspace-ui.css']){
    const plain=await request(port,path),compressed=await request(port,path,{headers:{'Accept-Encoding':'gzip, deflate'}});
    assert.equal(compressed.headers['content-encoding'],'gzip');assert.equal(compressed.headers.vary,'Accept-Encoding');assert.deepEqual(gunzipSync(compressed.body),plain.body);assert.ok(compressed.body.length<plain.body.length*.5,'the text payload should be at least halved');
    if(path==='/'){assert.equal(compressed.headers['cache-control'],'no-store');assert.equal(compressed.headers.etag,undefined);}
    else{assert.notEqual(compressed.headers.etag,plain.headers.etag);const reused=await request(port,path,{headers:{'Accept-Encoding':'gzip','If-None-Match':compressed.headers.etag}});assert.equal(reused.status,304);assert.equal(reused.body.length,0);const wrong=await request(port,path,{headers:{'If-None-Match':compressed.headers.etag}});assert.equal(wrong.status,200);}
    const refused=await request(port,path,{headers:{'Accept-Encoding':'gzip;q=0, identity'}});assert.equal(refused.headers['content-encoding'],undefined);assert.deepEqual(refused.body,plain.body);
  }
  const image=await request(port,'/icons/icon-192.png',{headers:{'Accept-Encoding':'gzip'}});assert.equal(image.headers['content-encoding'],undefined);
});

test('an error from a replaced agent cannot close the current desktop session',async t=>{
  const agents=[],screens=[];
  const {port}=await host(t,{disableAgent:false,agentFactory:()=>{
    const agent=new EventEmitter();agent.stdout=new PassThrough();agent.stderr=new PassThrough();agent.written=[];
    agent.stdin=new Writable({write(chunk,encoding,done){agent.written.push(chunk.toString());done();}});
    agent.kill=()=>agent.emit('close',0);agent.stdin.on('finish',agent.kill);agents.push(agent);
    setImmediate(()=>agent.stdout.write(packet(1,{w:1920,h:1080})));
    return agent;
  }});
  // Close streams before the host cleanup waits for its connections.
  t.after(()=>{for(const screen of screens){screen.res.destroy();screen.req.destroy();}});
  const pairing=await request(port,'/api/pair',{method:'POST',body:{}});
  const cookie=pairing.headers['set-cookie'][0].split(';')[0];
  async function openScreen(preset){
    return new Promise((resolve,reject)=>{
      const req=http.get({hostname:'127.0.0.1',port,path:'/api/screen?p='+preset,headers:{'X-PCR':'1',Cookie:cookie}},res=>{
        const screen={req,res};screens.push(screen);res.once('data',()=>resolve(screen));
      });req.on('error',reject);
    });
  }
  await openScreen('high');await openScreen('low');assert.equal(agents.length,2);
  agents[0].emit('error',Error('Late error from the previous capture process'));
  const response=await request(port,'/api/input',{method:'POST',body:{cmds:['mv 3 4']},headers:{Cookie:cookie}});
  assert.equal(response.status,200,'the replacement agent stays active');
  assert.ok(agents[1].written.some(chunk=>chunk.includes('mv 3 4\n')));
  assert.equal(screens[1].res.complete,false,'the active screen stream stays open');
});
