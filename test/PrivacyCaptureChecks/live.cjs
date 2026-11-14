'use strict';
// Opt-in desktop check: briefly covers the displays. Pass a built RemoteAgent.exe.
// Captured frame bytes are counted and discarded, never saved or printed.
const {spawn}=require('node:child_process'),path=require('node:path'),assert=require('node:assert/strict');
const {createDisplayPrivacy}=require('../../display-privacy');
const exe=process.argv[2];if(!exe)throw Error('Pass the built RemoteAgent.exe path');
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const streams=[];let privacy;
(async()=>{
 try{
  for(const args of [['10','50','0.5'],['--video-frames']]){
   const child=spawn(exe,args,{windowsHide:true,stdio:['pipe','pipe','pipe']});const stream={child,bytes:0};streams.push(stream);
   child.stdout.on('data',data=>{stream.bytes+=data.length;});child.stderr.resume();child.stdin.on('error',()=>{});
   if(args[0]==='--video-frames')child.stdin.write(JSON.stringify({width:640,fps:10})+'\n');
  }
  privacy=createDisplayPrivacy({root:path.dirname(exe),exists:()=>true,diagnosticPath:null,spawnImpl:(_file,args,options)=>spawn(exe,args,options)});
  await wait(1500);
  for(let i=0;i<(process.argv[3]==='quick'?1:3);i++){
   const started=Date.now();assert.equal((await privacy.start('test')).active,true);
   const before=streams.map(stream=>stream.bytes);await wait(3000);
   streams.forEach((stream,index)=>{assert.equal(stream.child.exitCode,null);assert.ok(stream.bytes>before[index], 'Both JPEG and raw video must continue under the cover');});
   privacy.stop();await wait(600);assert.equal(privacy.status('test').active,false);
   console.log('PASS: privacy start / live JPEG and raw video / restore',i+1,'in',Date.now()-started,'ms');
  }
  if(process.argv[3]==='quick')return;
  assert.equal((await privacy.start('test')).active,true);
  for(let i=0;i<10;i++){privacy.heartbeat('test');await wait(5000);assert.equal(privacy.status('test').active,true);if(i===4)console.log('Keepalive check: active at 25 seconds');}
  console.log('PASS: privacy stays active for 50 seconds with keepalive');
 }finally{privacy?.close();for(const {child}of streams){child.stdin.end('stop\n');child.kill();}}
})().catch(error=>{console.error(error);if(error.diagnostic)console.error(JSON.stringify(error.diagnostic,null,2));process.exitCode=1;});
