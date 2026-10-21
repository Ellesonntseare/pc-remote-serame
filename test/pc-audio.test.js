'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {PcmPlaybackBuffer}=require('../public/audio-worklet'),{PcAudioPlayer}=require('../public/pc-audio');
test('the worklet registers and renders synthetic audio without browser playback',()=>{
  const vm=require('node:vm'),fs=require('node:fs');let Processor;
  class Base{constructor(){this.port={};}}
  vm.runInNewContext(fs.readFileSync(require.resolve('../public/audio-worklet'),'utf8'),{AudioWorkletProcessor:Base,registerProcessor:(name,processor)=>{assert.equal(name,'pc-remote-pcm');Processor=processor;},sampleRate:48000,Float32Array,ArrayBuffer});
  const processor=new Processor({processorOptions:{sampleRate:48000,channels:1}});processor.port.onmessage({data:new Float32Array(6000).fill(.25).buffer});
  const samples=new Float32Array(128);assert.equal(processor.process([],[[samples]]),true);assert.equal(samples[0],.25);processor.port.onmessage({data:{type:'clear'}});assert.equal(processor.queue.frames,0);
});
test('PCM playback resamples stereo data and preserves channel separation',()=>{
  const queue=new PcmPlaybackBuffer({sampleRate:48000,channels:2,outputRate:24000}),input=new Float32Array(6000*2);for(let i=0;i<6000;i++){input[i*2]=.25;input[i*2+1]=-.5;}queue.push(input);
  const outputs=[new Float32Array(1000),new Float32Array(1000)];queue.render(outputs);assert.equal(outputs[0][500],.25);assert.equal(outputs[1][500],-.5);assert.equal(queue.frames,4000);
});
test('slow playback drops old sound with a strict half-second maximum and sanitizes samples',()=>{
  const queue=new PcmPlaybackBuffer({sampleRate:8000,channels:1,outputRate:8000,maxSeconds:.1}),input=new Float32Array(4000).fill(.2);queue.push(input);queue.push(new Float32Array(4000).fill(.7));assert.equal(queue.frames,800);assert.ok(queue.droppedFrames>=7200);
  const output=[new Float32Array(32)];queue.render(output);assert.ok(Math.abs(output[0][0]-.7)<.001);assert.ok(queue.frames<=queue.capacity);
  queue.clear();const invalid=new Float32Array(1000).fill(Infinity);invalid[0]=NaN;queue.push(invalid);queue.render(output);assert.ok(output[0].every(value=>value===0));
});
test('underflow outputs silence and waits for a fresh prebuffer before restarting',()=>{
  const queue=new PcmPlaybackBuffer({sampleRate:8000,channels:1,outputRate:8000}),output=[new Float32Array(1024).fill(1)];queue.push(new Float32Array(600).fill(.5));queue.render(output);assert.equal(output[0][0],.5);assert.equal(output[0][800],0);assert.equal(queue.ready,false);
  queue.push(new Float32Array(20).fill(.5));queue.render(output);assert.ok(output[0].every(value=>value===0));queue.clear();assert.equal(queue.frames,0);assert.equal(queue.ready,false);
});
test('PCM rejects incomplete frames and oversized blocks',()=>{
  const queue=new PcmPlaybackBuffer();assert.throws(()=>queue.push(new Float32Array(3)),/Invalid audio block/);assert.throws(()=>queue.push(new Float32Array(200000)),/Invalid audio block/);
});
function playerFixture(){
  const sockets=[],contexts=[],states=[];class Context{constructor(){this.sampleRate=48000;this.closed=false;contexts.push(this);}resume(){return Promise.resolve();}close(){this.closed=true;return Promise.resolve();}createGain(){return {gain:{value:0},connect(){},disconnect(){}};}createScriptProcessor(){return {connect(){},disconnect(){}};}}
  class Socket{constructor(url){this.url=url;this.closed=false;sockets.push(this);}close(){this.closed=true;}}
  globalThis.PCRAudioBuffer={PcmPlaybackBuffer};const player=new PcAudioPlayer({AudioContextImpl:Context,WebSocketImpl:Socket,location:{protocol:'https:',host:'example.test'},onState:state=>states.push(state)});return {player,sockets,contexts,states};
}
test('browser player starts from an explicit call, handles synthetic PCM and releases every resource',async()=>{
  const f=playerFixture();assert.equal(f.contexts.length,0);await f.player.start();const socket=f.sockets[0];assert.equal(socket.url,'wss://example.test/api/audio');
  await socket.onmessage({data:JSON.stringify({type:'format',encoding:'f32le',sampleRate:48000,channels:2,source:'system-output'})});await socket.onmessage({data:new Float32Array(6000).buffer});assert.equal(f.player.state,'playing');assert.ok(f.player.queue.frames>0);
  f.player.setVolume(.3);f.player.setMuted(true);assert.equal(f.player.gain.gain.value,0);f.player.setMuted(false);assert.equal(f.player.gain.gain.value,.3);
  const queue=f.player.queue;f.player.stop();assert.equal(queue.frames,0);assert.equal(socket.closed,true);assert.equal(f.contexts[0].closed,true);assert.equal(f.player.node,null);assert.equal(f.player.socket,null);
});
test('socket disconnect stops audio, and late packets from an abandoned connection cannot restart it',async()=>{
  const f=playerFixture();await f.player.start();const old=f.sockets[0],late=old.onmessage;old.onclose();assert.equal(f.contexts[0].closed,true);await f.player.start();await late({data:JSON.stringify({type:'format',encoding:'f32le',sampleRate:48000,channels:2,source:'system-output'})});assert.equal(f.player.state,'connecting');f.player.stop();
});
test('device suspension releases the stream before worklet messages can accumulate',async()=>{
  const f=playerFixture();await f.player.start();const context=f.contexts[0];context.state='suspended';context.onstatechange();assert.equal(f.sockets[0].closed,true);assert.equal(context.closed,true);assert.equal(f.player.state,'stopped');
});
