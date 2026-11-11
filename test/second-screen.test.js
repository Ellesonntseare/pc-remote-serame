'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),http=require('node:http'),{once}=require('node:events'),{WebSocket}=require('ws');
const {createSecondScreen}=require('../second-screen'),policy=require('../public/second-screen-policy');
test('display fitting contains landscape and portrait images without stretch or crop',()=>{
 assert.deepEqual(policy.fit(400,800,1920,1080),{left:0,top:287.5,width:400,height:225});
 assert.deepEqual(policy.fit(800,400,1080,1920),{left:287.5,top:0,width:225,height:400});
 assert.equal(policy.fit(0,400,1920,1080),null);assert.deepEqual(policy.dimensions(1080,2400,'landscape'),{width:2400,height:1080});assert.deepEqual(policy.dimensions(2400,1080,'portrait'),{width:1080,height:2400});
});
test('adaptive video steps down under measured load and only enables 60 fps on a capable stable local route',()=>{
 assert.equal(policy.preset({current:'hd',actualFps:12,rtt:100}), 'med');assert.equal(policy.preset({current:'low',stalled:true}),'low');
 assert.equal(policy.preset({current:'hd',actualFps:30,rtt:9,stableMs:15000,hardware:true,smooth60:true}),'fluid');
 assert.equal(policy.preset({current:'hd',actualFps:30,rtt:9,stableMs:14999,hardware:true,smooth60:true}),'hd');
 assert.equal(policy.preset({current:'hd',actualFps:30,rtt:9,stableMs:20000,hardware:false,smooth60:true}),'hd');
});
async function fixture(t,{role='owner',platform='android'}={}){
 const sessions=new Map([['test',{role,until:Date.now()+60000}]]),calls=[],files=[],stops=[];let handler,ended=0;
 const broker=createSecondScreen({sessions,sessionExpiry:()=>()=>{},deviceFor:()=>({id:'phone',platform}),native:{openSecondScreen(options){handler=options;return{input:v=>calls.push(v),recover:()=>calls.push('recover'),stop:()=>ended++};}},onFiles:async(token,device,paths)=>{files.push({token,device,paths});return [{id:'file',name:'Original photo.png'}];},onStop:token=>stops.push(token)});
 const server=http.createServer();server.on('upgrade',(req,socket,head)=>broker.upgrade(req,socket,head,'test'));server.listen(0,'127.0.0.1');await once(server,'listening');const peers=[];t.after(async()=>{broker.close();for(const ws of peers)ws.terminate();await new Promise(resolve=>server.close(resolve));});
 async function connect(){const socket=new WebSocket('ws://127.0.0.1:'+server.address().port);peers.push(socket);const messages=[];socket.on('message',bytes=>messages.push(JSON.parse(bytes)));await once(socket,'open');return {socket,messages};}
 return {broker,sessions,calls,files,stops,connect,get native(){return handler;},get ended(){return ended;}};
}
const tick=()=>new Promise(r=>setTimeout(r,30));
test('the extended display keeps its native source private and releases it on disconnect',async t=>{
 const f=await fixture(t),p=await f.connect();p.socket.send(JSON.stringify({type:'start',width:1920,height:1080,side:'right'}));await tick();assert.equal(f.native.side,'right');
 f.native.onEvent({kind:'ready',monitor:'\\\\.\\DISPLAY2',width:1920,height:1080,side:'right'});await tick();const ready=p.messages.find(v=>v.type==='ready');assert.match(ready.monitorId,/^[\w-]{24}$/);assert.equal(ready.monitor,undefined);assert.equal(f.broker.source('test',ready.monitorId).monitor,'\\\\.\\DISPLAY2');assert.throws(()=>f.broker.source('other',ready.monitorId));
 p.socket.send(JSON.stringify({type:'input',action:'down',x:.2,y:.3}));await tick();assert.equal(f.calls.at(-1).action,'down');
 p.socket.send(JSON.stringify({type:'input',id:1,action:'text',text:'Hello \u4e16\u754c'}));await tick();assert.equal(f.calls.at(-1).text,'Hello \u4e16\u754c');
 f.native.onEvent({kind:'input-result',id:1,action:'text',ok:true});await tick();assert.equal(p.messages.at(-1).type,'input-result');assert.equal(p.messages.at(-1).id,1);
 p.socket.send(JSON.stringify({type:'input',id:2,action:'key',key:'Enter'}));await tick();assert.equal(f.calls.at(-1).key,'Enter');
 f.native.onEvent({kind:'files',paths:['C:\\Photos\\Original photo.png']});await tick();assert.equal(f.files[0].device.id,'phone');assert.equal(p.messages.find(v=>v.type==='files').offers[0].name,'Original photo.png');
 p.socket.close();await once(p.socket,'close');await tick();assert.equal(f.ended,1);assert.equal(f.stops.length,1);assert.throws(()=>f.broker.source('test',ready.monitorId));
 f.native.onEvent({kind:'files',paths:['C:\\after.txt']});await tick();assert.equal(f.files.length,1);
});
test('view-only sessions and non-Android devices cannot attach a Windows display',async t=>{
 for(const options of [{role:'guest'},{platform:'browser'}]){const f=await fixture(t,options),p=await f.connect();if(p.socket.readyState!==WebSocket.CLOSED)await once(p.socket,'close');assert.equal(f.native,undefined);}
});
test('malformed input stops the session and restores its display exactly once',async t=>{
 const f=await fixture(t),p=await f.connect();p.socket.send(JSON.stringify({type:'start',width:1280,height:720,side:'left'}));await tick();f.native.onEvent({kind:'ready',monitor:'display',width:1280,height:720,side:'left'});p.socket.send(JSON.stringify({type:'input',action:'move',x:Infinity,y:.5}));await once(p.socket,'close');assert.equal(f.ended,1);assert.equal(f.calls.length,0);assert.equal(p.messages.at(-1).type,'error');
});
