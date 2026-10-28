'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {createLocationProvider}=require('../pc-locations');
test('real Windows locations override guessed paths, include pinned folders and drives, and share native lookup',async()=>{
  let time=100000,calls=0,complete;const local=path.resolve('test'),get=createLocationProvider({now:()=>time,fallback:()=>[{id:'@desktop',label:'Desktop',directory:path.join(local,'guessed')},{id:'@custom',label:'Work',directory:path.join(local,'work')}],native:()=>{calls++;return new Promise(resolve=>complete=resolve);}});const first=get(),second=get();await new Promise(setImmediate);assert.equal(calls,1);complete({ok:true,locations:[{id:'@desktop',label:'Desktop',directory:path.join(local,'actual')},{id:'@pin-note',label:'Notes',directory:path.join(local,'notes'),kind:'pinned'},{id:'@drive-c',label:'Local Disk (C:)',directory:path.resolve('/'),kind:'drive',capacity:{total:100,free:60}}]});const [a,b]=await Promise.all([first,second]);assert.deepEqual(a,b);assert.equal(a[0].directory,path.join(local,'actual'));assert.equal(a.length,4);await get();assert.equal(calls,1);time+=61000;const next=get();await new Promise(setImmediate);assert.equal(calls,2);complete({ok:true,locations:[]});assert.equal((await next).length,2);
});
test('an unavailable native folder catalogue retains filesystem fallback without repeated startup requests',async()=>{
  let calls=0;const get=createLocationProvider({fallback:()=>[{id:'@downloads',label:'Downloads',directory:path.resolve('test')}],native:async()=>{calls++;throw Error('Not available');}});assert.equal((await get())[0].id,'@downloads');await get();assert.equal(calls,1);
});
