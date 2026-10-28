'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const MAX_IMAGE=20*1024*1024;
const digest=value=>crypto.createHash('sha256').update(value).digest('hex');
const problem=(status,message)=>Object.assign(Error(message),{status});
function imageBytes(value){
  const bytes=Buffer.isBuffer(value)?value:typeof value==='string'&&/^[A-Za-z0-9+/]*={0,2}$/.test(value)?Buffer.from(value,'base64'):null;
  if(!bytes||bytes.length<33||bytes.length>MAX_IMAGE||!bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))||bytes.toString('ascii',12,16)!=='IHDR')throw problem(400,'Use a PNG picture up to 20 MB.');
  const width=bytes.readUInt32BE(16),height=bytes.readUInt32BE(20);if(!width||!height||width*height>24000000)throw problem(400,'This picture exceeds the clipboard image limit.');return bytes;
}
/** Typed clipboard snapshots. Full image bytes stay outside workspace polling. */
function createSharedClipboard({store,directory,apply=async()=>{},now=Date.now}={}){
  const latest=new Map(),loading=new Map(),queues=new Map(),blobs=new Map(),listeners=new Set(),preferenceRevisions=new Map();let stopped=false;
  const scopeKey=scope=>{if(typeof scope!=='string'||!/^[a-zA-Z0-9:_-]{1,160}$/.test(scope))throw problem(403,'Sign in to use your shared clipboard.');return digest(scope);};
  const folder=scope=>directory&&path.join(directory,scopeKey(scope));
  const preferences=scope=>store.getValue(scope,'clipboard.preferences')||{};
  const unsubscribePreferences=store.subscribe(scope=>{const revision=store.readKey(scope,'clipboard.preferences').revision,previous=preferenceRevisions.get(scope)||0;preferenceRevisions.set(scope,revision);if(revision!==previous)for(const listener of listeners)try{listener(scope);}catch{}});
  function enabled(scope){return preferences(scope).enabled!==false;}
  async function load(scope){
    scopeKey(scope);if(latest.has(scope))return latest.get(scope);if(loading.has(scope))return loading.get(scope);
    const task=(async()=>{let value=null;if(directory)try{const file=path.join(folder(scope),'current.json'),stat=await fs.stat(file);if(stat.size<2*1024*1024){const parsed=JSON.parse(await fs.readFile(file,'utf8'));if(parsed.version===1&&parsed.value?.id&&['text','image','empty'].includes(parsed.value.kind))value=parsed.value;}}catch{}if(value)latest.set(scope,value);return value;})();loading.set(scope,task);try{return await task;}finally{loading.delete(scope);}
  }
  async function persist(scope,value){
    if(directory){const root=folder(scope);await fs.mkdir(root,{recursive:true,mode:0o700});const file=path.join(root,'current.json'),temp=path.join(root,'.current-'+crypto.randomUUID()+'.tmp');try{const handle=await fs.open(temp,'wx',0o600);try{await handle.writeFile(JSON.stringify({version:1,value}));await handle.sync();}finally{await handle.close();}await fs.rename(temp,file);}finally{await fs.unlink(temp).catch(()=>{});}}
    latest.set(scope,value);
  }
  async function storeImage(scope,bytes){
    const hash=digest(bytes);if(!directory){blobs.set(scopeKey(scope)+':'+hash,bytes);return hash;}
    const root=path.join(folder(scope),'images');await fs.mkdir(root,{recursive:true,mode:0o700});const file=path.join(root,hash+'.png');try{await fs.access(file);return hash;}catch{}const temp=path.join(root,'.'+crypto.randomUUID()+'.tmp');try{const handle=await fs.open(temp,'wx',0o600);try{await handle.writeFile(bytes);await handle.sync();}finally{await handle.close();}try{await fs.link(temp,file);}catch(error){if(error.code!=='EEXIST')throw error;}}finally{await fs.unlink(temp).catch(()=>{});}return hash;
  }
  async function image(scope,hash){
    scopeKey(scope);if(!/^[a-f0-9]{64}$/.test(hash))throw problem(404,'Picture is unavailable.');let bytes;if(directory){try{bytes=await fs.readFile(path.join(folder(scope),'images',hash+'.png'));}catch{throw problem(404,'Picture is unavailable.');}}else bytes=blobs.get(scopeKey(scope)+':'+hash);
    if(!bytes||bytes.length>MAX_IMAGE||digest(bytes)!==hash)throw problem(404,'Picture is unavailable.');return bytes;
  }
  function publicValue(scope,value,after){
    const revision=store.readKey(scope,'clipboard.current').revision;
    if(!value)return{ok:true,enabled:enabled(scope),images:preferences(scope).images!==false,account:scope,revision,changed:false};
    const {text,...metadata}=value;const changed=after!==revision;return{ok:true,enabled:enabled(scope),images:preferences(scope).images!==false,account:scope,revision,changed,...metadata,...changed&&value.kind==='text'&&{text},...value.kind==='image'&&{url:'/api/clipboard/image/'+value.hash}};
  }
  function snapshot(scope,{after}={}){scopeKey(scope);return serial(scope,async()=>publicValue(scope,await load(scope),after));}
  function serial(scope,work){const previous=queues.get(scope)||Promise.resolve(),next=previous.catch(()=>{}).then(work);queues.set(scope,next);return next.finally(()=>{if(queues.get(scope)===next)queues.delete(scope);});}
  function copy(scope,input,{source='Device',sourceId='device',applyToPC=true,history=true,activityLabel}={}){
    scopeKey(scope);return serial(scope,async()=>{
      if(stopped)throw problem(503,'Clipboard connection is stopping.');if(!enabled(scope))throw problem(409,'Shared clipboard is paused in Settings.');
      if(!input||!['text','image','empty'].includes(input.kind))throw problem(400,'Use text or a picture for the shared clipboard.');
      const id=input.id||crypto.randomUUID();if(typeof id!=='string'||!/^[-a-zA-Z0-9:.]{1,120}$/.test(id))throw problem(400,'Invalid clipboard identifier.');
      const kind=input.kind==='text'&&input.text===''?'empty':input.kind;let text='',bytes=null;
      if(kind==='text'){text=input.text;if(typeof text!=='string'||text.length>250000||text.includes('\0')||Buffer.from(text).toString('utf8')!==text)throw problem(400,'Use plain text up to 250,000 characters.');}
      if(kind==='image'){if(preferences(scope).images===false)throw problem(409,'Picture clipboard sync is off in Settings.');bytes=imageBytes(input.data);}
      const hash=digest(kind==='image'?bytes:Buffer.from(kind+':'+text)),eventId='clipboard-sync:'+id,existing=store.get(scope,eventId),previous=await load(scope);
      if(existing||previous?.id===id){if((existing?.payload.hash||previous.hash)!==hash)throw problem(409,'Clipboard identifier was already used.');return{...publicValue(scope,previous),duplicate:true};}
      const label=String(source).slice(0,80),deviceId=String(sourceId).slice(0,100),time=now();
      if(bytes)await storeImage(scope,bytes);
      if(applyToPC)await apply({kind,...kind==='text'&&{text},...bytes&&{data:bytes.toString('base64')},scope});
      const value={id,kind,hash,source:label,sourceId:deviceId,time,size:bytes?bytes.length:Buffer.byteLength(text),...kind==='text'&&{text},...bytes&&{mime:'image/png'},eventId};
      await persist(scope,value);
      if(history)store.record(scope,{id:eventId,type:'clipboard',action:kind==='image'?'clipboard.picture':kind==='empty'?'clipboard.cleared':'clipboard.copied',label:activityLabel||(kind==='image'?'Copied a picture on '+label:kind==='empty'?'Cleared the clipboard on '+label:'Copied text on '+label),device:label,text,payload:{kind,hash,size:value.size,sourceId:deviceId,...bytes&&{mime:'image/png'}}});
      const {text:fullText,...metadata}=value;store.patch(scope,{'clipboard.current':metadata});
      for(const listener of listeners)try{listener(scope);}catch{}
      return publicValue(scope,value);
    });
  }
  async function native(value,{device='PC',history=true}={}){
    if(value.local||!enabled('owner')||!['text','image','empty'].includes(value.kind)||value.kind==='image'&&!value.data)return;
    return copy('owner',{...value,id:'pc-'+value.id},{source:device,sourceId:'pc',applyToPC:false,history});
  }
  async function handle(req,res,{pathname,scope,role='owner',device='Device',sourceId='device',readJson,respond}={}){
    if(pathname!=='/api/clipboard/current'&&!pathname.startsWith('/api/clipboard/image/'))return false;
    const reply=(status,body)=>{respond(res,status,body);return true;};
    if(role!=='owner'||!scope)return reply(403,{error:'Sign in to your account to use its shared clipboard.'});
    if(req.headers['x-pcr-account']&&req.headers['x-pcr-account']!==scope)return reply(409,{error:'The signed-in account changed.',accountChanged:true});
    try{
      if(pathname.startsWith('/api/clipboard/image/')&&req.method==='GET'){
        const hash=pathname.slice('/api/clipboard/image/'.length),bytes=await image(scope,hash);res.writeHead(200,{'Content-Type':'image/png','Content-Length':bytes.length,'Cache-Control':'private, max-age=31536000, immutable',ETag:'"'+hash+'"'});res.end(bytes);return true;
      }
      if(req.headers['x-pcr']!=='1')return reply(403,{error:'Request header missing.'});
      if(pathname==='/api/clipboard/current'&&req.method==='GET'){const url=new URL(req.url,'http://localhost');return reply(200,await snapshot(scope,{after:url.searchParams.has('after')?Number(url.searchParams.get('after')):undefined}));}
      if(pathname==='/api/clipboard/current'&&req.method==='POST'){
        const body=await readJson(req,29*1024*1024);return reply(200,await copy(scope,body,{source:device,sourceId,history:store.getValue(scope,'history.preferences')?.clipboardCapture!==false}));
      }
      return reply(405,{error:'Clipboard action is unavailable.'});
    }catch(error){return reply(error.status||503,{error:error.status?error.message:'Clipboard sync could not finish. Reconnect and retry.'});}
  }
  return{copy,native,snapshot,image,enabled,handle,subscribe(listener){listeners.add(listener);return()=>listeners.delete(listener);},async close(){stopped=true;unsubscribePreferences();listeners.clear();await Promise.allSettled([...queues.values()]);}};
}
module.exports={createSharedClipboard,imageBytes,MAX_IMAGE};
