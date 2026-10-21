'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const ScreenRenderer=require('../public/screen-renderer');
function region({keyframe=false,base=1,w=100,h=80,x=0,y=0,label=1}={}){
  const p=Buffer.alloc(22);p[0]=Number(keyframe);p.writeUInt32BE(base,1);p.writeUInt32BE(w,5);p.writeUInt32BE(h,9);p.writeUInt32BE(x,13);p.writeUInt32BE(y,17);p[21]=label;return p;
}
function fixture(){
  const draws=[],acks=[],decodes=[];let refreshes=0,source={};
  const canvas={width:0,height:0,getContext:()=>({drawImage:(image,x,y)=>draws.push({label:image.label,x,y})})};
  const renderer=new ScreenRenderer({canvas,decode:bytes=>new Promise((resolve,reject)=>decodes.push({label:bytes[0],resolve:(w=100,h=80)=>resolve({width:w,height:h,label:bytes[0],close(){}}),reject})),isCurrent:s=>s===source,onFrame(){},onAck:id=>acks.push(id),onRefresh:()=>refreshes++});
  renderer.reset(source);
  return {renderer,canvas,draws,acks,decodes,get source(){return source;},reconnect(){source={};renderer.reset(source);},get refreshes(){return refreshes;}};
}
const tick=()=>new Promise(resolve=>setImmediate(resolve));
test('slow decoding preserves the keyframe and coalesces cumulative patches',async()=>{
  const f=fixture(),r=f.renderer;
  r.push(5,region({keyframe:true,label:1}),1,f.source);
  r.push(5,region({x:16,y:16,label:2}),2,f.source);
  r.push(5,region({x:16,y:16,label:3}),3,f.source);
  assert.equal(f.decodes.length,1);f.decodes[0].resolve();await tick();
  assert.equal(f.decodes[1].label,3);f.decodes[1].resolve(32,16);await tick();
  assert.deepEqual(f.draws,[{label:1,x:0,y:0},{label:3,x:16,y:16}]);assert.deepEqual(f.acks,[1,3]);assert.equal(f.refreshes,0);
});
test('a pending keyframe is retained even when its patch arrives during an older decode',async()=>{
  const f=fixture(),r=f.renderer;
  r.push(5,region({keyframe:true,label:1}),1,f.source);
  r.push(5,region({keyframe:true,base:2,label:2}),2,f.source);
  r.push(5,region({base:2,x:16,y:16,label:3}),3,f.source);
  f.decodes[0].resolve();await tick();assert.equal(f.decodes[1].label,2);
  f.decodes[1].resolve();await tick();assert.equal(f.decodes[2].label,3);
  f.decodes[2].resolve(32,16);await tick();assert.equal(r.base,2);assert.equal(f.refreshes,0);
});
test('decodes from an abandoned connection never repaint or acknowledge the new screen',async()=>{
  const f=fixture();f.renderer.push(5,region({keyframe:true,label:1}),1,f.source);f.reconnect();
  f.renderer.push(5,region({keyframe:true,base:2,label:2}),2,f.source);
  f.decodes[0].resolve();await tick();f.decodes[1].resolve();await tick();
  assert.deepEqual(f.draws,[{label:2,x:0,y:0}]);assert.deepEqual(f.acks,[2]);
});
test('missing bases and failed JPEGs request recovery and release frame credit',async()=>{
  const f=fixture(),r=f.renderer;
  r.push(5,region({x:16,label:1}),1,f.source);await tick();assert.equal(f.refreshes,1);assert.deepEqual(f.acks,[1]);
  r.push(5,region({keyframe:true,label:2}),2,f.source);f.decodes[0].reject(Error('corrupt JPEG'));await tick();assert.equal(f.draws.length,0);assert.deepEqual(f.acks,[1,2]);
  r.push(5,region({keyframe:true,base:2,label:3}),3,f.source);f.decodes[1].resolve();await tick();assert.equal(r.base,2);
  r.push(5,region({base:3,x:16,label:4}),4,f.source);await tick();assert.equal(f.refreshes,2);
});
test('invalid regions cannot resize the canvas or hold frame credit',async()=>{
  const f=fixture(),r=f.renderer;r.push(5,Buffer.alloc(2),1,f.source);
  r.push(5,region({keyframe:true,w:32768,h:32768}),2,f.source);
  r.push(5,region({keyframe:true,w:100,h:80}),3,f.source);f.decodes[0].resolve(101,80);await tick();
  assert.equal(f.canvas.width,0);assert.deepEqual(f.acks,[1,2,3]);assert.equal(f.draws.length,0);
});
test('legacy full JPEGs remain usable',async()=>{
  const f=fixture();f.renderer.push(0,Buffer.from([9]),1,f.source);f.decodes[0].resolve(1920,1080);await tick();assert.equal(f.canvas.width,1920);assert.deepEqual(f.draws,[{label:9,x:0,y:0}]);
});
