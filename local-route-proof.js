'use strict';
const crypto=require('node:crypto');
function createLocalRouteProof(){let pair=null;
 function key(){if(!pair)pair=crypto.generateKeyPairSync('rsa',{modulusLength:2048});return {publicKey:pair.publicKey.export({type:'spki',format:'der'}).toString('base64')};}
 function proof(nonce,origin){if(!pair||!/^[a-f0-9]{64}$/.test(nonce)||!/^http:\/\/(?:\d{1,3}\.){3}\d{1,3}:\d{1,5}$/.test(origin))throw Error('Start a local connection check from the signed-in app.');return {nonce,origin,signature:crypto.sign('sha256',Buffer.from('EllesonConnectLocal/v1|'+nonce+'|'+origin),pair.privateKey).toString('base64')};}
 return {key,proof};
}
module.exports={createLocalRouteProof};
