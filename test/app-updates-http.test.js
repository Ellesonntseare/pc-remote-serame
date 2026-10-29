'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),{createApp}=require('../server');
test('update checks and packages require the owner and preserve APK names and MIME types',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'elleson-update-api-')),file=path.join(root,'fixture.apk');await fs.writeFile(file,Buffer.from('fixture'));let downloads=0;
 const app=createApp({password:'update-fixture',disableAgent:true,disableActions:true,transferDirectory:root,clipboardProvider:{get:async()=>'',set:async()=>{}},appUpdates:{status:async()=>({ok:true,latest:'2.3.0'}),getPackage:async()=>{downloads++;return {file,name:'Elleson-Connect-Android-2.3.0.apk',size:7,sha256:'a'.repeat(64)};},close(){}}});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));t.after(async()=>{app.stop();await new Promise(r=>app.server.close(r));await fs.rm(root,{recursive:true,force:true});});const origin='http://127.0.0.1:'+app.server.address().port;
 assert.equal((await fetch(origin+'/api/updates')).status,401);assert.equal((await fetch(origin+'/api/updates/android/download')).status,401);assert.equal(downloads,0);
 const paired=await fetch(origin+'/api/pair',{method:'POST',headers:{'X-PCR':'1'},body:JSON.stringify({password:'update-fixture'})}),cookie=paired.headers.get('set-cookie').split(';')[0];
 assert.equal((await fetch(origin+'/api/updates',{headers:{Cookie:cookie}})).status,403);
 const checked=await fetch(origin+'/api/updates',{headers:{Cookie:cookie,'X-PCR':'1'}});assert.equal(checked.status,200);assert.equal((await checked.json()).latest,'2.3.0');
 const received=await fetch(origin+'/api/updates/android/download',{headers:{Cookie:cookie}});assert.equal(received.status,200);assert.equal(received.headers.get('content-type'),'application/vnd.android.package-archive');assert.ok(received.headers.get('content-disposition').includes('Elleson-Connect-Android-2.3.0.apk'));assert.equal(await received.text(),'fixture');
});
