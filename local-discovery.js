'use strict';
const crypto=require('node:crypto');
function advertise(server,{name='PC Remote',identity='',enabled=true,BonjourImpl}={}){
  let service=null,bonjour=null;
  function stop(){try{service?.stop();bonjour?.destroy();}catch{}service=bonjour=null;}
  function start(){if(!enabled||bonjour)return;try{const Bonjour=BonjourImpl||require('bonjour-service').Bonjour;bonjour=new Bonjour({},()=>{});const address=server.address();if(!address||typeof address==='string')return stop();service=bonjour.publish({name:String(name).slice(0,48)+' · PC Remote',type:'pcremote',protocol:'tcp',disableIPv6:true,port:address.port,txt:{app:'pc-remote',version:'1',id:crypto.createHash('sha256').update(identity).digest('hex').slice(0,24)}});service.on('error',()=>{});}catch{stop();}}
  server.once('listening',start);server.once('close',stop);return {stop};
}
module.exports={advertise};
