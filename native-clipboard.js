'use strict';
const fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process');
function nativeClipboard(root,mode,text=''){
  return new Promise((resolve,reject)=>{
    if(process.platform!=='win32')return reject(Error('PC clipboard access requires the Windows host.'));
    const exe=path.join(root,'RemoteAgent','bin','RemoteAgent.exe'),dll=path.join(root,'RemoteAgent','bin','RemoteAgent.dll'),arg=mode==='get'?'--clipboard-read':'--clipboard-write';
    if(!fs.existsSync(exe)&&!fs.existsSync(dll))return reject(Error('Restart with start.bat to build the clipboard helper.'));
    const child=spawn(fs.existsSync(exe)?exe:'dotnet',fs.existsSync(exe)?[arg]:[dll,arg],{cwd:root,windowsHide:true,stdio:['pipe','pipe','pipe']});
    let output='',settled=false;const timeout=setTimeout(()=>{child.kill();finish(Error('PC clipboard timed out. Please try again.'));},5000);
    function finish(error,value){if(settled)return;settled=true;clearTimeout(timeout);if(error)reject(error);else resolve(value);}
    child.stdin.on('error',()=>{});child.stderr.resume();
    child.stdout.setEncoding('utf8');child.stdout.on('data',chunk=>{output+=chunk;if(Buffer.byteLength(output)>2*1024*1024){child.kill();finish(Error('Clipboard text is too large.'));}});
    child.on('error',()=>finish(Error('The Windows clipboard helper could not start.')));
    child.on('close',()=>{if(settled)return;try{const data=JSON.parse(output);if(!data.ok)throw Error(data.error||'PC clipboard unavailable.');finish(null,mode==='get'?data.text:true);}catch(e){finish(Error(e.message||'PC clipboard unavailable.'));}});
    child.stdin.end(mode==='set'?text:'','utf8');
  });
}
module.exports=nativeClipboard;
