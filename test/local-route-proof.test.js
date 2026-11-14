'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto'),{createLocalRouteProof}=require('../local-route-proof');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
test('fast-local probes bind the current host key, a fresh nonce and the actual local endpoint',()=>{const service=createLocalRouteProof(),nonce='a'.repeat(64),origin='http://192.168.8.100:7666';assert.throws(()=>service.proof(nonce,origin));const {publicKey}=service.key(),proof=service.proof(nonce,origin),key=crypto.createPublicKey({key:Buffer.from(publicKey,'base64'),type:'spki',format:'der'}),verify=(n,o)=>crypto.verify('sha256',Buffer.from('EllesonConnectLocal/v1|'+n+'|'+o),key,Buffer.from(proof.signature,'base64'));assert.equal(verify(nonce,origin),true);assert.equal(verify('b'.repeat(64),origin),false);assert.equal(verify(nonce,'http://192.168.8.101:7666'),false);assert.throws(()=>service.proof('../not-a-nonce',origin));});
test('both routes share the same identity across host restarts',t=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'pcr-route-proof-'));
 t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
 const identity=path.join(directory,'identity.pem'),initial=createLocalRouteProof(identity);
 const {publicKey}=initial.key(),key=crypto.createPublicKey({key:Buffer.from(publicKey,'base64'),type:'spki',format:'der'});
 const restarted=createLocalRouteProof(identity),nonce='d'.repeat(64);
 const local='http://192.168.8.100:7666',website='https://connect.example.test';
 const verifies=(origin,signature)=>crypto.verify('sha256',Buffer.from('EllesonConnectLocal/v1|'+nonce+'|'+origin),key,Buffer.from(signature,'base64'));
 assert.equal(verifies(website,restarted.proof(nonce,website,{allowInit:true}).signature),true);
 const localProof=restarted.proof(nonce,local);
 assert.equal(verifies(local,localProof.signature),true);
 assert.equal(verifies(website,localProof.signature),false);
 assert.deepEqual(restarted.key(),{publicKey});
});
