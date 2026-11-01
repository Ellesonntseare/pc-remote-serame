'use strict';
// Opt-in installed-host check. Uses a temporary local owner session and revokes
// it afterwards. Credentials, cookies and screen contents are never logged.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=process.argv[2];if(!root)throw Error('Pass the installed host directory');
const base='http://127.0.0.1:7666';let cookie='',screen;
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function api(route,body){return fetch(base+route,{method:body?'POST':'GET',headers:{'Content-Type':'application/json','X-PCR':'1',Cookie:cookie},...(body?{body:JSON.stringify(body)}:{})});}
(async()=>{
 try{
  const config=JSON.parse(fs.readFileSync(path.join(root,'config.json'),'utf8'));
  const paired=await api('/api/pair',{password:config.password,deviceName:'Privacy verification',remember:false});
  if(!paired.ok)throw Error('Local verification sign-in failed '+paired.status);
  cookie=paired.headers.get('set-cookie').split(';')[0];screen=new AbortController();
  const view=await fetch(base+'/api/screen',{headers:{Cookie:cookie,'X-PCR':'1'},signal:screen.signal});
  if(!view.ok)throw Error('Screen verification failed '+view.status);
  void (async()=>{try{for await(const chunk of view.body){}}catch{}})();await delay(1200);
  const result=await(await api('/api/privacy',{action:'start'})).json();console.log(JSON.stringify(result));
  assert.equal(result.active,true,'Privacy must become active through the running host');
  const duration=process.argv[3]==='soak'?50000:3000;
  for(let elapsed=0;elapsed<duration;elapsed+=5000){await delay(Math.min(5000,duration-elapsed));const status=await(await api('/api/privacy',{action:'heartbeat'})).json();assert.equal(status.active,true);if(elapsed===20000)console.log('Privacy remains active at 25 seconds.');}
  await api('/api/privacy',{action:'stop'});console.log('PASS: running host API starts privacy, stays active, and restores the desktop.');
 }finally{screen?.abort();if(cookie)await api('/api/unpair',{});}
})().catch(error=>{console.error(error.message);process.exitCode=1;});
