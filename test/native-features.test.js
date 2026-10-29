'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events'),{PassThrough}=require('node:stream');
const {createNativeFeatures,AudioPacketReader,validFormat}=require('../native-features');
const format={type:'format',encoding:'f32le',sampleRate:48000,channels:2,source:'system-output'};
function packet(type,data){if(!Buffer.isBuffer(data))data=Buffer.from(JSON.stringify(data));const header=Buffer.alloc(5);header[0]=type;header.writeUInt32BE(data.length,1);return Buffer.concat([header,data]);}
function fakeChild(){const child=new EventEmitter();child.stdin=new PassThrough();child.stdout=new PassThrough();child.stderr=new PassThrough();child.killed=false;child.kill=()=>{child.killed=true;queueMicrotask(()=>child.emit('close',0));};return child;}
function fixture(){const calls=[];let current=1000;const service=createNativeFeatures({root:process.cwd(),platform:'win32',fsImpl:{existsSync:()=>true},now:()=>current,spawnImpl:(file,args,options)=>{const child=fakeChild();calls.push({file,args,options,child});return child;}});return {service,calls,advance(ms){current+=ms;}};}

test('screen-edge helper starts with validated geometry, accepts bounded events and releases on stop',()=>{
  const f=fixture(),events=[];assert.throws(()=>f.service.openPhoneInput({side:'unknown',width:1080,height:2400}),/arrangement/);assert.equal(f.calls.length,0);
  const session=f.service.openPhoneInput({side:'left',width:1080,height:2400,sensitivity:1.2,onEvent:event=>events.push(event)}),call=f.calls[0];
  assert.deepEqual(call.args,['--phone-handoff']);assert.equal(call.options.windowsHide,true);assert.equal(call.options.shell,undefined);
  call.child.stdout.write('{"kind":"state","state":"armed"}\n{"kind":"text","text":"fixture"}\n');assert.equal(events.length,2);
  call.child.stdout.write(JSON.stringify({kind:'files',paths:['C:\\Documents\\Original photo.png']})+'\n');assert.equal(events.at(-1).paths[0],'C:\\Documents\\Original photo.png');
  session.update({side:'top',width:2400,height:1080,sensitivity:.8});session.release();session.stop();call.child.emit('close',0);f.service.close();
});

test('phone audio output waits for native readiness, frames exact PCM/control bytes and stops with the service',async()=>{
  const f=fixture();let ready=0,closed=0;const output=f.service.openAudioOutput({sampleRate:48000,channels:1,volume:.4,onReady:()=>ready++,onClose:()=>closed++}),child=f.calls[0].child;assert.deepEqual(f.calls[0].args,['--audio-playback']);assert.equal(output.sendPcm(Buffer.from([1,2])),false);child.stdout.write('{"type":"sta');child.stdout.write('rted"}\n');assert.equal(ready,1);const pcm=Buffer.from([0,0,255,127]);output.sendPcm(pcm);output.setVolume(.25);output.stop();const chunks=[];for await(const chunk of child.stdin)chunks.push(chunk);const all=Buffer.concat(chunks),line=all.indexOf(10);assert.deepEqual(JSON.parse(all.subarray(0,line)),{sampleRate:48000,channels:1,volume:.4});let at=line+1;assert.equal(all[at],0);assert.deepEqual(all.subarray(at+5,at+5+all.readUInt32BE(at+1)),pcm);at+=5+pcm.length;assert.equal(all[at],1);const length=all.readUInt32BE(at+1);assert.deepEqual(JSON.parse(all.subarray(at+5,at+5+length)),{volume:.25});at+=5+length;assert.equal(all[at],2);child.emit('close',0);assert.equal(closed,1);f.service.close();
});

test('media actions launch only the fixed native mode and reject arbitrary input before launch',async()=>{
  const f=fixture();for(const action of ['volup','voldown','mute','playpause','next','prev']){const pending=f.service.sendMedia(action),call=f.calls.at(-1);assert.deepEqual(call.args,['--media']);assert.equal(call.options.windowsHide,true);const chunks=[];for await(const chunk of call.child.stdin)chunks.push(chunk);assert.deepEqual(JSON.parse(Buffer.concat(chunks)),{action});call.child.stdout.end('{"ok":true,"volume":51}');call.child.emit('close',0);assert.equal((await pending).volume,51);}await assert.rejects(f.service.sendMedia('shutdown'),/Invalid media/);assert.equal(f.calls.length,6);f.service.close();
});
test('audio framing survives arbitrary partial/coalesced reads and enforces packet bounds',()=>{
  const seen=[],reader=new AudioPacketReader((type,data)=>seen.push([type,Buffer.from(data)])),pcm=Buffer.alloc(64),all=Buffer.concat([packet(1,format),packet(0,pcm)]);
  for(let i=0;i<all.length;i+=3)reader.push(all.subarray(i,i+3));reader.end();assert.deepEqual(seen.map(value=>value[0]),[1,0]);assert.deepEqual(JSON.parse(seen[0][1]),format);assert.deepEqual(seen[1][1],pcm);
  const bad=Buffer.alloc(5);bad[0]=0;bad.writeUInt32BE(999999,1);assert.throws(()=>new AudioPacketReader(()=>{}).push(bad),/Invalid/);
  const incomplete=new AudioPacketReader(()=>{});incomplete.push(Buffer.from([1]));assert.throws(()=>incomplete.end(),/incomplete/);
});
test('PC links pass validated URLs as JSON to a fixed helper mode without shell interpolation',async()=>{
  const f=fixture();
  for(const bad of ['file:///C:/Windows','javascript:alert(1)','https://name:secret@example.com','https://example.com/a\ncalc.exe','https://example.com/ a'])await assert.rejects(f.service.openLink(bad),/valid http/);
  assert.equal(f.calls.length,0);
  const pending=f.service.openLink('https://example.com/?text=%22%26calc.exe'),call=f.calls[0];assert.deepEqual(call.args,['--open-link']);assert.equal(call.options.shell,undefined);
  const chunks=[];for await(const chunk of call.child.stdin)chunks.push(chunk);assert.deepEqual(JSON.parse(Buffer.concat(chunks)),{url:'https://example.com/?text=%22%26calc.exe'});
  call.child.stdout.end('{"ok":true}');call.child.emit('close',0);assert.deepEqual(await pending,{ok:true});f.service.close();
});
test('audio rejects microphone formats and invalid sample configurations',()=>{
  assert.equal(validFormat(format),true);for(const bad of [{...format,source:'microphone'},{...format,encoding:'pcm16'},{...format,channels:8},{...format,sampleRate:0}])assert.equal(!!validFormat(bad),false);
});
test('app handles remain private, arbitrary selectors never launch helpers, and selections expire',async()=>{
  const f=fixture(),list=f.service.listApps(),app={handle:'123abc',pid:42,startTicks:'638750000000000000',title:'Sample app',processName:'Sample',active:true,minimized:false};
  f.calls[0].child.stdout.end(JSON.stringify({ok:true,apps:[app]}));f.calls[0].child.emit('close',0);const result=await list;
  assert.equal(result.apps.length,1);const entry=result.apps[0];assert.match(entry.id,/^[A-Za-z0-9_-]{24}$/);assert.equal(entry.handle,undefined);assert.equal(entry.pid,undefined);
  await assert.rejects(f.service.focusApp('123abc'),/expired/);assert.equal(f.calls.length,1);
  const focusing=f.service.focusApp(entry.id),focusCall=f.calls[1];assert.deepEqual(focusCall.args,['--app-focus']);
  const sent=[];for await(const chunk of focusCall.child.stdin)sent.push(chunk);assert.deepEqual(JSON.parse(Buffer.concat(sent)),{handle:app.handle,pid:app.pid,startTicks:app.startTicks});
  focusCall.child.stdout.end('{"ok":true}');focusCall.child.emit('close',0);assert.deepEqual(await focusing,{ok:true});
  f.advance(120001);await assert.rejects(f.service.focusApp(entry.id),/expired/);assert.equal(f.calls.length,2);f.service.close();
});
test('helper failures reject cleanly without shell execution',async()=>{
  const f=fixture(),promise=f.service.listApps();assert.equal(f.calls[0].options.shell,undefined);assert.equal(f.calls[0].options.windowsHide,true);
  f.calls[0].child.stdout.end('{"ok":false,"error":"Desktop locked"}');f.calls[0].child.emit('close',1);await assert.rejects(promise,/Desktop locked/);f.service.close();
});

test('presentation selections retain the exact process identity and remain usable beyond the menu expiry',async()=>{
  const f=fixture(),pending=f.service.listApps(),app={handle:'123abc',pid:42,startTicks:'638750000000000000',title:'Slides',processName:'chrome'};
  f.calls[0].child.stdout.end(JSON.stringify({ok:true,apps:[app]}));f.calls[0].child.emit('close',0);const id=(await pending).apps[0].id;
  assert.throws(()=>f.service.presentationApp('123abc'),/expired/);const selected=f.service.presentationApp(id);assert.deepEqual(selected,{handle:app.handle,pid:app.pid,startTicks:app.startTicks});selected.handle='wrong';f.advance(120001);assert.equal(f.service.presentationApp(id).handle,app.handle);assert.equal(f.calls.length,1,'starting a window stream never runs an arbitrary command');f.advance(6*60*60*1000+1);assert.throws(()=>f.service.presentationApp(id),/expired/);f.service.close();
});
test('audio streams only after validated metadata and stops capture when the consumer stops',()=>{
  const f=fixture(),metadata=[],pcm=[],errors=[];let closed=0;
  const session=f.service.openAudio({onMetadata:value=>metadata.push(value),onPcm:value=>pcm.push(Buffer.from(value)),onError:error=>errors.push(error.message),onClose:()=>closed++});
  const child=f.calls[0].child;child.stdout.write(packet(1,format));child.stdout.write(packet(0,Buffer.alloc(32)));assert.equal(metadata.length,1);assert.equal(pcm.length,1);
  session.stop();child.stdout.write(packet(0,Buffer.alloc(32)));assert.equal(pcm.length,1);child.emit('close',0);assert.equal(closed,1);assert.equal(errors.length,0);f.service.close();
});
test('malformed or premature PCM terminates its capture instead of reaching playback',()=>{
  const f=fixture(),errors=[];let samples=0,closed=0;f.service.openAudio({onPcm:()=>samples++,onError:error=>errors.push(error.message),onClose:()=>closed++});const child=f.calls[0].child;
  child.stdout.write(packet(0,Buffer.alloc(8)));child.stdout.write(packet(1,format));assert.equal(samples,0);assert.match(errors[0],/Invalid PC audio samples/);child.emit('close',0);assert.equal(closed,1);f.service.close();
});
test('service shutdown stops all captures and rejects new work',async()=>{
  const f=fixture();let closed=0;f.service.openAudio({onClose:()=>closed++});f.service.openAudio({onClose:()=>closed++});f.service.close();for(const call of f.calls){assert.equal(call.child.stdin.writableEnded,true);call.child.emit('close',0);}assert.equal(closed,2);await assert.rejects(f.service.listApps(),/stopping/);
});
