'use strict';
// Bound shell work and cache small previews; never read whole originals into the web UI.
function createThumbnails(provider){
  const cache=new Map(),pending=new Map(),queue=[];let running=0,closed=false;
  function pump(){while(!closed&&running<2&&queue.length){const job=queue.shift();running++;Promise.resolve().then(()=>provider(job.file)).then(value=>{
    const bytes=Buffer.from(value?.data||'','base64');if(bytes.length<8||bytes.length>256*1024||!bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))throw Error('Invalid Windows preview.');
    cache.set(job.key,bytes);while(cache.size>80)cache.delete(cache.keys().next().value);job.resolve(bytes);
  }).catch(job.reject).finally(()=>{pending.delete(job.key);running--;pump();});}}
  return {get(file,stamp){if(closed||!provider)return Promise.reject(Error('Preview unavailable.'));const key=file+'\0'+stamp;if(cache.has(key)){const value=cache.get(key);cache.delete(key);cache.set(key,value);return Promise.resolve(value);}if(pending.has(key))return pending.get(key);if(queue.length>=32)return Promise.reject(Error('Previews busy.'));const value=new Promise((resolve,reject)=>queue.push({file,key,resolve,reject}));pending.set(key,value);pump();return value;},close(){closed=true;cache.clear();for(const job of queue.splice(0)){pending.delete(job.key);job.reject(Error('Previews stopped.'));}}};
}
module.exports={createThumbnails};
