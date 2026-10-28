'use strict';
const path=require('node:path'),fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),os=require('node:os'),{createRequire}=require('node:module');
(async()=>{
 const packageRoot=path.resolve(process.argv[2]),root=path.join(packageRoot,'host');
 for(const name of ['PCRemoteHost.exe','host/server.js','host/runtime/node.exe','host/RemoteAgent/bin/RemoteAgent.exe','host/RemoteAgent/bin/Concentus.dll'])assert.ok(fs.statSync(path.join(packageRoot,name)).isFile(),name);
 for(const name of ['config.json','.remembered-sessions.json','.google-accounts.json','.session-history.json','.account-workspace.sqlite','.account-workspace.sqlite-wal','.account-workspace.sqlite-shm','.signing','.env'])assert.equal(fs.existsSync(path.join(root,name)),false,'Private data in package: '+name);
 const localRequire=createRequire(path.join(root,'server.js'));for(const name of ['ws','google-auth-library'])assert.ok(localRequire.resolve(name).startsWith(path.join(root,'node_modules')+path.sep));
 const videoRuntime=localRequire('ffmpeg-static');assert.ok(fs.statSync(videoRuntime).isFile(),'Bundled video encoder');assert.ok(fs.statSync(videoRuntime+'.LICENSE').isFile(),'Video encoder license');
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'pcr-package-verify-'));const {createApp}=localRequire('./server.js'),app=createApp({port:0,password:'package-smoke-only',disableAgent:true,disableActions:true,transferDirectory:temp});
 try{await new Promise(r=>app.server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+app.server.address().port;
  const assets=['/','/client.js','/client-core.css','/client-ui.css','/brand.svg','/audio-capture-worklet.js','/native-video.js','/audio-hub.js','/session-admin.js'];for(const route of assets){const response=await fetch(origin+route);assert.equal(response.status,200,route);const text=await response.text();assert.ok(text.length>0);if(route.endsWith('.js'))new vm.Script(text,{filename:route});}
  const response=await fetch(origin+'/api/pair',{method:'POST',headers:{'X-PCR':'1'},body:JSON.stringify({password:'package-smoke-only'})});assert.equal(response.status,200);const cookie=response.headers.get('set-cookie').split(';')[0];const browse=await fetch(origin+'/api/files/browse',{headers:{'X-PCR':'1',Cookie:cookie}});assert.equal(browse.status,200);assert.equal((await browse.json()).ok,true);
  console.log('PASS: bundled Node, isolated production dependencies, public assets, sign-in and file browser. No private configuration packaged.');
 }finally{app.stop();await new Promise(r=>app.server.close(r));assert.equal(path.dirname(temp),os.tmpdir());assert.ok(path.basename(temp).startsWith('pcr-package-verify-'));fs.rmSync(temp,{recursive:true,force:true});}
})().catch(error=>{console.error(error.message);process.exitCode=1});
