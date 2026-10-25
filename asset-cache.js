'use strict';
const fs=require('node:fs/promises'),crypto=require('node:crypto'),{gzip}=require('node:zlib'),{promisify}=require('node:util');
const compress=promisify(gzip);
function acceptsGzip(value){return String(value||'').split(',').some(part=>{const [name,...options]=part.trim().toLowerCase().split(';');if(name.trim()!=='gzip')return false;const quality=options.find(option=>/^\s*q\s*=/.test(option));return !quality||Number(quality.split('=')[1])>0;});}
// Only the server's explicit public asset allowlist enters this cache.
function createAssetCache(){
  const entries=new Map();
  async function read(file){
    const stat=await fs.stat(file,{bigint:true}),version=stat.size+':'+stat.mtimeNs+':'+stat.ctimeNs;
    const previous=entries.get(file);if(previous?.version===version)return previous.pending;
    const pending=fs.readFile(file).then(body=>({body,tag:crypto.createHash('sha256').update(body).digest('base64url'),compressed:null}));
    const entry={version,pending};entries.set(file,entry);while(entries.size>96)entries.delete(entries.keys().next().value);
    try{return await pending;}catch(error){if(entries.get(file)===entry)entries.delete(file);throw error;}
  }
  async function get(file,type,encoding){
    const source=await read(file),zipped=source.body.length>1024&&/^(text\/|image\/svg\+xml)/.test(type)&&acceptsGzip(encoding);
    if(!zipped)return {body:source.body,etag:'"'+source.tag+'"'};
    if(!source.compressed)source.compressed=compress(source.body,{level:6}).catch(error=>{source.compressed=null;throw error;});
    return {body:await source.compressed,etag:'"'+source.tag+'-gzip"',encoding:'gzip'};
  }
  return {get,clear:()=>entries.clear()};
}
module.exports={createAssetCache,acceptsGzip};
