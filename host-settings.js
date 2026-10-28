'use strict';
const fs=require('node:fs'),path=require('node:path');
function saveDeviceName(root,name){
  if(typeof name!=='string'||!name.trim()||name.trim().length>80||/[\x00-\x1f\x7f]/.test(name))throw Error('Invalid device name.');
  const target=path.join(root,'config.json'),temporary=target+'.tmp',config=JSON.parse(fs.readFileSync(target,'utf8'));
  if(!config||typeof config!=='object'||Array.isArray(config))throw Error('Invalid host configuration.');
  config.deviceName=name.trim();
  try{fs.writeFileSync(temporary,JSON.stringify(config,null,2),{mode:0o600});fs.renameSync(temporary,target);}
  catch(error){try{fs.rmSync(temporary,{force:true});}catch{}throw error;}
}
module.exports={saveDeviceName};
