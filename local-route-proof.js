'use strict';
const crypto=require('node:crypto');
const fs=require('node:fs');
function createLocalRouteProof(identityFile){let pair=null;
 function load(){
  if(pair)return pair;
  if(identityFile){
   try{const privateKey=crypto.createPrivateKey(fs.readFileSync(identityFile));return pair={privateKey,publicKey:crypto.createPublicKey(privateKey)};}
   catch(error){if(error.code!=='ENOENT')throw error;}
  }
  const generated=crypto.generateKeyPairSync('rsa',{modulusLength:2048});
  if(identityFile){
   try{fs.writeFileSync(identityFile,generated.privateKey.export({type:'pkcs8',format:'pem'}),{flag:'wx',mode:0o600});}
   catch(error){if(error.code==='EEXIST')return load();throw error;}
  }
  return pair=generated;
 }
 function key(){return {publicKey:load().publicKey.export({type:'spki',format:'der'}).toString('base64')};}
 function proof(nonce,origin,{allowInit=false}={}){
  if(!/^[a-f0-9]{64}$/.test(nonce)||!/^http:\/\/(?:\d{1,3}\.){3}\d{1,3}:\d{1,5}$|^https:\/\/[a-z0-9.-]{1,253}$/.test(origin))throw Error('Invalid connection check.');
  if(!pair&&!allowInit)throw Error('Start a local connection check from the signed-in app.');
  const {privateKey}=load();
  return {nonce,origin,signature:crypto.sign('sha256',Buffer.from('EllesonConnectLocal/v1|'+nonce+'|'+origin),privateKey).toString('base64')};
 }
 return {key,proof};
}
module.exports={createLocalRouteProof};
