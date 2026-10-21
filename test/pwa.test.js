'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http');
const {createApp}=require('../server');
function request(port,route,headers={}){
  return new Promise((resolve,reject)=>{
    http.get({hostname:'127.0.0.1',port,path:route,headers},res=>{
      const chunks=[];res.on('data',chunk=>chunks.push(chunk));res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body:Buffer.concat(chunks)}));
    }).on('error',reject);
  });
}
test('install manifest, icons and service worker are available before pairing',async()=>{
  const app=createApp({port:0,disableAgent:true,disableActions:true});
  await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
  const port=app.server.address().port;
  try{
    const response=await request(port,'/manifest.json');assert.equal(response.status,200);assert.match(response.headers['content-type'],/^application\/manifest\+json/);
    const manifest=JSON.parse(response.body);assert.equal(manifest.id,'/');assert.equal(manifest.scope,'/');assert.equal(manifest.start_url,'/');assert.equal(manifest.display,'standalone');
    assert.ok(manifest.icons.some(icon=>icon.purpose==='maskable'));
    for(const icon of manifest.icons){
      const image=await request(port,icon.src);assert.equal(image.status,200);assert.equal(image.headers['content-type'],'image/png');assert.equal(image.body.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
      const [width,height]=icon.sizes.split('x').map(Number);assert.equal(image.body.readUInt32BE(16),width);assert.equal(image.body.readUInt32BE(20),height);
    }
    const worker=await request(port,'/sw.js');assert.equal(worker.status,200);assert.match(worker.headers['content-type'],/^text\/javascript/);assert.equal(worker.headers['service-worker-allowed'],'/');assert.equal(worker.headers['cache-control'],'no-store');
    assert.doesNotMatch(worker.body.toString(),/caches\.(?:open|match|put)/,'worker must not cache paired pages or API responses');
    for(const file of ['/pwa.js','/pwa.css','/icons/apple-touch-icon.png'])assert.equal((await request(port,file)).status,200);
    const page=await request(port,'/');assert.match(page.body.toString(),/id="installPhone"/);assert.match(page.body.toString(),/rel="manifest"[^>]*crossorigin="use-credentials"/);
    assert.equal((await request(port,'/api/status')).status,401,'install assets must not bypass API authentication');
    assert.equal((await request(port,'/sw.js',{Host:'evil.example'})).status,403,'install assets retain hostname guard');
  }finally{app.stop();await new Promise(resolve=>app.server.close(resolve));}
});
