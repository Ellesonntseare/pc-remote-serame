'use strict';
const fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process');
function createClipboardWatch({root,onChange=()=>{},onState=()=>{},platform=process.platform,spawnImpl=spawn,exists=fs.existsSync}={}){
  let child=null,pending='',closed=false,retry=null,ready=false;
  function start(){
    if(closed||platform!=='win32')return;const exe=path.join(root,'RemoteAgent','bin','RemoteAgent.exe');if(!exists(exe)){onState({active:false});return;}
    try{const process=child=spawnImpl(exe,['--clipboard-watch'],{cwd:root,windowsHide:true,stdio:['pipe','pipe','pipe']});pending='';process.stdin.on('error',()=>{});process.stdout.setEncoding('utf8');process.stderr.resume();
      process.stdout.on('data',chunk=>{if(process!==child||closed)return;pending+=chunk;if(Buffer.byteLength(pending)>2*1024*1024){process.kill();return;}let at;while((at=pending.indexOf('\n'))>=0){const line=pending.slice(0,at);pending=pending.slice(at+1);let value;try{value=JSON.parse(line);}catch{continue;}if(value.type==='ready'){ready=true;onState({active:true});}else if(value.type==='unavailable'){ready=false;onState({active:false});}else if(value.type==='clipboard'&&typeof value.id==='string'&&/^[a-zA-Z0-9-]{1,100}$/.test(value.id)){
          if(value.kind==='text'&&(typeof value.text!=='string'||value.text.length>250000))continue;
          if(value.kind==='files'){if(!Array.isArray(value.files)||value.files.some(file=>typeof file!=='string'||file.length>32768))continue;value.files=value.files.slice(0,100);}
          try{onChange(value);if(!ready){ready=true;onState({active:true});}}catch{ready=false;onState({active:false});}
        }}
      });
      const ended=()=>{if(process!==child)return;child=null;ready=false;onState({active:false});if(!closed){retry=setTimeout(start,10000);retry.unref?.();}};process.once('error',ended);process.once('close',ended);
    }catch{onState({active:false});}
  }
  start();
  return{get active(){return ready;},close(){closed=true;clearTimeout(retry);const process=child;child=null;ready=false;if(process){process.stdin.end();const kill=setTimeout(()=>{if(process.exitCode==null)process.kill();},1500);kill.unref?.();}}};
}
module.exports={createClipboardWatch};
