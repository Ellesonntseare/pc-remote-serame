'use strict';
const fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process');
function createDisplayPrivacy({root,spawnImpl=spawn,platform=process.platform,leaseMs=30000,exists=fs.existsSync}={}){
  let state=null,closed=false;
  function status(token){return {ok:true,available:platform==='win32',active:!!state?.active,owned:!!state&&state.token===token};}
  function stop(){const previous=state;if(!previous)return;state=null;clearTimeout(previous.lease);clearTimeout(previous.startTimer);previous.reject?.(Error('Privacy mode stopped.'));previous.reject=null;try{previous.child.stdin.end('stop\n');}catch{}const kill=setTimeout(()=>previous.child.kill(),1500);kill.unref?.();previous.child.once('close',()=>clearTimeout(kill));}
  function heartbeat(token){if(!state||state.token!==token)return false;clearTimeout(state.lease);state.lease=setTimeout(stop,leaseMs);state.lease.unref?.();try{state.child.stdin.write('keepalive\n');}catch{stop();return false;}return true;}
  async function start(token){
    if(closed)throw Error('PC host is stopping.');if(platform!=='win32')throw Error('Privacy mode requires the Windows host.');
    if(state){if(state.token!==token)throw Error('Privacy mode is in use by another owner connection.');heartbeat(token);return state.pending;}
    const exe=path.join(root,'RemoteAgent/bin/RemoteAgent.exe'),dll=path.join(root,'RemoteAgent/bin/RemoteAgent.dll');if(!exists(exe)&&!exists(dll))throw Error('Update the Windows host to use Privacy mode.');
    const child=spawnImpl(exists(exe)?exe:'dotnet',exists(exe)?['--privacy-display']:[dll,'--privacy-display'],{cwd:root,windowsHide:true,stdio:['pipe','pipe','pipe']});
    const current=state={child,token,active:false,buffer:'',pending:null,reject:null};
    current.pending=new Promise((resolve,reject)=>{current.reject=reject;current.startTimer=setTimeout(()=>{if(state===current){stop();reject(Error('Privacy mode did not start. Displays restored.'));}},15000);current.startTimer.unref?.();child.stdin.on('error',()=>{});child.stderr.resume();child.stdout.setEncoding('utf8');
      child.stdout.on('data',chunk=>{if(state!==current)return;current.buffer+=chunk;if(current.buffer.length>8192){stop();return;}let at;while((at=current.buffer.indexOf('\n'))>=0){const line=current.buffer.slice(0,at);current.buffer=current.buffer.slice(at+1);try{const data=JSON.parse(line);if(data.ok===true&&data.active===true){clearTimeout(current.startTimer);current.active=true;current.reject=null;heartbeat(token);resolve(status(token));}else if(data.ok===false){reject(Error(data.error||'Privacy mode is unavailable.'));current.reject=null;stop();}else if(data.active===false)stop();}catch{stop();}}});
      child.on('error',()=>{reject(Error('The display privacy helper could not start.'));if(state===current)stop();});child.on('close',()=>{reject(Error('Privacy mode ended on the PC.'));if(state===current){state=null;clearTimeout(current.lease);clearTimeout(current.startTimer);}});
    });heartbeat(token);return current.pending;
  }
  return {status,start,heartbeat,stop,revoke:token=>{if(!token||state?.token===token)stop();},close(){closed=true;stop();}};
}
module.exports={createDisplayPrivacy};
