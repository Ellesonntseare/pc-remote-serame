'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const digest=subject=>crypto.createHash('sha256').update('google\0'+subject).digest('hex');
function createGoogleAccounts({file,now=Date.now}={}){
  let records=null,tail=Promise.resolve();
  async function load(){
    if(records)return;
    if(!file){records=new Map();return;}
    let data;try{const stat=await fs.stat(file);if(stat.size>8*1024*1024)throw Error('Account store is too large');data=JSON.parse(await fs.readFile(file,'utf8'));}catch(error){if(error.code==='ENOENT'){records=new Map();return;}throw Error('Google accounts could not be loaded. The PC owner must check the account store.');}
    if(!Array.isArray(data)||data.length>10000||data.some(r=>!r||!/^[a-f0-9]{64}$/.test(r.subjectHash)||!/^[a-f0-9]{32}$/.test(r.id)||typeof r.email!=='string'||r.email.length>320||!r.email.includes('@')||!Number.isFinite(r.createdAt)||!Number.isFinite(r.lastSignInAt)||r.pairedContext!==null&&!/^[a-f0-9]{64}$/.test(r.pairedContext)))throw Error('Google account data is invalid.');
    records=new Map(data.map(r=>[r.subjectHash,r]));
  }
  async function save(next){if(file){await fs.mkdir(path.dirname(file),{recursive:true});const temp=file+'.'+crypto.randomBytes(8).toString('hex')+'.tmp';try{await fs.writeFile(temp,JSON.stringify([...next.values()]),{mode:0o600,flag:'wx'});await fs.rename(temp,file);}finally{await fs.unlink(temp).catch(error=>{if(error.code!=='ENOENT')throw error;});}}records=next;}
  function mutate(work){const run=tail.then(async()=>{await load();return work();});tail=run.catch(()=>{});return run;}
  function publicAccount(record){return {id:record.id,email:record.email,createdAt:record.createdAt};}
  return {
    register(identity,{ownerContext}={}){return mutate(async()=>{
      if(identity?.provider!=='google'||typeof identity.subject!=='string'||!identity.subject||typeof identity.email!=='string'||identity.email.length>320||!identity.email.includes('@'))throw Error('A verified Google identity is required.');
      const key=digest(identity.subject),previous=records.get(key);if(!previous&&records.size>=10000)throw Object.assign(Error('This PC has reached its account limit.'),{status:429});
      const record={id:previous?.id||crypto.randomBytes(16).toString('hex'),subjectHash:key,email:identity.email.toLowerCase(),createdAt:previous?.createdAt||now(),lastSignInAt:now(),pairedContext:ownerContext||previous?.pairedContext||null},next=new Map(records);next.set(key,record);await save(next);
      return {profile:publicAccount(record),created:!previous,pairedContext:record.pairedContext};
    });},
    pair(identity,context){return mutate(async()=>{if(!/^[a-f0-9]{64}$/.test(context))throw Error('Invalid PC pairing');const key=digest(identity.subject),record=records.get(key);if(!record)throw Error('Create your Google account before pairing a PC.');const next=new Map(records),updated={...record,pairedContext:context};next.set(key,updated);await save(next);return publicAccount(updated);});},
    async close(){await tail;}
  };
}
module.exports={createGoogleAccounts};
