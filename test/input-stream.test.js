'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http');
const {EventEmitter,once}=require('node:events');
const {PassThrough,Writable}=require('node:stream');
const {setTimeout:pause}=require('node:timers/promises');
const WebSocket=require('ws');
const {createApp}=require('../server');

async function until(condition){for(let i=0;i<200;i++){if(condition())return;await pause(5);}throw Error('Input stream did not reach expected state');}
function request(port,path,method='GET',body,headers={}){
  return new Promise((resolve,reject)=>{
    const req=http.request({hostname:'127.0.0.1',port,path,method,headers:{'X-PCR':'1',...headers}},res=>{
      let data='';res.on('data',chunk=>data+=chunk);res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body:JSON.parse(data)}));
    });req.on('error',reject);if(body!==undefined)req.write(JSON.stringify(body));req.end();
  });
}
function packet(type,value){const p=Buffer.from(JSON.stringify(value)),header=Buffer.alloc(5);header[0]=type;header.writeUInt32BE(p.length,1);return Buffer.concat([header,p]);}
async function fixture(options={}){
  const written=[],clients=new Set(),timers=new Set(),screens=[];let screen,activeAgent;
  const app=createApp({port:0,disableActions:true,...options,agentFactory:()=>{
    const agent=activeAgent=new EventEmitter();agent.stdout=new PassThrough();agent.stderr=new PassThrough();let buffer='',closed=false;
    agent.stdin=new Writable({write(chunk,encoding,done){
      buffer+=chunk.toString('utf8');let newline;
      while((newline=buffer.indexOf('\n'))>=0){
        const line=buffer.slice(0,newline);buffer=buffer.slice(newline+1);const ack=/^ack ([a-f0-9]{16}) (.+)$/.exec(line),command=ack?ack[2]:line;written.push(command);
        if(ack){
          const timer=setTimeout(()=>{timers.delete(timer);if(!closed)agent.stdout.write(packet(2,{id:ack[1],ok:!command.endsWith(Buffer.from('REJECT').toString('base64')),error:'Desktop rejected typing'}));},120);timers.add(timer);
        }
      }
      done();
    }});
    agent.kill=()=>{if(closed)return;closed=true;for(const timer of timers)clearTimeout(timer);timers.clear();agent.stdout.end();agent.emit('close',0);};agent.stdin.on('finish',()=>agent.kill());
    setImmediate(()=>{if(!closed)agent.stdout.write(packet(1,{w:1920,h:1080}));});return agent;
  }});
  await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));const port=app.server.address().port;
  const host=options.tunnelHostname||`127.0.0.1:${port}`,origin=`${options.tunnelHostname?'https':'http'}://${host}`;
  const pairing=await request(port,'/api/pair','POST',options.password?{password:options.password,remember:options.remember===true}:{}, {Host:host,Origin:origin}),cookie=pairing.headers['set-cookie'][0].split(';')[0];
  async function openScreen(path='/api/screen'){
    screen=await new Promise((resolve,reject)=>{const req=http.get({hostname:'127.0.0.1',port,path,headers:{Host:host,'X-PCR':'1',Cookie:cookie,Origin:origin}},res=>res.once('data',data=>resolve({req,res,metadata:JSON.parse(data.subarray(5,5+data.readUInt32BE(1)).toString()),chunks:[]})));req.on('error',reject);});
    screens.push(screen);
    const opened=screen;
    screen.res.on('data',chunk=>opened.chunks.push(chunk));return screen;
  }
  function connect(headers={},path='/api/input-stream'){
    return new Promise((resolve,reject)=>{
      const merged={Host:host,Origin:origin,Cookie:cookie,...headers};for(const key of Object.keys(merged))if(merged[key]===undefined)delete merged[key];
      const ws=new WebSocket(`ws://127.0.0.1:${port}${path}`,{headers:merged});clients.add(ws);ws.on('error',()=>{});
      ws.once('open',()=>{ws.messages=[];ws.on('message',data=>ws.messages.push(JSON.parse(data.toString())));resolve({ws});});
      ws.once('unexpected-response',(req,res)=>{const status=res.statusCode;res.resume();ws.terminate();resolve({status});});ws.once('error',reject);
    });
  }
  async function close(){for(const ws of clients)if(ws.readyState===WebSocket.OPEN)ws.terminate();for(const s of screens){s.res.destroy();s.req.destroy();}app.stop();await new Promise(resolve=>app.server.close(resolve));for(const timer of timers)clearTimeout(timer);}
  return {app,port,host,origin,cookie,written,openScreen,connect,close,
    get streamId(){return screen?.metadata.streamId;},
    emitFrame(){activeAgent.stdout.write(packet(0,{sample:'frame'}));},
    emitRegion(base,keyframe){const payload=Buffer.alloc(22);payload[0]=Number(keyframe);payload.writeUInt32BE(base,1);payload.writeUInt32BE(1920,5);payload.writeUInt32BE(1080,9);payload[21]=42;const header=Buffer.alloc(5);header[0]=5;header.writeUInt32BE(payload.length,1);activeAgent.stdout.write(Buffer.concat([header,payload]));},
    emitCursor(){activeAgent.stdout.write(packet(6,{x:300,y:200,visible:true}));},
    packets(target=screen){const data=Buffer.concat(target.chunks),packets=[];let offset=0;while(offset+5<=data.length){const size=data.readUInt32BE(offset+1);if(offset+5+size>data.length)break;const type=data[offset],payload=data.subarray(offset+5,offset+5+size);packets.push({type,data:type===5?{keyframe:payload[0]===1,base:payload.readUInt32BE(1)}:JSON.parse(payload.toString())});offset+=5+size;}return packets;}
  };
}

test('input stream requires authenticated same-origin host and an active screen',async t=>{
  const f=await fixture();t.after(()=>f.close());
  assert.equal((await f.connect()).status,409);
  await f.openScreen();
  assert.equal((await f.connect({Cookie:undefined})).status,401);
  assert.equal((await f.connect({Origin:undefined})).status,403);
  assert.equal((await f.connect({Origin:'https://evil.example'})).status,403);
  assert.equal((await f.connect({Host:'evil.example'})).status,403);
  assert.equal((await f.connect({},'/not-the-input-stream')).status,404);
  const {ws}=await f.connect();assert.equal(ws.readyState,WebSocket.OPEN);
});

test('movement streams in order without a response round trip or blocking on typing acknowledgement',async t=>{
  const f=await fixture();t.after(()=>f.close());await f.openScreen();const {ws}=await f.connect();
  const typing='edit '+Buffer.from(JSON.stringify({remove:0,text:'hello'})).toString('base64');
  ws.send(JSON.stringify({cmds:['mv 1 2']}));ws.send(JSON.stringify({id:1,cmds:[typing],wait:true}));ws.send(JSON.stringify({cmds:['mv 3 4','click l']}));
  await until(()=>f.written.length===4);assert.deepEqual(f.written,['mv 1 2',typing,'mv 3 4','click l']);assert.equal(ws.messages.length,0,'fire-and-forget movement must not wait on success acknowledgements');
  await until(()=>ws.messages.length===1);assert.deepEqual(ws.messages[0],{id:1,status:200,ok:true,delivered:true});
  ws.send(JSON.stringify({id:'pointer-check',cmds:['abs 500 300']}));await until(()=>ws.messages.length===2);assert.deepEqual(ws.messages[1],{id:'pointer-check',status:200,ok:true});
});

test('WebSocket and HTTP input share validation and errors, including payload bounds',async t=>{
  const f=await fixture();t.after(()=>f.close());await f.openScreen();const {ws}=await f.connect();
  ws.send(JSON.stringify({id:'bad',cmds:['mv nope 1']}));await until(()=>ws.messages.length===1);assert.equal(ws.messages[0].status,400);assert.equal(f.written.length,0);
  const httpResult=await request(f.port,'/api/input','POST',{cmds:['mv nope 1']},{Cookie:f.cookie});assert.equal(httpResult.status,ws.messages[0].status);assert.equal(httpResult.body.error,ws.messages[0].error);
  ws.send('{');await until(()=>ws.messages.length===2);assert.equal(ws.messages[1].status,400);
  ws.send(JSON.stringify({cmds:['key 13'],wait:true}));await until(()=>ws.messages.length===3);assert.match(ws.messages[2].error,/request ID/);
  ws.send(JSON.stringify({id:null,cmds:['key 13']}));await until(()=>ws.messages.length===4);assert.match(ws.messages[3].error,/request ID/);
  const closed=once(ws,'close');ws.send('x'.repeat(100001));const [code]=await closed;assert.equal(code,1009);
});

test('closing an input socket releases only the buttons and keys it held',async t=>{
  const f=await fixture();t.after(()=>f.close());await f.openScreen();const first=(await f.connect()).ws,other=(await f.connect()).ws;
  first.send(JSON.stringify({cmds:['down r','keydown 17']}));await until(()=>f.written.length===2);const otherClosed=once(other,'close');other.close();await otherClosed;assert.deepEqual(f.written,['down r','keydown 17']);
  const firstClosed=once(first,'close');first.close();await firstClosed;await until(()=>f.written.length===4);assert.deepEqual(f.written,['down r','keydown 17','up r','keyup 17']);
});

test('unpairing closes the input socket and session expiry rejects further input',async t=>{
  const f=await fixture();t.after(()=>f.close());await f.openScreen();const {ws}=await f.connect(),closed=once(ws,'close');
  const result=await request(f.port,'/api/unpair','POST',{}, {Cookie:f.cookie});assert.equal(result.status,200);await closed;assert.equal(ws.readyState,WebSocket.CLOSED);
  const expiry=await fixture();t.after(()=>expiry.close());await expiry.openScreen();const expiring=(await expiry.connect()).ws;
  const now=Date.now;try{const future=now()+3*60*60*1000;Date.now=()=>future;const expired=once(expiring,'close');expiring.send(JSON.stringify({cmds:['click l']}));const [code]=await expired;assert.equal(code,1008);assert.equal(expiry.written.length,0);assert.equal(expiring.messages[0].status,401);}finally{Date.now=now;}
});

test('tunnel input stream retains the exact public hostname and HTTPS origin checks',async t=>{
  const f=await fixture({tunnelHostname:'remote.example.com'});t.after(()=>f.close());await f.openScreen();
  assert.equal((await f.connect({Host:`127.0.0.1:${f.port}`,Origin:`http://127.0.0.1:${f.port}`})).status,403);
  const {ws}=await f.connect();ws.send(JSON.stringify({id:'tunnel',cmds:['click l']}));await until(()=>ws.messages.length===1);assert.equal(ws.messages[0].status,200);assert.deepEqual(f.written,['click l']);
});


test('video feedback bounds in-flight frames and belongs to the exact screen stream',async t=>{
  const f=await fixture();t.after(()=>f.close());await f.openScreen();
  assert.match(f.streamId,/^[a-f0-9]{24}$/);
  assert.equal((await f.connect({},'/api/input-stream?screen=wrong')).status,409);
  const {ws}=await f.connect({},'/api/input-stream?screen='+f.streamId);await until(()=>f.written.includes('flow 1'));
  for(let i=0;i<12;i++)f.emitFrame();
  await until(()=>f.packets().filter(p=>p.type===0).length===2);await pause(30);
  assert.equal(f.packets().filter(p=>p.type===0).length,2,'slow client must not accumulate old video');
  const last=f.packets().filter(p=>p.type===3).at(-1).data.id;
  const other=(await f.connect()).ws;other.send(JSON.stringify({frameAck:last}));f.emitFrame();await pause(20);assert.equal(f.packets().filter(p=>p.type===0).length,2,'another input channel cannot acknowledge this viewer');
  ws.send(JSON.stringify({frameAck:last}));await pause(20);f.emitFrame();await until(()=>f.packets().filter(p=>p.type===0).length===3);
  ws.terminate();await until(()=>f.written.includes('flow 0'));f.emitFrame();await until(()=>f.packets().filter(p=>p.type===0).length===4);
});

test('slow frame delivery adjusts compression without changing the screen session',async t=>{
  const f=await fixture();t.after(()=>f.close());await f.openScreen();const original=f.streamId;
  const {ws}=await f.connect({},'/api/input-stream?screen='+original);f.emitFrame();await until(()=>f.packets().some(p=>p.type===3));
  const id=f.packets().find(p=>p.type===3).data.id;await pause(1550);ws.send(JSON.stringify({frameAck:id}));
  await until(()=>f.written.includes('quality 40'));assert.equal(f.streamId,original);assert.ok(f.written.filter(c=>c==='frame').length>=2,'capture resumes on fresh frame credit');
});

test('region streaming recovers a keyframe skipped by a slow viewer',async t=>{
  const f=await fixture();t.after(()=>f.close());await f.openScreen('/api/screen?regions=1');
  const {ws}=await f.connect({},'/api/input-stream?screen='+f.streamId);
  await until(()=>f.written.includes('regions 1'));
  f.emitRegion(1,true);f.emitRegion(1,false);await until(()=>f.packets().filter(p=>p.type===5).length===2);
  f.emitRegion(2,true);f.emitRegion(2,false);await pause(20);
  assert.equal(f.packets().filter(p=>p.type===5).length,2);
  const last=f.packets().filter(p=>p.type===3).at(-1).data.id;ws.send(JSON.stringify({frameAck:last}));
  await until(()=>f.written.includes('refresh'));
  f.emitRegion(2,false);await pause(20);assert.equal(f.packets().filter(p=>p.type===5).length,2,'patches from a missing base must be skipped');
  f.emitRegion(3,true);f.emitRegion(3,false);await until(()=>f.packets().filter(p=>p.type===5).length===4);
  assert.deepEqual(f.packets().filter(p=>p.type===5).map(p=>p.data),[{keyframe:true,base:1},{keyframe:false,base:1},{keyframe:true,base:3},{keyframe:false,base:3}]);
});

test('a new region viewer gets a fresh base and a legacy viewer switches back to full JPEGs',async t=>{
  const f=await fixture();t.after(()=>f.close());const first=await f.openScreen('/api/screen?regions=1');
  await f.connect({},'/api/input-stream?screen='+first.metadata.streamId);f.emitRegion(1,true);await until(()=>f.packets(first).some(p=>p.type===5));
  const second=await f.openScreen('/api/screen?regions=1');await f.connect({},'/api/input-stream?screen='+second.metadata.streamId);
  await until(()=>f.written.includes('refresh'));f.emitRegion(1,false);await pause(20);assert.equal(f.packets(second).filter(p=>p.type===5).length,0);
  f.emitRegion(2,true);await until(()=>f.packets(second).some(p=>p.type===5));
  f.emitCursor();await until(()=>f.packets(second).some(p=>p.type===6));
  const legacy=await f.openScreen();await until(()=>f.written.includes('regions 0'));f.emitFrame();await until(()=>f.packets(legacy).some(p=>p.type===0));
  f.emitCursor();await pause(20);assert.equal(f.packets(legacy).filter(p=>p.type===6).length,0);
});

test('30-day remembered sessions keep screen and input open without timer overflow',async t=>{
  const f=await fixture({password:'serame',remember:true});t.after(()=>f.close());await f.openScreen('/api/screen?regions=1');const {ws}=await f.connect({},'/api/input-stream?screen='+f.streamId);
  await pause(60);assert.equal(ws.readyState,WebSocket.OPEN);f.emitRegion(1,true);await until(()=>f.packets().some(p=>p.type===5));
  ws.send(JSON.stringify({id:'remembered',cmds:['click l']}));await until(()=>ws.messages.length===1);assert.equal(ws.messages[0].status,200);
});
