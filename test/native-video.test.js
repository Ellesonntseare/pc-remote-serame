'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{spawnSync}=require('node:child_process'),{AccessUnits,describe}=require('../native-video');
test('capture cursor messages survive stderr chunking and ignore logs, malformed markers and oversized lines',()=>{
  const {CursorModeReader}=require('../native-video'),states=[],reader=new CursorModeReader(value=>states.push(value));for(const text of ['Capture: DXGI\nPCR_CUR','SOR:1\r\nPCR_CURSOR:','0\nPCR_CURSOR:true\n','x'.repeat(300),'PCR_CURSOR:1\n','PCR_CURSOR:1\n'])reader.push(Buffer.from(text));assert.deepEqual(states,[true,false,true]);assert.equal(reader.buffer.length,0);
});

test('native video keeps cursor ownership through format changes and clears it for a new connection',t=>{
  const {NativeVideoSession}=require('../public/native-video'),old=globalThis.isSecureContext;globalThis.isSecureContext=true;let socket;const frames=[];
  class Decoder{constructor({output}){this.output=output;}configure(){}close(){}}
  const viewer=new NativeVideoSession({Decoder,Chunk:class{},Socket:class{constructor(){socket=this;}close(){}},location:{protocol:'https:',host:'pc.test'},onFrame:(_frame,metadata)=>frames.push(metadata.cursorEmbedded)});t.after(()=>{viewer.stop(true);if(old===undefined)delete globalThis.isSecureContext;else globalThis.isSecureContext=old;});
  const message=value=>socket.onmessage({data:JSON.stringify(value)}),format={type:'format',codec:'avc1.42e01f',width:1280,height:720};viewer.start();message({type:'cursor',embedded:true});message(format);viewer.decoder.output({close(){}});assert.deepEqual(frames,[true]);message({type:'cursor',embedded:false});viewer.decoder.output({close(){}});message(format);viewer.decoder.output({close(){}});assert.deepEqual(frames,[true,false,false]);viewer.start();message(format);viewer.decoder.output({close(){}});assert.equal(frames.at(-1),undefined,'old ownership must not hide the new stream cursor');
});
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
