'use strict';
// Display branding changes only. Existing package IDs, protocol identifiers,
// signing keys, storage keys and saved transfer locations remain compatible.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const root=path.resolve(__dirname,'..');
function brandText(before,name){
  let after=before;
  after=after.replaceAll('PC Remote Transfers','__ELLESON_LEGACY_TRANSFER_FOLDER__');
  if(name==='sync-hub.js')after=after.replace("identity='PC Remote'","identity='__ELLESON_LEGACY_SYNC_IDENTITY__'");
  after=after.replaceAll('PC Remote','Elleson Connect').replaceAll('PC REMOTE','ELLESON CONNECT').replaceAll('Serame Keyboard','Elleson Keyboard');
  after=after.replaceAll('__ELLESON_LEGACY_TRANSFER_FOLDER__','PC Remote Transfers').replaceAll('__ELLESON_LEGACY_SYNC_IDENTITY__','PC Remote');
  if(name.startsWith('.github/')||name==='installer/PCRemote.iss')after=after.replaceAll('PC-Remote-','Elleson-Connect-').replaceAll('2.1.9','2.2.0');
  if(name.startsWith('public/')||name==='android/src/main/java/za/co/pcremote/controller/MainActivity.kt')after=after.replaceAll('PC-Remote-','Elleson-Connect-');
  return after;
}
function run(){
const names=cp.execFileSync('git',['ls-files','-z'],{cwd:root,encoding:'utf8'}).split('\0').filter(Boolean),changed=[];
for(const name of names){
  if(!/\.(?:js|cjs|json|html|css|xml|kt|kts|cs|csproj|md|bat|ps1|yml|yaml|iss|txt)$/.test(name)||name==='package-lock.json'||name==='tools/rebrand-elleson.cjs')continue;
  const file=path.join(root,name);if(!fs.existsSync(file)||!fs.statSync(file).isFile())continue;
  const before=fs.readFileSync(file,'utf8'),after=brandText(before,name);
  if(before!==after){fs.writeFileSync(file,after);changed.push(name);}
}
for(const name of ['package.json','package-lock.json']){
 const file=path.join(root,name),before=fs.readFileSync(file,'utf8');let after=before.replace('"name": "pc-remote-repaired"','"name": "elleson-connect"').replace('"version": "2.1.5"','"version": "2.2.0"');
 if(name==='package-lock.json')after=after.replace('"name": "pc-remote-repaired"','"name": "elleson-connect"').replace('"version": "2.1.5"','"version": "2.2.0"');
 fs.writeFileSync(file,after);
}
console.log('Updated display branding in '+changed.length+' files.');
}
module.exports={brandText};
if(require.main===module)run();
