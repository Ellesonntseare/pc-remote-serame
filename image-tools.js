'use strict';
const fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process');
function png(value){if(typeof value!=='string'||value.length>11200000||value.length%4!==0||!/^[A-Za-z0-9+/]*={0,2}$/.test(value))throw Error('Choose a PNG image under 8 MB.');const bytes=Buffer.from(value,'base64');if(bytes.length<33||bytes.length>8*1024*1024||bytes.subarray(0,8).toString('hex')!=='89504e470d0a1a0a'||bytes.toString('ascii',12,16)!=='IHDR')throw Error('Choose a valid PNG image.');const width=bytes.readUInt32BE(16),height=bytes.readUInt32BE(20);if(!width||!height||width>4096||height>4096||width*height>16000000)throw Error('Use an image up to 4096 pixels per side.');return {width,height};}
function imageTool(root,mode,data=''){
  if(!['ocr','clipboard-image-read','clipboard-image-write'].includes(mode))return Promise.reject(Error('Invalid image action.'));
  if(mode!=='clipboard-image-read')png(data);
  return new Promise((resolve,reject)=>{
    if(process.platform!=='win32')return reject(Error('This feature needs the Windows host.'));
    const exe=path.join(root,'RemoteAgent','bin','RemoteAgent.exe'),dll=path.join(root,'RemoteAgent','bin','RemoteAgent.dll');
    const child=spawn(fs.existsSync(exe)?exe:'dotnet',fs.existsSync(exe)?['--'+mode]:[dll,'--'+mode],{cwd:root,windowsHide:true,stdio:['pipe','pipe','pipe']});let output='',settled=false;
    const timeout=setTimeout(()=>{child.kill();done(Error('Image action timed out. Try again.'));},20000);
    function done(error,value){if(settled)return;settled=true;clearTimeout(timeout);error?reject(error):resolve(value);}
    child.stdin.on('error',()=>{});child.stderr.resume();child.stdout.setEncoding('utf8');child.stdout.on('data',part=>{output+=part;if(output.length>12000000){child.kill();done(Error('Image is too large.'));}});child.on('error',()=>done(Error('Image tools are unavailable. Restart the host.')));child.on('close',()=>{if(settled)return;try{const value=JSON.parse(output);if(!value.ok)throw Error(value.error);done(null,value);}catch(e){done(Error(e.message||'Image action failed.'));}});child.stdin.end(data,'utf8');
  });
}
module.exports={png,imageTool};
