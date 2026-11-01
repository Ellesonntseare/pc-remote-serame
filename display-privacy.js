'use strict';
const fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process');
function createDisplayPrivacy({root,spawnImpl=spawn,platform=process.platform,leaseMs=30000,exists=fs.existsSync,diagnosticPath=path.join(root||process.cwd(),'.privacy-last-attempt.json')}={}){
  let state=null,closed=false;
  function status(token){return {ok:true,available:platform==='win32',active:!!state?.active,owned:!!state&&state.token===token};}
  function diagnostic(current,outcome,message,details={}){
    details=details&&typeof details==='object'?details:{};
    const report={at:new Date().toISOString(),outcome,elapsedMs:Date.now()-current.started,events:current.events,...message&&{message}};
    if(typeof details.stage==='string'&&/^[a-z-]{1,40}$/.test(details.stage))report.stage=details.stage;
    for(const key of ['matched','required','samples','restarts'])if(Number.isInteger(details[key])&&details[key]>=0&&details[key]<=100)report[key]=details[key];
    if(/^0x[0-9A-F]{8}$/i.test(details.hresult||''))report.hresult=details.hresult;
    if(typeof details.probeVisible==='boolean')report.probeVisible=details.probeVisible;
    for(const key of ['probeBounds','captureSize'])if(Array.isArray(details[key])&&details[key].length<=4&&details[key].every(Number.isInteger))report[key]=details[key];
    report.displayRestored=details.displayRestored===true;
    if(diagnosticPath)try{fs.writeFileSync(diagnosticPath,JSON.stringify(report,null,2)+'\n');}catch{}
    return report;
  }
  function stop(){const previous=state;if(!previous)return;state=null;clearTimeout(previous.lease);clearTimeout(previous.startTimer);previous.reject?.(Error('Privacy mode stopped.'));previous.reject=null;try{previous.child.stdin.end('stop\n');}catch{}const kill=setTimeout(()=>previous.child.kill(),1500);kill.unref?.();previous.child.once('close',()=>clearTimeout(kill));}
  function heartbeat(token){if(!state||state.token!==token)return false;clearTimeout(state.lease);state.lease=setTimeout(stop,leaseMs);state.lease.unref?.();try{state.child.stdin.write('keepalive\n');}catch{stop();return false;}return true;}
  async function start(token){
    if(closed)throw Error('PC host is stopping.');if(platform!=='win32')throw Error('Privacy mode requires the Windows host.');
    if(state){if(state.token!==token)throw Error('Privacy mode is in use by another owner connection.');heartbeat(token);return state.pending;}
    const exe=path.join(root,'RemoteAgent/bin/RemoteAgent.exe'),dll=path.join(root,'RemoteAgent/bin/RemoteAgent.dll');if(!exists(exe)&&!exists(dll))throw Error('Update the Windows host to use Privacy mode.');
    const child=spawnImpl(exists(exe)?exe:'dotnet',exists(exe)?['--privacy-display']:[dll,'--privacy-display'],{cwd:root,windowsHide:true,stdio:['pipe','pipe','pipe']});
    const current=state={child,token,active:false,buffer:'',pending:null,reject:null,started:Date.now(),events:[]};
    current.pending=new Promise((resolve,reject)=>{current.reject=reject;current.startTimer=setTimeout(()=>{if(state===current){const error=Error('The Windows privacy helper did not finish starting within 20 seconds.');error.diagnostic=diagnostic(current,'timeout',error.message,{stage:'startup-timeout'});current.reject=null;reject(error);stop();}},20000);current.startTimer.unref?.();child.stdin.on('error',()=>{});let diagnostics='';child.stderr.setEncoding('utf8');child.stderr.on('data',chunk=>{diagnostics=(diagnostics+chunk).slice(-8192);let end;while((end=diagnostics.indexOf('\n'))>=0){const line=diagnostics.slice(0,end);diagnostics=diagnostics.slice(end+1);try{const event=JSON.parse(line);if(['cover-exclusion','live-update','verified'].includes(event.stage)){current.events.push({stage:event.stage,...['restart','failed'].includes(event.action)&&{action:event.action},...Number.isInteger(event.matched)&&{matched:event.matched},...Number.isInteger(event.restarts)&&{restarts:event.restarts}});current.events=current.events.slice(-8);}}catch{}}});child.stdout.setEncoding('utf8');
      child.stdout.on('data',chunk=>{if(state!==current)return;current.buffer+=chunk;if(current.buffer.length>8192){stop();return;}let at;while((at=current.buffer.indexOf('\n'))>=0){const line=current.buffer.slice(0,at);current.buffer=current.buffer.slice(at+1);try{const data=JSON.parse(line);if(data.ok===true&&data.active===true){clearTimeout(current.startTimer);current.active=true;diagnostic(current,'active');current.reject=null;heartbeat(token);resolve(status(token));}else if(data.ok===false){const error=Error(data.error||'Privacy mode is unavailable.');error.diagnostic=diagnostic(current,'failed',error.message,data.diagnostic);reject(error);current.reject=null;stop();}else if(data.active===false)stop();}catch{stop();}}});
      child.on('error',()=>{const error=Error('The display privacy helper could not start.');error.diagnostic=diagnostic(current,'failed',error.message,{stage:'helper-start'});current.reject=null;reject(error);if(state===current)stop();});child.on('close',()=>{reject(Error('Privacy mode ended on the PC.'));if(state===current){state=null;clearTimeout(current.lease);clearTimeout(current.startTimer);}});
    });heartbeat(token);return current.pending;
  }
  return {status,start,heartbeat,stop,revoke:token=>{if(!token||state?.token===token)stop();},close(){closed=true;stop();}};
}
module.exports={createDisplayPrivacy};
