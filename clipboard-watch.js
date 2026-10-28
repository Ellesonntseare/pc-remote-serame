'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{spawn}=require('node:child_process');
function createClipboardWatch({root,onChange=()=>{},onState=()=>{},captureImages=false,platform=process.platform,spawnImpl=spawn,exists=fs.existsSync}={}){
  let child=null,pending='',closed=false,retry=null,ready=false;const requests=new Map(),localSequences=new Map();
  function rejectRequests(){for(const row of requests.values()){clearTimeout(row.timer);row.reject(Error('Clipboard connection ended.'));}requests.clear();}
  function start(){
    if(closed||platform!=='win32')return;const exe=path.join(root,'RemoteAgent','bin','RemoteAgent.exe');if(!exists(exe)){onState({active:false});return;}
    try{const process=child=spawnImpl(exe,[captureImages?'--clipboard-sync':'--clipboard-watch'],{cwd:root,windowsHide:true,stdio:['pipe','pipe','pipe']});pending='';process.stdin.on('error',()=>{});process.stdout.setEncoding('utf8');process.stderr.resume();
      process.stdout.on('data',chunk=>{if(process!==child||closed)return;pending+=chunk;if(Buffer.byteLength(pending)>(captureImages?30:2)*1024*1024){process.kill();return;}let at;while((at=pending.indexOf('\n'))>=0){const line=pending.slice(0,at);pending=pending.slice(at+1);let value;try{value=JSON.parse(line);}catch{continue;}
        if(value.type==='ready'){ready=true;onState({active:true});}
        else if(value.type==='unavailable'){ready=false;onState({active:false});}
        else if(value.type==='applied'){
          const request=requests.get(value.id);if(!request)continue;requests.delete(value.id);clearTimeout(request.timer);
          if(value.ok&&Number.isSafeInteger(value.sequence)){localSequences.set(value.sequence,Date.now());request.resolve(value);}else request.reject(Error('Windows clipboard could not be updated.'));
        }
        else if(value.type==='clipboard'&&typeof value.id==='string'&&/^[a-zA-Z0-9-]{1,100}$/.test(value.id)){
          if(value.kind==='text'&&(typeof value.text!=='string'||value.text.length>250000))continue;
          if(value.kind==='image'&&value.data!==undefined&&(!captureImages||typeof value.data!=='string'||value.data.length>28*1024*1024))continue;
          if(value.kind==='files'){if(!Array.isArray(value.files)||value.files.some(file=>typeof file!=='string'||file.length>32768))continue;value.files=value.files.slice(0,100);}
          for(const [sequence,time]of localSequences)if(Date.now()-time>30000)localSequences.delete(sequence);
          value.local=localSequences.has(value.sequence);
          try{const result=onChange(value);if(result?.catch)result.catch(()=>onState({active:false}));if(!ready){ready=true;onState({active:true});}}catch{ready=false;onState({active:false});}
        }}
      });
      const ended=()=>{if(process!==child)return;child=null;ready=false;rejectRequests();onState({active:false});if(!closed){retry=setTimeout(start,10000);retry.unref?.();}};process.once('error',ended);process.once('close',ended);
    }catch{onState({active:false});}
  }
  function set(snapshot){
    if(!ready||!child||closed)return Promise.reject(Error('Windows clipboard connection is not ready.'));
    if(!snapshot||!['text','image','empty'].includes(snapshot.kind)||snapshot.kind==='text'&&(typeof snapshot.text!=='string'||snapshot.text.length>250000)||snapshot.kind==='image'&&(typeof snapshot.data!=='string'||snapshot.data.length>28*1024*1024))return Promise.reject(Error('Unsupported clipboard item.'));
    if(requests.size>=8)return Promise.reject(Error('Clipboard is busy. Retry in a moment.'));
    const id=crypto.randomUUID();return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{requests.delete(id);reject(Error('Windows clipboard update timed out.'));},5000);timer.unref?.();requests.set(id,{resolve,reject,timer});child.stdin.write(JSON.stringify({type:'set',id,kind:snapshot.kind,...snapshot.kind==='text'&&{text:snapshot.text},...snapshot.kind==='image'&&{data:snapshot.data}})+'\n',error=>{if(error&&requests.has(id)){requests.delete(id);clearTimeout(timer);reject(Error('Windows clipboard connection ended.'));}});});
  }
  start();return{get active(){return ready;},set,close(){closed=true;clearTimeout(retry);rejectRequests();const process=child;child=null;ready=false;if(process){process.stdin.end();const kill=setTimeout(()=>{if(process.exitCode==null)process.kill();},1500);kill.unref?.();}}};
}
module.exports={createClipboardWatch};
