'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{saveDeviceName}=require('../host-settings');
test('saving a PC nickname preserves unrelated configuration and leaves valid JSON with no temporary file',t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'pc-host-name-'));t.after(()=>{assert.equal(path.dirname(root),os.tmpdir());assert.ok(path.basename(root).startsWith('pc-host-name-'));fs.rmSync(root,{recursive:true,force:true});});
  const before={password:'fixture-only',googleSignIn:{clientSecret:'fixture-only-secret'},fileLocations:['D:/Work'],allowLan:false};fs.writeFileSync(path.join(root,'config.json'),JSON.stringify(before));saveDeviceName(root,'  Office PC  ');assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root,'config.json'),'utf8')),{...before,deviceName:'Office PC'});assert.equal(fs.existsSync(path.join(root,'config.json.tmp')),false);
  const saved=fs.readFileSync(path.join(root,'config.json'),'utf8');for(const value of ['', 'x'.repeat(81),'bad\nname'])assert.throws(()=>saveDeviceName(root,value),/Invalid/);assert.equal(fs.readFileSync(path.join(root,'config.json'),'utf8'),saved);
});
