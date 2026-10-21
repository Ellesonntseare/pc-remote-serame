'use strict';
const crypto=require('node:crypto');
function createHandoffs({now=Date.now}={}){
  const entries=new Map();
  const prune=()=>{for(const[code,item]of entries)if(item.until<=now())entries.delete(code);};
  return {create(source){prune();for(const[code,item]of entries)if(item.source===source)entries.delete(code);if(entries.size>=20)throw Error('Too many pending handoffs. Try again shortly.');const code=crypto.randomBytes(6).toString('hex').toUpperCase();const entry={source,until:now()+120000,claimed:false};entries.set(code,entry);return{code,until:entry.until};},claim(code,target){prune();const item=entries.get(code);if(!item||item.claimed||item.source===target)return null;item.claimed=true;return {mode:'remote-screen'};},status(code,source){prune();const item=entries.get(code);return item?.source===source?{claimed:item.claimed,until:item.until}:null;},clear(){entries.clear();}};
}
module.exports={createHandoffs};
