'use strict';
const crypto=require('node:crypto');
const {guestPermissions}=require('./guest-permissions');
const digest=value=>crypto.createHash('sha256').update(value).digest('hex');
function createGuestRequests({now=Date.now,lifetime=5*60*1000}={}){
  const requests=new Map();
  function prune(){for(const [id,request]of requests)if(request.until<=now())requests.delete(id);}
  function begin({ip,device,existingSecret}){
    prune();
    if(typeof existingSecret==='string')for(const request of requests.values())if(request.key===digest(existingSecret)&&request.ip===ip&&request.state==='pending')return {id:request.id,secret:existingSecret,until:request.until};
    if(requests.size>=24){const error=Error('There are too many guest requests. Try again shortly.');error.status=429;throw error;}
    const id=crypto.randomBytes(16).toString('hex'),secret=crypto.randomBytes(32).toString('hex');
    requests.set(id,{id,key:digest(secret),ip,device:String(device||'Guest browser').replace(/[\x00-\x1f]/g,'').slice(0,180),created:now(),until:now()+lifetime,state:'pending'});
    return {id,secret,until:now()+lifetime};
  }
  function find(secret,ip){prune();if(typeof secret!=='string'||!/^[a-f0-9]{64}$/.test(secret))return null;const key=digest(secret);return Array.from(requests.values()).find(r=>r.key===key&&r.ip===ip)||null;}
  function pending(){prune();return Array.from(requests.values()).filter(r=>r.state==='pending').map(({id,device,created,until})=>({id,device,created,until}));}
  function decide(id,approve,permissions){prune();const request=requests.get(id);if(!request||request.state!=='pending')return false;const selected=approve?guestPermissions(permissions):null;request.state=approve?'approved':'denied';request.permissions=selected;return true;}
  function consume(secret,ip){const request=find(secret,ip);if(request?.state!=='approved')return null;requests.delete(request.id);return {id:request.id,device:request.device,permissions:request.permissions};}
  function cancel(secret,ip){const request=find(secret,ip);if(request)requests.delete(request.id);}
  function clear(){requests.clear();}
  return {begin,find,pending,decide,consume,cancel,clear};
}
module.exports={createGuestRequests};
