'use strict';
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
function pcLocations(extra=[]){
  const home=os.homedir();let cloud;try{if(path.resolve(home).toLowerCase()===path.resolve(os.userInfo().homedir).toLowerCase())cloud=process.env.OneDriveConsumer||process.env.OneDrive;}catch{}
  const known=name=>{const synced=cloud&&path.join(cloud,name);return synced&&fs.existsSync(synced)?synced:path.join(home,name);};
  return [{id:'@desktop',label:'Desktop',directory:known('Desktop')},{id:'@downloads',label:'Downloads',directory:path.join(home,'Downloads')},{id:'@documents',label:'Documents',directory:known('Documents')},{id:'@pictures',label:'Pictures',directory:known('Pictures')},{id:'@music',label:'Music',directory:known('Music')},{id:'@videos',label:'Videos',directory:known('Videos')},...(Array.isArray(extra)?extra:[]).slice(0,16)];
}
function createLocationProvider({native,fallback=()=>[],now=Date.now}={}){
  let cached=null,at=0,pending=null;
  return async()=>{
    const base=await fallback();if(cached&&now()-at<60000)return merge(cached,base);
    if(!pending)pending=Promise.resolve().then(()=>native()).then(value=>{if(!value?.ok||!Array.isArray(value.locations))throw Error('Locations unavailable');cached=value.locations;at=now();}).catch(()=>{at=now();cached=cached||[];}).finally(()=>pending=null);
    await pending;return merge(cached,base);
  };
  function merge(real,base){const result=[],ids=new Set(),paths=new Set();for(const item of [...real,...(Array.isArray(base)?base:[])]){if(!item||typeof item.directory!=='string')continue;const key=path.resolve(item.directory).replace(/[\\/]+$/,'').toLowerCase();if(ids.has(item.id)||paths.has(key))continue;ids.add(item.id);paths.add(key);result.push(item);}return result;}
}
module.exports={pcLocations,createLocationProvider};
