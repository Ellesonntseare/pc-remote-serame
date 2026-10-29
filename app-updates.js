'use strict';
const fs=require('node:fs'),fsp=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto'),{execFile,spawn}=require('node:child_process'),{Transform}=require('node:stream'),{pipeline}=require('node:stream/promises');
const REPO='Ellesonntseare/pc-remote-serame';
function version(value){const found=/^v?(\d{1,5})\.(\d{1,5})\.(\d{1,5})(?:-preview)?$/.exec(String(value));return found?found.slice(1).map(Number):null;}
function newer(a,b){const left=version(a),right=version(b);if(!left||!right)return false;for(let i=0;i<3;i++)if(left[i]!==right[i])return left[i]>right[i];return false;}
function selectRelease(rows){
 if(!Array.isArray(rows))throw Error('Invalid update response.');
 for(const row of rows.filter(row=>!row.draft&&version(row.tag_name)).sort((a,b)=>newer(a.tag_name,b.tag_name)?-1:newer(b.tag_name,a.tag_name)?1:0)){
  const name=version(row.tag_name).join('.'),assets={};
  for(const [kind,file,limit]of [['android','Elleson-Connect-Android-'+name+'.apk',100*1024*1024],['windows','Elleson-Connect-Host-Setup-'+name+'.exe',512*1024*1024]]){
   const asset=row.assets?.find(item=>item.name===file),digest=/^sha256:([a-f0-9]{64})$/i.exec(asset?.digest||'');
   if(asset&&Number.isSafeInteger(asset.id)&&asset.id>0&&Number.isSafeInteger(asset.size)&&asset.size>0&&asset.size<=limit&&digest)assets[kind]={id:asset.id,name:file,size:asset.size,sha256:digest[1].toLowerCase()};
  }
  if(assets.android)return {version:name,tag:row.tag_name,assets};
 }
 throw Error('No verified app update is published yet.');
}
function releases(){return new Promise((resolve,reject)=>execFile('gh',['api','repos/'+REPO+'/releases?per_page=15'],{windowsHide:true,timeout:15000,maxBuffer:2*1024*1024},(error,stdout)=>{if(error)return reject(Error('The host could not check GitHub. Check its connection and GitHub sign-in.'));try{resolve(JSON.parse(stdout));}catch{reject(Error('The update service returned an invalid response.'));}}));}
function assetStream(asset){const child=spawn('gh',['api','repos/'+REPO+'/releases/assets/'+asset.id,'-H','Accept: application/octet-stream'],{windowsHide:true,stdio:['ignore','pipe','pipe']});child.stderr.resume();const complete=new Promise((resolve,reject)=>{child.once('error',()=>reject(Error('The host could not start the update download.')));child.once('close',code=>code===0?resolve():reject(Error('The update download did not finish.')));});return {stream:child.stdout,complete,cancel:()=>child.kill()};}
function createAppUpdates({root,currentVersion,fetchReleases=releases,downloadAsset=assetStream,now=Date.now}={}){
 const directory=path.join(root,'.app-updates-cache'),pending=new Map(),active=new Set();let cached=null,checked=0,checking=null,closed=false;
 async function latest(){if(cached&&now()-checked<300000)return cached;if(checking)return checking;checking=Promise.resolve().then(fetchReleases).then(rows=>{cached=selectRelease(rows);checked=now();return cached;}).finally(()=>checking=null);return checking;}
 async function status(){const release=await latest();return {ok:true,currentHost:currentVersion,latest:release.version,hostUpdateAvailable:newer(release.version,currentVersion),releaseUrl:'https://github.com/'+REPO+'/releases/tag/'+encodeURIComponent(release.tag),android:{name:release.assets.android.name,size:release.assets.android.size,sha256:release.assets.android.sha256,url:'/api/updates/android/download'},windows:release.assets.windows?{name:release.assets.windows.name,size:release.assets.windows.size,sha256:release.assets.windows.sha256}:null};}
 async function getPackage(kind='android'){
  if(closed)throw Error('The update service is stopping.');const release=await latest(),asset=release.assets[kind];if(!asset)throw Error('This update package is not available.');
  if(pending.has(asset.sha256))return pending.get(asset.sha256);
  const task=(async()=>{
   await fsp.mkdir(directory,{recursive:true});const file=path.join(directory,asset.name),sidecar=file+'.sha256';
   try{const stat=await fsp.stat(file);if(stat.isFile()&&stat.size===asset.size&&(await fsp.readFile(sidecar,'utf8')).trim()===asset.sha256){const hash=crypto.createHash('sha256');for await(const chunk of fs.createReadStream(file))hash.update(chunk);if(hash.digest('hex')===asset.sha256)return {file,...asset};}}catch{}
   const temporary=path.join(directory,crypto.randomUUID()+'.part');let transfer;
   try{
    transfer=downloadAsset(asset);active.add(transfer);let bytes=0;const hash=crypto.createHash('sha256');const verify=new Transform({transform(chunk,encoding,done){bytes+=chunk.length;if(bytes>asset.size)return done(Error('The update package exceeded its published size.'));hash.update(chunk);done(null,chunk);}});
    await Promise.all([pipeline(transfer.stream,verify,fs.createWriteStream(temporary,{flags:'wx'})),transfer.complete]);
    if(bytes!==asset.size||hash.digest('hex')!==asset.sha256)throw Error('The update package failed verification. Please retry.');
    await fsp.rename(temporary,file);await fsp.writeFile(sidecar,asset.sha256+'\n');return {file,...asset};
   }catch(error){transfer?.cancel?.();await fsp.unlink(temporary).catch(()=>{});throw error;}finally{active.delete(transfer);}
  })().finally(()=>pending.delete(asset.sha256));pending.set(asset.sha256,task);return task;
 }
 return {status,getPackage,close(){closed=true;for(const transfer of active)transfer.cancel?.();}};
}
module.exports={createAppUpdates,selectRelease,newer,version};
