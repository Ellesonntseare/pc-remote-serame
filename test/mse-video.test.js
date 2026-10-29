'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events'),{spawnSync}=require('node:child_process');
const {mp4EncodingArgs}=require('../video-encoders'),{MseVideoSession}=require('../public/mse-video');
class Events extends EventEmitter{addEventListener(type,fn){this.on(type,fn);}}
function fixture(t){
 const urls=[],states=[],appended=[];let socket,media;
 class BufferSource extends Events{updating=false;buffered={length:0};appendBuffer(bytes){appended.push(bytes);this.updating=true;}remove(){this.updating=true;}finish(){this.updating=false;this.emit('updateend');}}
 class Media extends Events{static isTypeSupported(value){return value.includes('avc1.');}readyState='closed';constructor(){super();media=this;}addSourceBuffer(){return new BufferSource();}open(){this.readyState='open';this.emit('sourceopen');}}
 class Socket{constructor(url){urls.push(url);socket=this;}close(){this.closed=true;}message(value){this.onmessage?.({data:typeof value==='object'&&!(value instanceof ArrayBuffer)?JSON.stringify(value):value});}}
 const video={src:'',muted:false,currentTime:0,playsInline:false,pause(){},play(){return Promise.resolve();},removeAttribute(){this.src='';},load(){}};
 const oldCreate=URL.createObjectURL,oldRevoke=URL.revokeObjectURL;URL.createObjectURL=()=> 'blob:fixture';URL.revokeObjectURL=()=>{};
 const viewer=new MseVideoSession({video,onState:v=>states.push(v),Socket,Media,location:{protocol:'http:',host:'192.168.8.100:7666'}});t.after(()=>{viewer.stop();URL.createObjectURL=oldCreate;URL.revokeObjectURL=oldRevoke;});
 return {viewer,urls,states,video,appended,get socket(){return socket;},get media(){return media;}};
}
test('local HTTP video buffers real MP4 fragments in order and releases the source on stop',t=>{
 const f=fixture(t);assert.equal(f.viewer.start('hd',{monitorId:'a'.repeat(24)}),true);assert.match(f.urls[0],/^ws:\/\/192\.168\.8\.100:7666\/api\/native-video/);
 f.socket.message({type:'format',encoding:'mp4',mime:'video/mp4; codecs="avc1.42c01e"',width:720,height:1280});f.socket.message(new Uint8Array([1,2,3]).buffer);assert.equal(f.appended.length,0);f.media.open();assert.equal(f.appended.length,1);
 f.socket.message(new Uint8Array([4,5,6]).buffer);assert.equal(f.appended.length,1);f.viewer.buffer.finish();assert.equal(f.appended.length,2);const previous=f.socket;f.viewer.stop();assert.equal(previous.closed,true);assert.equal(f.video.src,'');assert.equal(f.viewer.bytes,0);assert.equal(previous.onmessage,null);
});
test('invalid sources, oversized queued video and corrupt formats terminate bounded sessions',t=>{
 const f=fixture(t);assert.equal(f.viewer.start('hd',{monitorId:'raw display path'}),false);assert.equal(f.urls.length,0);f.viewer.start('hd',{monitorId:'b'.repeat(24)});f.socket.message(new ArrayBuffer(4*1024*1024));f.socket.message(new ArrayBuffer(1));assert.equal(f.states.at(-1).state,'error');assert.equal(f.viewer.socket,null);
 f.viewer.start('hd',{monitorId:'c'.repeat(24)});f.socket.message({type:'format',encoding:'mp4',mime:'video/mp4; codecs="arbitrary"',width:720,height:1280});assert.equal(f.states.at(-1).state,'error');assert.equal(f.viewer.socket,null);
});
test('the actual software encoder emits fragmented MP4 with a decodable H.264 initialization segment',()=>{
 const args=mp4EncodingArgs('libx264',{fps:12,bitrate:500});assert.equal(args.includes('-bsf:v'),false);assert.ok(args.includes('frag_keyframe+empty_moov+default_base_moof'));
 const result=spawnSync(require('ffmpeg-static'),['-hide_banner','-loglevel','error','-f','lavfi','-i','testsrc2=size=640x360:rate=12','-frames:v','5','-an',...args],{windowsHide:true,maxBuffer:4*1024*1024});assert.equal(result.status,0,result.stderr.toString());assert.ok(result.stdout.includes(Buffer.from('ftyp')));assert.ok(result.stdout.includes(Buffer.from('moof')));const avc=result.stdout.indexOf('avcC');assert.ok(avc>0);assert.match(result.stdout.subarray(avc+5,avc+8).toString('hex'),/^[a-f0-9]{6}$/);
});
