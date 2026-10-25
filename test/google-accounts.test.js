'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),{createGoogleAccounts}=require('../google-accounts');
const owner={provider:'google',subject:'stable-google-id',email:'person@gmail.com'},context='a'.repeat(64);
test('Google registration persists one account per Google identity and later sign-ins retain its PC pairing',async t=>{
  const directory=await fs.mkdtemp(path.join(__dirname,'.transfer-check-')),file=path.join(directory,'accounts.json');t.after(async()=>{assert.equal(path.dirname(directory),__dirname);await fs.rm(directory,{recursive:true,force:true});});
  let store=createGoogleAccounts({file});const first=await store.register(owner);assert.equal(first.created,true);assert.equal(first.pairedContext,null);
  await store.pair(owner,context);store=createGoogleAccounts({file});const returning=await store.register({...owner,email:'updated@gmail.com'});assert.equal(returning.created,false);assert.equal(returning.profile.id,first.profile.id);assert.equal(returning.profile.email,'updated@gmail.com');assert.equal(returning.pairedContext,context);
  const other=await store.register({...owner,subject:'different-google-id',email:'person@gmail.com'});assert.notEqual(other.profile.id,first.profile.id);assert.equal(other.pairedContext,null);
  assert.ok(!(await fs.readFile(file,'utf8')).includes('stable-google-id'),'persist only a hash of the provider subject');
});
test('simultaneous Google signups do not lose accounts or create duplicate identities',async()=>{
  const store=createGoogleAccounts(),results=await Promise.all(Array.from({length:12},(_,i)=>store.register({...owner,subject:'google-'+i})));assert.equal(new Set(results.map(r=>r.profile.id)).size,12);
  const repeats=await Promise.all(Array.from({length:5},()=>store.register(owner)));assert.equal(new Set(repeats.map(r=>r.profile.id)).size,1);assert.equal(repeats.filter(r=>r.created).length,1);
});
