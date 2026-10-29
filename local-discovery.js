'use strict';
const crypto=require('node:crypto');
function advertise(server,{name='Elleson Connect',identity='',enabled=true,BonjourImpl}={}){
  let service=null,bonjour=null;
  function stop(){try{service?.stop();bonjour?.destroy();}catch{}service=bonjour=null;}
  function label(value){let result='';for(const char of String(value)){if(Buffer.byteLength(result+char+' · Elleson Connect')>63)break;result+=char;}return result+' · Elleson Connect';}
  function start(){if(!enabled||bonjour)return;try{const Bonjour=BonjourImpl||require('bonjour-service').Bonjour;bonjour=new Bonjour({},()=>{});const address=server.address();if(!address||typeof address==='string')return stop();service=bonjour.publish({name:label(name),type:'pcremote',protocol:'tcp',disableIPv6:true,port:address.port,txt:{app:'pc-remote',version:'1',id:crypto.createHash('sha256').update(identity).digest('hex').slice(0,24)}});service.on('error',()=>{});}catch{stop();}}
  server.once('listening',start);server.once('close',stop);return {stop,rename(value){name=value;stop();start();}};
}
module.exports={advertise};
