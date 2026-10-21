'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const {createApp, privateIP, validInput} = require('../server');

function request(port,route,method='GET',payload,headers={}){
  return new Promise((resolve,reject)=>{
    const req=http.request({hostname:'127.0.0.1',port,path:route,method,headers:{'X-PCR':'1',...headers}},res=>{
      let text='';res.on('data',b=>text+=b);res.on('end',()=>{
        let data;try{data=JSON.parse(text);}catch{data=text;}
        resolve({status:res.statusCode,headers:res.headers,data});
      });
    });req.on('error',reject);if(payload!==undefined){req.setHeader('Content-Type','application/json');req.write(JSON.stringify(payload));}req.end();
  });
}
const close = app=>new Promise((resolve,reject)=>app.server.close(err=>err?reject(err):resolve()));
test('IP checks and desktop input validation',()=>{
  for(const ip of ['127.0.0.1','192.168.8.105','10.1.0.1','172.31.255.2','::1']) assert.equal(privateIP(ip),true,ip);
  for(const ip of ['8.8.8.8','172.32.0.1','192.169.0.1','not-ip','192.168.1.999']) assert.equal(privateIP(ip),false,ip);
  for(const item of ['mv -23 42','abs 1910 1080','click l','up r','wheel -120','combo 17,86','text aGVsbG8=']) assert.equal(validInput(item),true,item);
  for(const item of ['rm -rf /','click x','combo 999,1','text !!','mv one 2','']) assert.equal(validInput(item),false,item);
});
test('PIN pairing and protected API',async()=>{
  const app=createApp({port:0,pin:'12345678',disableAgent:true,disableActions:true});
  await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
  const port=app.server.address().port;
  try{
    let r=await request(port,'/api/ping');assert.equal(r.status,200);assert.equal(r.data.paired,false);assert.equal(r.data.name,undefined);
    r=await request(port,'/api/status');assert.equal(r.status,401);
    r=await request(port,'/api/cmd','POST',{action:'shutdown'});assert.equal(r.status,401);
    r=await request(port,'/api/pair','POST',{pin:'00000000'});assert.equal(r.status,401);
    r=await request(port,'/api/pair','POST',{pin:'12345678'});assert.equal(r.status,200);
    const cookie=r.headers['set-cookie'][0].split(';')[0];assert.match(cookie,/^pc_remote_session=/);assert.match(r.headers['set-cookie'][0],/HttpOnly/);
    r=await request(port,'/api/ping','GET',undefined,{Cookie:cookie});assert.equal(r.data.paired,true);
    r=await request(port,'/api/status','GET',undefined,{Cookie:cookie});assert.equal(r.status,200);assert.equal(typeof r.data.cpu,'number');
    r=await request(port,'/api/input','POST',{cmds:['click l']},{Cookie:cookie});assert.equal(r.status,409);
    r=await request(port,'/api/screen','GET',undefined,{Cookie:cookie});assert.equal(r.status,503);
    r=await request(port,'/api/cmd','POST',{action:'nonsense'},{Cookie:cookie});assert.equal(r.status,400);
    r=await request(port,'/api/unpair','POST',{}, {Cookie:cookie});assert.equal(r.status,200);
    r=await request(port,'/api/status','GET',undefined,{Cookie:cookie});assert.equal(r.status,401);
  } finally {await close(app);}
});
test('rejects forged host/origin and unauthorized pairing requests',async()=>{
  const app=createApp({port:0,pin:'12345678',disableAgent:true,disableActions:true});
  await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
  const port=app.server.address().port;
  try{
    let r=await request(port,'/api/ping','GET',undefined,{Host:'evil.example'});assert.equal(r.status,403);
    r=await request(port,'/api/pair','POST',{pin:'12345678'},{Origin:'https://evil.example'});assert.equal(r.status,403);
    r=await request(port,'/api/pair','POST',{pin:'12345678'},{'X-PCR':'wrong'});assert.equal(r.status,403);
    r=await request(port,'/');assert.equal(r.status,200);assert.match(r.data,/id="pairGate"/);
  } finally {await close(app);}
});

// Browser text is sent as bounded UTF-8/base64 commands. Exercise the actual
// encoder from the served page, including multi-byte and surrogate characters.
test('phone typing encodes long Unicode text without splitting UTF-8 characters',()=>{
  const fs=require('node:fs');
  const html=fs.readFileSync(require('node:path').join(__dirname,'../index.html'),'utf8');
  const begin=html.indexOf('function encodeTextCommands(value){');
  const end=html.indexOf('\nasync function submitTyping',begin);
  assert.ok(begin!==-1 && end>begin,'phone encoder exists');
  const encode = new Function('TextEncoder','btoa',html.slice(begin,end)+';return encodeTextCommands;')(
    TextEncoder,bytes=>Buffer.from(bytes,'binary').toString('base64'));
  const message=('Hello 🖥️ 👩🏽‍💻 你好 مرحبا café\n').repeat(50);
  const commands=encode(message);
  assert.ok(commands.length>3);
  const joined=[];
  for(const cmd of commands){
    assert.equal(validInput(cmd),true);
    const bytes=Buffer.from(cmd.split(' ')[1],'base64');
    assert.ok(bytes.length<=300);
    joined.push(bytes);
  }
  assert.equal(Buffer.concat(joined).toString('utf8'),message);
  assert.equal(validInput('text !!!!'),false);
  assert.equal(validInput('text /w=='),false); // Invalid UTF-8
  assert.equal(validInput('text a'),false);
});

test('Windows agent acknowledgement reaches phone request, rejects typing errors', async()=>{
  const {PassThrough,Writable}=require('node:stream');
  const {EventEmitter}=require('node:events');
  const meta=Buffer.from(JSON.stringify({w:1920,h:1080}));
  const makePacket=(type,data)=>{const payload=Buffer.from(typeof data==='string'?data:JSON.stringify(data));const head=Buffer.alloc(5);head[0]=type;head.writeUInt32BE(payload.length,1);return Buffer.concat([head,payload]);};
  let fake;
  const seenEdits=[];let desktopText='';
  const app=createApp({port:0,pin:'12345678',disableActions:true,agentFactory:()=>{
    const agent=new EventEmitter();
    agent.stdout=new PassThrough();agent.stderr=new PassThrough();
    let buffer='';
    agent.stdin=new Writable({write(chunk,enc,cb){
      buffer+=chunk.toString('utf8');
      let newline;
      while((newline=buffer.indexOf('\n'))>=0){
        const line=buffer.slice(0,newline);buffer=buffer.slice(newline+1);
        const match=/^ack ([a-f0-9]{16}) (text|paste|edit|key|combo) (.+)$/.exec(line);
        if(match){
          const edit=match[2]==='edit'?JSON.parse(Buffer.from(match[3],'base64').toString('utf8')):null;
          const ok=edit?edit.text!=='REJECT':match[2]==='key' || Buffer.from(match[3],'base64').toString('utf8')!=='REJECT';
          if(edit && ok){
            const chars=[...new Intl.Segmenter(undefined,{granularity:'grapheme'}).segment(desktopText)].map(s=>s.segment);
            desktopText=chars.slice(0,Math.max(0,chars.length-edit.remove)).join('')+edit.text;
            seenEdits.push(edit);
          }
          setImmediate(()=>agent.stdout.write(makePacket(2,{id:match[1],ok,error:ok?undefined:'Desktop rejected typing'})));
        }
      }
      cb();
    }});
    agent.kill=()=>{agent.stdout.end();agent.emit('close',0);};
    fake=agent;
    setImmediate(()=>agent.stdout.write(makePacket(1,{w:1920,h:1080})));
    return agent;
  }});
  await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
  const port=app.server.address().port;
  let screen;
  try {
    const pairing=await request(port,'/api/pair','POST',{pin:'12345678'});
    const cookie=pairing.headers['set-cookie'][0].split(';')[0];
    screen=await new Promise((resolve,reject)=>{
      const req=http.request({hostname:'127.0.0.1',port,path:'/api/screen',headers:{'X-PCR':'1',Cookie:cookie}},res=>{res.once('data',()=>resolve({req,res}));});
      req.on('error',reject);req.end();
    });
    const valid='paste '+Buffer.from('Hello é 😀','utf8').toString('base64');
    let response=await request(port,'/api/input','POST',{cmds:[valid,'key 13'],wait:true},{Cookie:cookie});
    assert.equal(response.status,200);
    assert.equal(response.data.delivered,true);
    response=await request(port,'/api/input','POST',{cmds:['text '+Buffer.from('REJECT').toString('base64')],wait:true},{Cookie:cookie});
    assert.equal(response.status,503);
    assert.match(response.data.error,/rejected typing/i);
    response=await request(port,'/api/input','POST',{cmds:['mv 1 2'],wait:true},{Cookie:cookie});
    assert.equal(response.status,400);
    response=await request(port,'/api/input','POST',{cmds:['combo 17,67'],wait:true},{Cookie:cookie});
    assert.equal(response.status,200);assert.equal(response.data.delivered,true);
    const editCommand=edit=>'edit '+Buffer.from(JSON.stringify(edit),'utf8').toString('base64');
    const edits=[{remove:0,text:'hellp'},{remove:1,text:'o 😀\nمرحبا'}];
    response=await request(port,'/api/input','POST',{cmds:edits.map(editCommand),wait:true},{Cookie:cookie});
    assert.equal(response.status,200);assert.equal(response.data.delivered,true);
    assert.deepEqual(seenEdits,edits);assert.equal(desktopText,'hello 😀\nمرحبا');
    response=await request(port,'/api/input','POST',{cmds:[editCommand({remove:0,text:'REJECT'})],wait:true},{Cookie:cookie});
    assert.equal(response.status,503);assert.match(response.data.error,/rejected typing/i);
    response=await request(port,'/api/input','POST',{cmds:[editCommand({remove:-1,text:'bad'})],wait:true},{Cookie:cookie});
    assert.equal(response.status,400);assert.deepEqual(seenEdits,edits);

  } finally {
    if(screen){screen.res.destroy();screen.req.destroy();}
    app.stop();await close(app);
  }
});


test('trusted LAN connects without PIN by default and retains request protections',async()=>{
  const app=createApp({port:0,disableAgent:true,disableActions:true});
  await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
  const port=app.server.address().port;
  try {
    const ping=await request(port,'/api/ping');assert.equal(ping.data.requirePin,false);
    let r=await request(port,'/api/pair','POST',{});assert.equal(r.status,200);
    const cookie=r.headers['set-cookie'][0].split(';')[0];
    r=await request(port,'/api/status','GET',undefined,{Cookie:cookie});assert.equal(r.status,200);
    r=await request(port,'/api/pair','POST',{}, {'X-PCR':'bad'});assert.equal(r.status,403);
    r=await request(port,'/api/pair','POST',{}, {Origin:'https://evil.example'});assert.equal(r.status,403);
    r=await request(port,'/api/unpair','POST',{}, {Cookie:cookie});assert.equal(r.status,200);
    r=await request(port,'/api/status','GET',undefined,{Cookie:cookie});assert.equal(r.status,401);
  } finally {await close(app);}
});

test('paste validates bounded Unicode and multiline payloads',()=>{
  const command=text=>'paste '+Buffer.from(text).toString('base64');
  assert.equal(validInput(command('hello\nمرحبا 😀')),true);
  assert.equal(validInput(command('a'.repeat(65536))),true);
  assert.equal(validInput(command('a'.repeat(65537))),false);
  assert.equal(validInput('paste /w=='),false);
  assert.equal(validInput('paste '),false);
});


test('tunnel mode restricts hostname, keeps origin checks and uses secure sessions',async()=>{
  assert.throws(()=>createApp({tunnelHostname:'https://remote.example.com'}),/exact DNS/);
  const app=createApp({port:0,tunnelHostname:'remote.example.com',disableAgent:true,disableActions:true});
  await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
  const port=app.server.address().port, headers={Host:'remote.example.com',Origin:'https://remote.example.com'};
  try{
    let r=await request(port,'/api/pair','POST',{},headers);assert.equal(r.status,200);
    assert.match(r.headers['set-cookie'][0],/; Secure/);
    const cookie=r.headers['set-cookie'][0].split(';')[0];
    r=await request(port,'/api/status','GET',undefined,{...headers,Cookie:cookie});assert.equal(r.status,200);
    r=await request(port,'/api/pair','POST',{}, {...headers,Origin:'https://evil.example'});assert.equal(r.status,403);
    r=await request(port,'/api/ping');assert.equal(r.status,403);
    r=await request(port,'/api/ping','GET',undefined,{Host:'evil.example','CF-Connecting-IP':'127.0.0.1','X-Forwarded-Host':'remote.example.com'});assert.equal(r.status,403);
  }finally{await close(app);}
});


test('live edits validate bounded replacement operations and Unicode',()=>{
  const command=edit=>'edit '+Buffer.from(JSON.stringify(edit),'utf8').toString('base64');
  for(const edit of [{remove:0,text:'hello'},{remove:5,text:''},{remove:16000,text:'😀\nمرحبا'},{remove:0,text:'a'.repeat(16000)}])
    assert.equal(validInput(command(edit)),true);
  for(const edit of [null,[],{}, {remove:0}, {text:'hello'}, {remove:0,text:1}, {remove:-1,text:''}, {remove:1.5,text:''},
      {remove:16001,text:''}, {remove:0,text:'a'.repeat(16001)}, {remove:0,text:'\ud800'}, {remove:0,text:'\udc00'},
      {remove:0,text:'a\0b'}, {remove:0,text:'a',extra:true}])
    assert.equal(validInput(command(edit)),false,JSON.stringify(edit));
  assert.equal(validInput('edit '+Buffer.from('{broken').toString('base64')),false);
  assert.equal(validInput('edit /w=='),false);
});


test('HD screen mode selects the native-quality agent preset',async()=>{
  const {PassThrough,Writable}=require('node:stream'),{EventEmitter}=require('node:events');
  let selected;
  const app=createApp({port:0,disableActions:true,agentFactory:preset=>{
    selected=preset;const a=new EventEmitter();a.stdout=new PassThrough();a.stderr=new PassThrough();a.stdin=new Writable({write(data,enc,done){done();}});a.kill=()=>a.emit('close',0);a.stdin.on('finish',()=>a.emit('close',0));
    setImmediate(()=>{const body=Buffer.from(JSON.stringify({w:1920,h:1080})),header=Buffer.alloc(5);header[0]=1;header.writeUInt32BE(body.length,1);a.stdout.write(Buffer.concat([header,body]));});return a;
  }});
  await new Promise(r=>app.server.listen(0,'127.0.0.1',r));const port=app.server.address().port;let screen;
  try{
    const pairing=await request(port,'/api/pair','POST',{}),cookie=pairing.headers['set-cookie'][0].split(';')[0];
    screen=await new Promise((resolve,reject)=>{const req=http.get({hostname:'127.0.0.1',port,path:'/api/screen?p=hd',headers:{'X-PCR':'1',Cookie:cookie}},res=>res.once('data',()=>resolve({req,res})));req.on('error',reject);});
    assert.equal(screen.res.statusCode,200);assert.equal(selected,'hd');
    const bad=await request(port,'/api/screen?p=unknown','GET',undefined,{Cookie:cookie});assert.equal(bad.status,400);
  }finally{if(screen){screen.res.destroy();screen.req.destroy();}app.stop();await close(app);}
});
