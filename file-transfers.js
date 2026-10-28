'use strict';
const fs=require('node:fs'),fsp=fs.promises,path=require('node:path'),crypto=require('node:crypto');
const {Transform}=require('node:stream'),{pipeline}=require('node:stream/promises');
const CHUNK_BYTES=1024*1024,RETENTION_MS=7*24*60*60*1000;
const PREVIEWS={png:['image','image/png'],jpg:['image','image/jpeg'],jpeg:['image','image/jpeg'],gif:['image','image/gif'],webp:['image','image/webp'],avif:['image','image/avif'],mp3:['audio','audio/mpeg'],wav:['audio','audio/wav'],ogg:['audio','audio/ogg'],flac:['audio','audio/flac'],m4a:['audio','audio/mp4'],aac:['audio','audio/aac'],mp4:['video','video/mp4'],webm:['video','video/webm'],mov:['video','video/quicktime'],ogv:['video','video/ogg'],pdf:['pdf','application/pdf']};
function dispositionName(name){const leaf=name.split('/').at(-1);const ascii=leaf.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^\x20-\x7e]|["\\]/g,'_');return 'filename="'+ascii+'"; filename*=UTF-8\'\''+encodeURIComponent(leaf);}
function downloadMime(name){return previewInfo(name)?.mime||({txt:'text/plain',csv:'text/csv',json:'application/json',zip:'application/zip',apk:'application/vnd.android.package-archive',docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',xlsx:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',pptx:'application/vnd.openxmlformats-officedocument.presentationml.presentation',exe:'application/vnd.microsoft.portable-executable'}[path.extname(name).slice(1).toLowerCase()]||'application/octet-stream');}
function problem(status,message){return Object.assign(new Error(message),{status});}
function filename(value){
  if(typeof value!=='string'||!value||value.length>180||/[<>:"/\\|?*\x00-\x1f]/.test(value)||/[. ]$/.test(value)||/^\./.test(value)||/^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i.test(value))throw problem(400,'Choose a valid filename without slashes or special Windows characters.');
  return value;
}
function relativePath(value){
  if(typeof value!=='string'||value.length>800||value.includes('\\'))throw problem(400,'Choose a folder path inside the transfer folder.');
  const parts=value.split('/');if(parts.length>12||parts.some(part=>!part))throw problem(400,'Use at most twelve folder levels.');
  parts.forEach(filename);return parts.join('/');
}
const crcTable=Uint32Array.from({length:256},(_,n)=>{let value=n;for(let bit=0;bit<8;bit++)value=value&1?0xedb88320^(value>>>1):value>>>1;return value>>>0;});
function crc32(bytes,crc=0xffffffff){for(const byte of bytes)crc=crcTable[(crc^byte)&255]^(crc>>>8);return crc>>>0;}
const digest=value=>crypto.createHash('sha256').update(value).digest('hex');
function previewInfo(name){const ext=path.extname(name).slice(1).toLowerCase(),item=Object.hasOwn(PREVIEWS,ext)?PREVIEWS[ext]:null;return item?{type:item[0],mime:item[1]}:null;}
function byteRange(header,size){
  if(!header)return null;
  const m=/^bytes=(\d*)-(\d*)$/.exec(header);
  if(!m||(!m[1]&&!m[2])||size===0)throw problem(416,'Requested range is unavailable.');
  let start,end;
  if(!m[1]){const suffix=Number(m[2]);if(!Number.isSafeInteger(suffix)||suffix<1)throw problem(416,'Requested range is unavailable.');start=Math.max(0,size-suffix);end=size-1;}
  else{start=Number(m[1]);end=m[2]?Number(m[2]):size-1;if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start>=size||start>end)throw problem(416,'Requested range is unavailable.');end=Math.min(end,size-1);}
  return {start,end};
}
function createFileTransfers({directory,maxBytes=2*1024*1024*1024,locations=[],watch=false,locationsProvider,thumbnailProvider}={}){
  const root=path.resolve(directory),uploads=new Map(),thumbnails=require('./file-thumbnails').createThumbnails(thumbnailProvider);let diskReady;
  let mutation=Promise.resolve();function commit(change){const next=mutation.then(change);mutation=next.catch(()=>{});return next;}
  let revision=Date.now();const watched=new Map();
  function watchFolder(directory){if(!watch||watched.has(directory)||!fs.existsSync(directory))return;try{const watcher=fs.watch(directory,{recursive:true,persistent:false},(event,name)=>{if(name&&String(name).split(/[\\/]/).some(part=>part.startsWith('.')))return;revision=Date.now();});watcher.on('error',()=>{watcher.close();watched.delete(directory);});watched.set(directory,watcher);}catch{}}
  const roots=new Map();for(const item of locations){if(!item||!/^@[a-z][a-z0-9-]{0,40}$/.test(item.id)||typeof item.directory!=='string'||!path.isAbsolute(item.directory))continue;roots.set(item.id,{id:item.id,label:String(item.label||item.id.slice(1)).slice(0,80),directory:path.resolve(item.directory)});}
  let locationsAt=0;function reloadLocations(){if(!locationsProvider||Date.now()-locationsAt<2000)return;locationsAt=Date.now();try{const next=locationsProvider();if(!Array.isArray(next))return;roots.clear();for(const item of next.slice(0,20))if(item&&/^@[a-z][a-z0-9-]{0,40}$/.test(item.id)&&typeof item.directory==='string'&&path.isAbsolute(item.directory)){roots.set(item.id,{id:item.id,label:String(item.label||item.id.slice(1)).slice(0,80),directory:path.resolve(item.directory)});watchFolder(item.directory);}}catch{}}
  for(const item of roots.values())watchFolder(item.directory);watchFolder(root);
  function locate(name){const parts=relativePath(name).split('/'),chosen=roots.get(parts[0]);if(parts[0].startsWith('@')&&!chosen)throw problem(404,'This PC location is unavailable.');return {base:chosen?.directory||root,parts:chosen?parts.slice(1):parts};}
  if(!Number.isSafeInteger(maxBytes)||maxBytes<1)throw Error('maxFileBytes must be a positive integer');
  const target=name=>{const {base,parts}=locate(name),file=path.resolve(base,...parts);if(file!==base&&!file.startsWith(base+path.sep))throw problem(400,'Invalid filename');return file;};
  async function safeTarget(name,create=false){
    const {base,parts}=locate(name);let parent=base;const baseStat=await fsp.lstat(base);if(!baseStat.isDirectory()||baseStat.isSymbolicLink())throw problem(400,'This PC location is unavailable.');
    for(const part of parts.slice(0,-1)){
      parent=path.join(parent,part);if(create)await fsp.mkdir(parent).catch(error=>{if(error.code!=='EEXIST')throw error;});
      const stat=await fsp.lstat(parent);if(!stat.isDirectory()||stat.isSymbolicLink())throw problem(400,'Folder links are not available for transfers.');
    }
    return target(name);
  }
  const partial=id=>path.join(root,'.pcr-upload-'+id+'.part'),metadata=id=>path.join(root,'.pcr-upload-'+id+'.json');
  async function availableLocations(allowed){const available=[{id:'',label:'Transfers'}];if(allowed)for(const item of roots.values()){try{const stat=await fsp.lstat(item.directory);if(stat.isDirectory()&&!stat.isSymbolicLink())available.push({id:item.id,label:item.label});}catch{}}return available;}
  const record=u=>({version:1,...u.syncETag&&{syncETag:u.syncETag},id:u.id,token:u.token,account:u.account,secretHash:u.secretHash,name:u.name,...u.relativePath&&{relativePath:u.relativePath},size:u.size,received:u.received,until:u.until,complete:!!u.complete,...u.publishName&&{publishName:u.publishName},...u.file&&{file:u.file}});
  async function persist(u){const file=metadata(u.id),temp=file+'.tmp';await fsp.unlink(temp).catch(e=>{if(e.code!=='ENOENT')throw e;});const handle=await fsp.open(temp,'wx',0o600);try{await handle.writeFile(JSON.stringify(record(u)));await handle.sync();}finally{await handle.close();}await fsp.rename(temp,file);}
  async function removeDisk(u){for(const file of [partial(u.id),metadata(u.id),metadata(u.id)+'.tmp'])await fsp.unlink(file).catch(e=>{if(e.code!=='ENOENT')throw e;});}
  async function ensure(){
    if(!diskReady)diskReady=(async()=>{
      await fsp.mkdir(root,{recursive:true});const rootStat=await fsp.lstat(root);if(!rootStat.isDirectory()||rootStat.isSymbolicLink())throw Error('Transfer folder must be a real directory.');const entries=await fsp.readdir(root,{withFileTypes:true});
      watchFolder(root);
      for(const entry of entries){
        const match=/^\.pcr-upload-([a-f0-9]{32})\.json$/.exec(entry.name);if(!match)continue;const id=match[1];
        try{
          const stat=await fsp.lstat(metadata(id));if(!stat.isFile()||stat.isSymbolicLink()||stat.size>8192)throw Error('Invalid metadata');
          const u=JSON.parse(await fsp.readFile(metadata(id),'utf8'));
          if(u.version!==1||u.id!==id||typeof u.token!=='string'||u.token.length>256||!(u.account===null||/^[a-f0-9]{64}$/.test(u.account))||!/^[a-f0-9]{64}$/.test(u.secretHash)||!Number.isSafeInteger(u.size)||u.size<0||u.size>maxBytes||!Number.isSafeInteger(u.received)||u.received<0||u.received>u.size||!Number.isFinite(u.until)||u.until<Date.now()||u.until>Date.now()+RETENTION_MS+60000)throw Error('Invalid metadata');
          filename(u.name);if(u.relativePath&&relativePath(u.relativePath).split('/').at(-1)!==u.name)throw Error('Invalid relative path');if(u.publishName)relativePath(u.publishName);
          if(u.complete){if(!u.file||u.received!==u.size||u.file.size!==u.size)throw Error('Invalid completion');relativePath(u.file.name);}
          else{
            const s=await fsp.lstat(partial(id));if(!s.isFile()||s.isSymbolicLink()||s.size<u.received)throw Error('Invalid partial');
            // A request can die after writing bytes but before committing its offset.
            await fsp.truncate(partial(id),u.received);
          }
          u.temp=partial(id);u.busy=false;uploads.set(id,u);
        }catch{await removeDisk({id}).catch(()=>{});}
      }
      for(const entry of entries){const match=/^\.pcr-upload-([a-f0-9]{32})\.(?:part|json\.tmp)$/.exec(entry.name);if(match&&!uploads.has(match[1]))await fsp.unlink(path.join(root,entry.name)).catch(()=>{});}
    })().catch(e=>{diskReady=null;throw e;});
    await diskReady;
  }
  async function discard(u){uploads.delete(u.id);u.cancelled=true;u.request?.destroy();await removeDisk(u);}
  const fileETag=(name,stat)=>'"'+digest(name+':'+stat.size+':'+stat.mtimeMs+':'+stat.ctimeMs)+'"';
  async function finishSync(u){
    const name=u.relativePath||u.name,out=await safeTarget(name,true);let before=null;try{before=await fsp.lstat(out);}catch(error){if(error.code!=='ENOENT')throw error;}
    if(before?.isSymbolicLink()||before&&!before.isFile()||u.syncETag==='new'&&before||u.syncETag!=='new'&&(!before||fileETag(name,before)!==u.syncETag))throw problem(409,'This file changed on another device. Keep both copies and sync again.');
    const temp=path.join(path.dirname(out),'.pcr-sync-'+u.id+'.tmp');await fsp.copyFile(u.temp,temp);try{
      if(before){const versions=path.join(root,'.pcr-versions');await fsp.mkdir(versions,{recursive:true});const check=await fsp.lstat(versions);if(!check.isDirectory()||check.isSymbolicLink())throw problem(400,'Sync history is unavailable.');const backup=path.join(versions,u.id),partial=backup+'.tmp';let existing=false;try{const stat=await fsp.lstat(backup);existing=stat.isFile()&&!stat.isSymbolicLink()&&stat.size===before.size;}catch(error){if(error.code!=='ENOENT')throw error;}if(!existing){await fsp.unlink(partial).catch(()=>{});try{await fsp.copyFile(out,partial,fs.constants.COPYFILE_EXCL);if((await fsp.stat(partial)).size!==before.size)throw problem(409,'The PC file changed while preserving its previous version.');await fsp.rename(partial,backup);}finally{await fsp.unlink(partial).catch(()=>{});}}const latest=await fsp.lstat(out);if(fileETag(name,latest)!==u.syncETag)throw problem(409,'The PC file changed during sync. Keep both copies.');}
      else{try{await fsp.lstat(out);throw problem(409,'Another device created this file. Keep both copies.');}catch(error){if(error.code!=='ENOENT')throw error;}}
      // A sibling temporary file allows atomic replacement on the target volume.
      if(before)await fsp.rename(temp,out);else{await fsp.copyFile(temp,out,fs.constants.COPYFILE_EXCL);await fsp.unlink(temp);}
      const stat=await fsp.lstat(out);u.complete=true;u.file={name,size:stat.size,modified:stat.mtimeMs,etag:fileETag(name,stat)};await persist(u);await fsp.unlink(u.temp);return u.file;
    }finally{await fsp.unlink(temp).catch(()=>{});}
  }
  async function finish(u){
    if(u.complete)return u.file;
    if(u.syncETag)return commit(()=>finishSync(u));
    async function complete(name){u.complete=true;u.file={name,size:u.size,modified:Date.now()};try{await persist(u);}catch(e){u.complete=false;throw e;}await fsp.unlink(u.temp).catch(e=>{if(e.code!=='ENOENT')throw e;});return u.file;}
    // A stop between publishing the link and saving completion must not produce a duplicate.
    if(u.publishName){try{const [source,stored]=await Promise.all([fsp.stat(u.temp),safeTarget(u.publishName).then(file=>fsp.lstat(file))]);if(stored.isFile()&&!stored.isSymbolicLink()&&source.ino!==0&&source.ino===stored.ino&&source.dev===stored.dev)return await complete(u.publishName);}catch(e){if(e.code!=='ENOENT')throw e;}}
    const destination=u.relativePath||u.name,folder=destination.includes('/')?destination.slice(0,destination.lastIndexOf('/')+1):'',parsed=path.parse(u.name);
    for(let n=0;n<1000;n++){
      const name=folder+(n?parsed.name+' ('+n+')'+parsed.ext:u.name),stored=await safeTarget(name,true);
      try{
        u.publishName=name;await persist(u);
        try{await fsp.link(u.temp,stored);}catch(e){if(!['EPERM','ENOTSUP','EXDEV'].includes(e.code))throw e;await fsp.copyFile(u.temp,stored,fs.constants.COPYFILE_EXCL);}
        return await complete(name);
      }catch(e){if(e.code!=='EEXIST')throw e;}
    }
    throw problem(409,'Too many files have this name. Rename the file and try again.');
  }
  const cleanup=setInterval(()=>{for(const u of uploads.values())if(!u.busy&&u.until<Date.now())discard(u).catch(()=>{});},60000);cleanup.unref();
  async function listFiles(prefix='',limit=2000){
    const files=[];let visited=0,truncated=false;
    async function walk(folder){
      if(++visited>4000){truncated=true;return;}
      const directory=folder?await safeTarget(folder):root,stat=await fsp.lstat(directory);
      if(!stat.isDirectory()||stat.isSymbolicLink())throw problem(400,'Folder links are not available for transfers.');
      for(const entry of await fsp.readdir(directory,{withFileTypes:true})){
        if(entry.name.startsWith('.')||entry.isSymbolicLink())continue;
        const name=folder?folder+'/'+entry.name:entry.name;
        try{relativePath(name);}catch{continue;}
        const item=await fsp.lstat(target(name));if(item.isSymbolicLink())continue;
        if(item.isDirectory()){await walk(name);if(truncated)return;}
        else if(item.isFile()){
          if(files.length>=limit){truncated=true;return;}
          files.push({name,size:item.size,modified:item.mtimeMs,etag:fileETag(name,item),preview:previewInfo(name)});
        }
      }
    }
    await walk(prefix);files.sort((a,b)=>b.modified-a.modified);return {files,truncated};
  }
  async function archive(res,name){
    const {files,truncated}=await listFiles(name,2000);
    if(truncated)throw problem(413,'This folder has too many files. Download a smaller folder.');
    const totalBytes=files.reduce((sum,file)=>sum+file.size,0);
    if(totalBytes>Math.min(maxBytes,2*1024*1024*1024))throw problem(413,'This folder is too large for one archive. Download a smaller folder.');
    const entries=files.map(file=>({...file,encoded:Buffer.from(file.name,'utf8')}));
    const contentLength=entries.reduce((sum,file)=>sum+30+file.encoded.length+file.size+16+46+file.encoded.length,22);
    res.writeHead(200,{'Content-Type':'application/zip','Content-Disposition':'attachment; '+dispositionName(name+'.zip'),'Content-Length':contentLength,'Cache-Control':'no-store, no-transform','X-Content-Type-Options':'nosniff'});
    const write=bytes=>new Promise((resolve,reject)=>{if(res.destroyed)return reject(Error('Download disconnected'));res.write(bytes,error=>error?reject(error):resolve());});
    let offset=0;const central=[];
    for(const file of entries){
      const source=await safeTarget(file.name),stat=await fsp.lstat(source);if(!stat.isFile()||stat.isSymbolicLink()||stat.size!==file.size)throw Error('Folder changed during download');
      const header=Buffer.alloc(30);header.writeUInt32LE(0x04034b50);header.writeUInt16LE(20,4);header.writeUInt16LE(0x808,6);header.writeUInt16LE(33,12);header.writeUInt16LE(file.encoded.length,26);
      const start=offset;await write(header);await write(file.encoded);offset+=header.length+file.encoded.length;
      let crc=0xffffffff,bytes=0;
      for await(const chunk of fs.createReadStream(source)){bytes+=chunk.length;if(bytes>file.size)throw Error('Folder changed during download');crc=crc32(chunk,crc);await write(chunk);offset+=chunk.length;}
      if(bytes!==file.size)throw Error('Folder changed during download');crc=(crc^0xffffffff)>>>0;
      const descriptor=Buffer.alloc(16);descriptor.writeUInt32LE(0x08074b50);descriptor.writeUInt32LE(crc,4);descriptor.writeUInt32LE(bytes,8);descriptor.writeUInt32LE(bytes,12);await write(descriptor);offset+=16;
      const entry=Buffer.alloc(46);entry.writeUInt32LE(0x02014b50);entry.writeUInt16LE(20,4);entry.writeUInt16LE(20,6);entry.writeUInt16LE(0x808,8);entry.writeUInt16LE(33,14);entry.writeUInt32LE(crc,16);entry.writeUInt32LE(bytes,20);entry.writeUInt32LE(bytes,24);entry.writeUInt16LE(file.encoded.length,28);entry.writeUInt32LE(start,42);central.push(entry,file.encoded);
    }
    const centralOffset=offset;for(const bytes of central){await write(bytes);offset+=bytes.length;}
    const end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(entries.length,8);end.writeUInt16LE(entries.length,10);end.writeUInt32LE(offset-centralOffset,12);end.writeUInt32LE(centralOffset,16);await write(end);res.end();
  }
  async function handle(req,res,{pathname,token,accountContext,readJson,respond,chunkBytes=CHUNK_BYTES,allowLocations=false}){
    if(pathname!=='/api/files'&&!pathname.startsWith('/api/files/'))return false;
    const chunkLimit=Number.isSafeInteger(chunkBytes)?Math.max(CHUNK_BYTES,Math.min(8*CHUNK_BYTES,chunkBytes)):CHUNK_BYTES;
    try{
      const url=new URL(req.url,'http://localhost');
      reloadLocations();
      const allowedName=value=>{if(typeof value==='string'&&value.startsWith('@')&&!allowLocations)throw problem(403,'This folder is available to the PC owner.');return value;};
      for(const key of ['name','path'])allowedName(url.searchParams.get(key));
      if(req.method!=='GET'&&req.method!=='HEAD'&&req.headers['x-pcr']!=='1')throw problem(403,'Request header missing');
      await ensure();
      if(req.method==='GET'&&pathname==='/api/files/locations'){
        respond(res,200,{ok:true,locations:await availableLocations(allowLocations)});return true;
      }
      if(req.method==='GET'&&pathname==='/api/files/manifest'){
        if(!allowLocations)throw problem(403,'Only paired owner devices can sync folders.');const folder=url.searchParams.get('path')||'';if(folder)relativePath(folder);const manifest=await listFiles(folder,2000);respond(res,200,{ok:true,path:folder,...manifest});return true;
      }
      if(req.method==='GET'&&pathname==='/api/files/hash'){
        if(!allowLocations)throw problem(403,'Pair this device to compare sync files.');const name=relativePath(url.searchParams.get('name')),source=await safeTarget(name),before=await fsp.lstat(source);if(!before.isFile()||before.isSymbolicLink())throw problem(404,'File not found');const hash=crypto.createHash('sha256');for await(const bytes of fs.createReadStream(source))hash.update(bytes);const after=await fsp.lstat(source);if(fileETag(name,before)!==fileETag(name,after))throw problem(409,'The PC file changed. Sync again.');respond(res,200,{ok:true,sha256:hash.digest('hex')});return true;
      }
      if(req.method==='GET'&&pathname==='/api/files/thumbnail'){
        const name=relativePath(url.searchParams.get('name')),file=await safeTarget(name),stat=await fsp.lstat(file);if(stat.isSymbolicLink()||!stat.isFile()&&!stat.isDirectory())throw problem(404,'Preview unavailable.');
        let bytes;try{bytes=await thumbnails.get(file,stat.mtimeMs+'|'+stat.size);}catch{throw problem(404,'Preview unavailable.');}if(req.destroyed||res.destroyed)return true;
        res.writeHead(200,{'Content-Type':'image/png','Content-Length':bytes.length,'Cache-Control':'private, max-age=120','X-Content-Type-Options':'nosniff'});res.end(bytes);return true;
      }
      if(req.method==='GET'&&pathname==='/api/files/browse'){
        const folder=url.searchParams.get('path')||'';if(folder)relativePath(folder);
        const directory=folder?await safeTarget(folder):root,stat=await fsp.lstat(directory);
        if(!stat.isDirectory()||stat.isSymbolicLink())throw problem(400,'Choose a real folder.');
        const entries=[];
        for(const entry of await fsp.readdir(directory,{withFileTypes:true})){
          if(entry.name.startsWith('.')||entry.isSymbolicLink())continue;
          try{filename(entry.name);}catch{continue;}
          const name=folder?folder+'/'+entry.name:entry.name,item=await fsp.lstat(target(name));
          if(item.isSymbolicLink()||!item.isFile()&&!item.isDirectory())continue;
          entries.push({name,label:entry.name,directory:item.isDirectory(),size:item.size,modified:item.mtimeMs,preview:item.isFile()?previewInfo(name):null});
          if(entries.length>=2000)break;
        }
        entries.sort((a,b)=>Number(b.directory)-Number(a.directory)||a.label.localeCompare(b.label));
        respond(res,200,{ok:true,path:folder,entries,locations:await availableLocations(allowLocations),truncated:entries.length>=2000});return true;
      }
      if(req.method==='GET'&&pathname==='/api/files/search'){
        const folder=url.searchParams.get('path')||'',query=(url.searchParams.get('q')||'').trim().toLocaleLowerCase();if(query.length<2||query.length>160)throw problem(400,'Enter at least two characters to search this folder.');
        const found=[];let visited=0,truncated=false;const walk=async(prefix,depth)=>{if(req.destroyed||depth>12||visited>=4000||found.length>=300){truncated=true;return;}const directory=prefix?await safeTarget(prefix):root;for(const entry of await fsp.readdir(directory,{withFileTypes:true})){if(req.destroyed)return;if(++visited>4000||found.length>=300){truncated=true;return;}if(entry.name.startsWith('.')||entry.isSymbolicLink())continue;try{filename(entry.name);}catch{continue;}const name=prefix?prefix+'/'+entry.name:entry.name,stat=await fsp.lstat(target(name));if(stat.isSymbolicLink())continue;if(entry.name.toLocaleLowerCase().includes(query))found.push({name,label:entry.name,directory:stat.isDirectory(),size:stat.size,modified:stat.mtimeMs,preview:stat.isFile()?previewInfo(name):null});if(stat.isDirectory())await walk(name,depth+1);}};await walk(folder,0);respond(res,200,{ok:true,path:folder,entries:found,truncated});return true;
      }
      if(req.method==='POST'&&pathname==='/api/files/operate'){
        if(!allowLocations)throw problem(403,'Only the PC owner can rename or move files.');
        const body=await readJson(req,128*1024);if(!['rename','move'].includes(body.action)||!Array.isArray(body.names)||!body.names.length||body.names.length>100)throw problem(400,'Select up to 100 files or folders.');
        const names=[...new Set(body.names.map(relativePath))];if(body.action==='rename'&&names.length!==1)throw problem(400,'Select one item to rename.');
        const destination=body.destination||'';if(destination)relativePath(destination);const destDir=destination?await safeTarget(destination):root;if(!(await fsp.lstat(destDir)).isDirectory())throw problem(400,'Choose a destination folder.');
        const plans=[];for(const name of names){if(roots.has(name))throw problem(400,'PC locations cannot be renamed or moved.');const source=await safeTarget(name),stat=await fsp.lstat(source);if(stat.isSymbolicLink())throw problem(400,'Folder links cannot be moved.');const label=body.action==='rename'?filename(body.name):name.split('/').at(-1),parent=body.action==='rename'?name.split('/').slice(0,-1).join('/'):destination,next=(parent?parent+'/':'')+label;if(next===name)continue;if(next.startsWith(name+'/'))throw problem(400,'A folder cannot be moved inside itself.');if(names.some(other=>other!==name&&name.startsWith(other+'/')))throw problem(400,'Select the parent folder without its children.');const out=await safeTarget(next);try{await fsp.lstat(out);throw problem(409,'An item named '+label+' already exists. Choose another name or folder.');}catch(error){if(error.code!=='ENOENT')throw error;}plans.push({source,out,next,stat});}
        const moved=[];for(const plan of plans){try{if(plan.stat.isFile()){try{await fsp.link(plan.source,plan.out);}catch(error){if(!['EXDEV','EPERM','ENOTSUP'].includes(error.code))throw error;await fsp.copyFile(plan.source,plan.out,fs.constants.COPYFILE_EXCL);}await fsp.unlink(plan.source);}else await fsp.rename(plan.source,plan.out);moved.push(plan.next);}catch(error){throw problem(error.code==='EEXIST'?409:400,'Moved '+moved.length+' item(s). '+(error.code==='EXDEV'?'Folders must be moved within the same drive.':'This item changed or could not be moved. Refresh the folder.'));}}
        respond(res,200,{ok:true,names:moved});return true;
      }
      if(req.method==='POST'&&pathname==='/api/files/mkdir'){
        const body=await readJson(req,4096),name=relativePath(allowedName(body.path)),directory=await safeTarget(name,true);
        try{await fsp.mkdir(directory);}catch(e){if(e.code!=='EEXIST')throw e;const stat=await fsp.lstat(directory);if(!stat.isDirectory()||stat.isSymbolicLink())throw problem(409,'A file already uses that name.');}
        respond(res,200,{ok:true,path:name});return true;
      }
      if(req.method==='GET'&&pathname==='/api/files'){
        const {files:list,truncated}=await listFiles(),groups=new Map();
        for(const file of list){const name=file.name.split('/')[0];if(!file.name.includes('/'))continue;const folder=groups.get(name)||{name,size:0,count:0};folder.size+=file.size;folder.count++;groups.set(name,folder);}
        respond(res,200,{ok:true,folder:root,maxBytes,chunkBytes:chunkLimit,total:list.length,files:list,folders:[...groups.values()],truncated});return true;
      }
      if(req.method==='GET'&&pathname==='/api/files/folder'){await archive(res,relativePath(url.searchParams.get('name')));return true;}
      if(['GET','HEAD'].includes(req.method)&&['/api/files/download','/api/files/preview'].includes(pathname)){
        const name=relativePath(url.searchParams.get('name')),file=await safeTarget(name),stat=await fsp.lstat(file),preview=pathname.endsWith('/preview')?previewInfo(name):null;
        if(!stat.isFile()||stat.isSymbolicLink())throw problem(404,'File not found');
        if(pathname.endsWith('/preview')&&!preview)throw problem(415,'This file type is available as a download.');
        const headers={'Content-Type':preview?preview.mime:downloadMime(name),'Content-Disposition':(preview?'inline; ':'attachment; ')+dispositionName(name),'Cache-Control':'no-store, no-transform','X-Content-Type-Options':'nosniff','Accept-Ranges':'bytes','Content-Security-Policy':"default-src 'none'; sandbox; frame-ancestors 'self'",'X-Frame-Options':'SAMEORIGIN','Referrer-Policy':'no-referrer'};
        headers.ETag='"'+digest(name+':'+stat.size+':'+stat.mtimeMs+':'+stat.ctimeMs)+'"';
        let range;try{range=byteRange(req.headers['if-range']&&req.headers['if-range']!==headers.ETag?null:req.headers.range,stat.size);}catch(e){res.setHeader('Content-Range','bytes */'+stat.size);throw e;}
        headers['Content-Length']=range?range.end-range.start+1:stat.size;if(range)headers['Content-Range']='bytes '+range.start+'-'+range.end+'/'+stat.size;
        res.writeHead(range?206:200,headers);
        if(req.method==='HEAD'||stat.size===0)res.end();else await pipeline(fs.createReadStream(file,range||{}),res);return true;
      }
      if(req.method==='POST'&&pathname==='/api/files/uploads'){
        const body=await readJson(req,4096),name=filename(body.name),size=body.size;
        const destination=body.relativePath===undefined?name:relativePath(allowedName(body.relativePath));if(destination.split('/').at(-1)!==name)throw problem(400,'Folder path must end with the selected filename.');
        if(!Number.isSafeInteger(size)||size<0||size>maxBytes)throw problem(413,'This file exceeds the host file-size limit.');
        const active=[...uploads.values()].filter(u=>!u.complete);
        if(active.length>=8||active.filter(u=>u.token===token).length>=3)throw problem(429,'Finish or discard the current uploads first.');
        const id=crypto.randomBytes(16).toString('hex'),secret=crypto.randomBytes(32).toString('hex'),temp=partial(id);
        const handle=await fsp.open(temp,'wx',0o600);await handle.close();
        const syncETag=body.replaceETag;if(syncETag!==undefined&&(!allowLocations||typeof syncETag!=='string'||!/^new$|^\"[a-f0-9]{64}\"$/.test(syncETag)))throw problem(400,'Refresh the sync folder before replacing a file.');
        const u={id,token,...syncETag&&{syncETag},account:typeof accountContext==='string'&&accountContext?digest(accountContext):null,secretHash:digest(secret),temp,name,relativePath:destination,size,received:0,busy:false,until:Date.now()+RETENTION_MS};
        try{await persist(u);}catch(e){await removeDisk(u).catch(()=>{});throw e;}uploads.set(id,u);
        let file;try{if(size===0)file=await finish(u);}catch(error){await discard(u);throw error;}
        respond(res,200,{ok:true,id,resumeSecret:secret,received:0,chunkBytes:chunkLimit,complete:size===0,expires:u.until,...file&&{file}});return true;
      }
      const match=/^\/api\/files\/uploads\/([a-f0-9]{32})(\/resume)?$/.exec(pathname);
      if(match){
        const u=uploads.get(match[1]);
        if(match[2]&&req.method==='POST'){
          const body=await readJson(req,4096),secret=typeof body.resumeSecret==='string'?body.resumeSecret:'';
          const context=typeof accountContext==='string'&&accountContext?digest(accountContext):null;
          if(!u||u.until<Date.now()||secret.length!==64||!crypto.timingSafeEqual(Buffer.from(digest(secret),'hex'),Buffer.from(u.secretHash,'hex'))||(u.token!==token&&(!u.account||u.account!==context)))throw problem(404,'Upload recovery is unavailable. Check your sign-in and selected file.');
          if(u.busy)throw problem(409,'A chunk is still uploading.');
          u.busy=true;try{u.token=token;u.until=Date.now()+RETENTION_MS;await persist(u);
            // Complete an upload whose last chunk committed before a process stop.
            if(!u.complete&&u.received===u.size)await finish(u);
            respond(res,200,{ok:true,id:u.id,received:u.received,size:u.size,name:u.name,relativePath:u.relativePath||u.name,chunkBytes:chunkLimit,complete:!!u.complete,expires:u.until,...u.file&&{file:u.file}});
          }finally{u.busy=false;}return true;
        }
        if(!u||u.token!==token||u.until<Date.now()||match[2])throw problem(404,'Upload not found. Use Resume to recover it.');
        if(u.busy)throw problem(409,'A chunk is still uploading.');
        if(req.method==='DELETE'){await discard(u);respond(res,200,{ok:true});return true;}
        if(req.method==='GET'){respond(res,200,{ok:true,received:u.received,size:u.size,complete:!!u.complete,...u.file&&{file:u.file}});return true;}
        if(req.method==='PUT'){
          if(u.complete)throw problem(409,'This upload has already finished.');
          const offset=Number(url.searchParams.get('offset'));if(!url.searchParams.has('offset')||!Number.isSafeInteger(offset)||offset!==u.received)throw problem(409,'Upload position changed. Use Resume to check the saved position.');
          const allowed=Math.min(chunkLimit,u.size-offset),length=Number(req.headers['content-length']);
          if(allowed<1||(req.headers['content-length']!==undefined&&(!Number.isSafeInteger(length)||length<1||length>allowed)))throw problem(413,'Upload chunk is too large.');
          u.busy=true;u.request=req;let bytes=0;
          try{
            const limit=new Transform({transform(chunk,encoding,done){bytes+=chunk.length;done(bytes>allowed?problem(413,'Upload chunk is too large.'):null,chunk);}});
            await pipeline(req,limit,fs.createWriteStream(u.temp,{flags:'r+',start:offset,highWaterMark:256*1024}));
            if(!bytes)throw problem(400,'Empty upload chunk');
            // Persist only fully received chunks. Truncate uncommitted bytes on failure/restart.
            const fh=await fsp.open(u.temp,'r+');try{await fh.sync();}finally{await fh.close();}
            u.received+=bytes;u.until=Date.now()+RETENTION_MS;
            try{await persist(u);}catch(e){u.received=offset;throw e;}
            const complete=u.received===u.size;let file;try{if(complete)file=await finish(u);}catch(error){if(u.syncETag&&error.status===409){u.request=null;await discard(u);}throw error;}
            respond(res,200,{ok:true,received:u.received,complete,...file&&{file}});
          }finally{u.busy=false;u.request=null;if(u.cancelled)await removeDisk(u).catch(()=>{});else if(!u.complete)await fsp.truncate(u.temp,u.received).catch(()=>{});}
          return true;
        }
      }
      throw problem(404,'File action not found');
    }catch(e){
      if(!res.headersSent&&!res.destroyed)respond(res,e.status||(['ENOENT','ENOTDIR'].includes(e.code)?404:500),{error:e.status?e.message:e.code==='ENOENT'?'File not found':'The PC could not complete this file transfer.'});
      else if(!res.destroyed)res.destroy();return true;
    }
  }
  async function revoke(token){await ensure();for(const u of [...uploads.values()])if(u.token===token)await discard(u).catch(()=>{});}
  async function close(){thumbnails.close();clearInterval(cleanup);for(const watcher of watched.values())watcher.close();watched.clear();for(const u of uploads.values()){u.request?.destroy();}}
  async function resolveFile(name){await ensure();const file=await safeTarget(name),stat=await fsp.lstat(file);if(!stat.isFile()||stat.isSymbolicLink())throw problem(400,'Choose a completed file inside the transfer folder.');return file;}
  async function stageFromPC(files){
    await ensure();if(!Array.isArray(files)||!files.length||files.length>100)throw problem(400,'Choose up to 100 files.');const items=[];
    for(const source of files){if(typeof source!=='string'||!path.isAbsolute(source))throw problem(400,'Choose a file on this PC.');const stat=await fsp.lstat(source);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>maxBytes)throw problem(400,'Choose ordinary files within the transfer size limit.');const label=filename(path.basename(source)),name='From PC/'+Date.now()+'-'+crypto.randomBytes(3).toString('hex')+'/'+label,out=await safeTarget(name,true);try{await fsp.link(source,out);}catch(error){if(!['EXDEV','EPERM','ENOTSUP'].includes(error.code))throw error;await fsp.copyFile(source,out,fs.constants.COPYFILE_EXCL);}items.push({kind:'file',name,label,size:stat.size,modified:stat.mtimeMs});}
    return items;
  }
  return {handle,revoke,close,root,resolveFile,stageFromPC,get revision(){return revision;}};
}
module.exports={createFileTransfers,filename,relativePath,crc32};
