'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{spawnSync}=require('node:child_process'),{AccessUnits,describe}=require('../native-video');
test('Annex B framing survives split start codes and reports independently decodable keyframes',()=>{
  const encoded=spawnSync(require('ffmpeg-static'),['-hide_banner','-loglevel','error','-f','lavfi','-i','testsrc2=size=640x360:rate=12','-frames:v','15','-c:v','libx264','-preset','ultrafast','-tune','zerolatency','-profile:v','baseline','-g','12','-bf','0','-x264-params','aud=1:repeat-headers=1','-f','h264','pipe:1'],{maxBuffer:8*1024*1024,windowsHide:true});assert.equal(encoded.status,0,encoded.stderr?.toString());
  const frames=[],reader=new AccessUnits(frame=>frames.push(Buffer.from(frame))),bytes=Buffer.concat([encoded.stdout,Buffer.from([0,0,0,1,9,0xf0])]);for(let offset=0;offset<bytes.length;){const length=Math.min(1+(offset%347),bytes.length-offset);reader.push(bytes.subarray(offset,offset+length));offset+=length;}assert.equal(frames.length,15);const first=describe(frames[0]);assert.equal(first.key,true);assert.match(first.codec,/^avc1\.[a-f0-9]{6}$/);assert.ok(frames.slice(1).some(frame=>!describe(frame).key));assert.ok(frames.slice(1).some(frame=>describe(frame).key));
});
test('unfinished video packets are bounded before reaching a browser decoder',()=>{const reader=new AccessUnits(()=>{});assert.throws(()=>reader.push(Buffer.alloc(8*1024*1024+1)),/limit/);assert.deepEqual(describe(Buffer.from([0,0,1,1,0,0,0,0])),{key:false,codec:null});});

test('smooth window sessions send the selected source and reject invalid selections before connecting',()=>{
  const {NativeVideoSession}=require('../public/native-video'),urls=[],states=[],previous=globalThis.isSecureContext;globalThis.isSecureContext=true;
  const viewer=new NativeVideoSession({Decoder:class{},Chunk:class{},Socket:class{constructor(url){urls.push(url);}close(){}},location:{protocol:'https:',host:'pc.test'},onState:state=>states.push(state)});
  try{assert.equal(viewer.start('smooth',{windowId:'a'.repeat(24)}),true);assert.equal(urls[0],'wss://pc.test/api/native-video?p=smooth&window='+'a'.repeat(24));assert.equal(viewer.start('smooth',{windowId:'raw-window-handle'}),false);assert.equal(urls.length,1);assert.equal(states.at(-1).state,'error');}finally{viewer.stop(true);if(previous===undefined)delete globalThis.isSecureContext;else globalThis.isSecureContext=previous;}
});
