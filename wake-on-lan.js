'use strict';
const os=require('node:os'),dgram=require('node:dgram');
function packet(mac){if(typeof mac!=='string'||!/^([0-9a-f]{2}[:-]){5}[0-9a-f]{2}$/i.test(mac))throw Error('Enter a valid MAC address.');const bytes=Buffer.from(mac.replace(/[:-]/g,''),'hex');if(bytes.every(x=>x===0)||bytes.every(x=>x===255)||bytes[0]&1)throw Error('Choose a device network adapter MAC address.');return Buffer.concat([Buffer.alloc(6,255),...Array.from({length:16},()=>bytes)]);}
function networks(){return Object.entries(os.networkInterfaces()).flatMap(([name,entries])=>(entries||[]).filter(n=>n.family==='IPv4'&&!n.internal).map(n=>({name,address:n.address,mac:n.mac,broadcast:n.address.split('.').map((x,i)=>Number(x)|(255-Number(n.netmask.split('.')[i]))).join('.')})));}
async function wake(mac,broadcast,send){const bytes=packet(mac);if(!['255.255.255.255',...networks().map(n=>n.broadcast)].includes(broadcast))throw Error('Choose a local network broadcast address.');if(send){await send(bytes,broadcast,9);return;}
  await new Promise((resolve,reject)=>{const socket=dgram.createSocket('udp4');const timeout=setTimeout(()=>done(Error('Wake signal timed out.')),2000);let finished=false;function done(error){if(finished)return;finished=true;clearTimeout(timeout);try{socket.close();}catch{}error?reject(error):resolve();}socket.on('error',done);socket.bind(0,()=>{socket.setBroadcast(true);socket.send(bytes,9,broadcast,error=>done(error));});});
}
module.exports={packet,networks,wake};
