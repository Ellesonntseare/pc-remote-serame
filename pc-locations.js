'use strict';
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
function pcLocations(extra=[]){
  const home=os.homedir();let cloud;try{if(path.resolve(home).toLowerCase()===path.resolve(os.userInfo().homedir).toLowerCase())cloud=process.env.OneDriveConsumer||process.env.OneDrive;}catch{}
  const known=name=>{const synced=cloud&&path.join(cloud,name);return synced&&fs.existsSync(synced)?synced:path.join(home,name);};
  return [{id:'@desktop',label:'Desktop',directory:known('Desktop')},{id:'@documents',label:'Documents',directory:known('Documents')},{id:'@downloads',label:'Downloads',directory:path.join(home,'Downloads')},...(Array.isArray(extra)?extra:[]).slice(0,16)];
}
module.exports={pcLocations};
