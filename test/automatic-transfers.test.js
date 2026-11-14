'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),{JSDOM}=require('jsdom');
const {createApp}=require('../server');
const source=name=>fs.readFile(path.join(__dirname,'../public',name),'utf8');
async function until(check){for(let i=0;i<200;i++){if(await check())return;await new Promise(resolve=>setTimeout(resolve,10));}assert.fail('Timed out waiting for automatic file delivery');}
const id='12345678-1234-1234-1234-123456789012';
async function fixture(t,{native=true,signedIn=true,role='owner',settingsSync=true,fetcher}={}){
 const dom=new JSDOM('<div id="workspaceSettings"></div><section id="filesPane"></section><textarea id="filesNote"></textarea><button id="textTab"></button><button class="filesHome"></button><p id="filesStatus"></p>',{url:'http://pc.test',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window,messages=[],requests=[];
 w.PCRAuth={signedIn,role};w.PCRFileManager={destination:'@desktop/Unrelated folder'};if(!settingsSync)w.localStorage.setItem('pcr_sync_enabled','false');
 if(native){w.PCRNativeCapabilities={nativeTransfers:true,deviceId:'phone-test-123456',deviceName:'Test phone'};w.PCRAndroid={postMessage:value=>messages.push(JSON.parse(value))};}
 w.fetch=async(url,options={})=>{requests.push({url,options});if(fetcher)return fetcher(url,options);return{ok:true,json:async()=>url==='/api/phone/inbox'?{inbox:[]}:{}};};
 await w.eval(await source('native-transfers.js'));t.after(()=>{w.dispatchEvent(new w.Event('pagehide'));w.close();});
 return{w,d:w.document,messages,requests,emit:(name,detail)=>w.dispatchEvent(new w.CustomEvent(name,{detail}))};
}

test('Android shares start immediately in the PC transfer folder without a send or download click',async t=>{
 const f=await fixture(t);f.emit('pcr:share-inbox',{count:2,open:true});
 const sent=()=>f.messages.filter(row=>row.type==='transfer-shared');assert.deepEqual(sent(),[{type:'transfer-shared',destination:''}]);
 assert.match(f.d.querySelector('[data-share-count]').textContent,/Sending 2 shared files/);assert.equal(f.d.querySelector('.fmShareInbox button').hidden,true);
 f.emit('pcr:share-inbox',{count:2});assert.equal(sent().length,1,'repeated ready events do not enqueue the same share twice');
 f.emit('pcr:share-inbox',{count:0});assert.equal(f.d.querySelector('.fmShareInbox').hidden,true);
 f.emit('pcr:share-inbox',{count:1});assert.equal(sent().length,2,'the next distinct share also starts automatically');
});

test('upload screen shows preparation, real progress and confirmation only after the PC completes the file',async t=>{
 const f=await fixture(t),screen=f.d.getElementById('uploadProgressScreen'),queue=tasks=>f.emit('pcr:transfer-queue',{origin:f.w.location.origin,tasks});
 queue([{id:'old',direction:'upload',state:'complete',name:'Old file',size:10,received:10}]);assert.equal(screen.open,false,'old completed transfers do not open a loading screen');
 f.emit('pcr:share-inbox',{count:1});assert.equal(screen.open,true);assert.equal(screen.dataset.state,'preparing');
 const task={id:'new',direction:'upload',state:'running',name:'Photo + résumé.png',size:200,received:100};queue([task]);assert.equal(screen.querySelector('[data-upload-percent]').textContent,'50%');assert.equal(screen.querySelector('[data-upload-name]').textContent,task.name);
 queue([{...task,received:200}]);assert.equal(screen.querySelector('[data-upload-percent]').textContent,'99%');assert.match(screen.querySelector('h2').textContent,/Sending/);
 queue([{...task,state:'complete',received:200}]);assert.equal(screen.dataset.state,'complete');assert.equal(screen.querySelector('progress').value,100);assert.equal(screen.querySelector('h2').textContent,'Saved on your PC');screen.querySelector('[data-upload-done]').click();assert.equal(screen.open,false);queue([{...task,state:'complete',received:200}]);assert.equal(screen.open,false);
});

test('upload screen controls target only this upload batch and hiding it does not cancel sending',async t=>{
 const f=await fixture(t),screen=f.d.getElementById('uploadProgressScreen'),queue=tasks=>f.emit('pcr:transfer-queue',{origin:f.w.location.origin,tasks});
 const task={id:'upload',direction:'upload',state:'running',name:'Photo.png',size:100,received:30},download={...task,id:'download',direction:'download'};queue([task,download]);screen.querySelector('[data-upload-pause]').click();assert.deepEqual(f.messages.at(-1),{type:'transfer-control',id:'upload',command:'pause'});
 queue([{...task,state:'paused',message:'Connection interrupted.'},download]);assert.match(screen.textContent,/Connection interrupted/);screen.querySelector('[data-upload-pause]').click();assert.equal(f.messages.at(-1).command,'resume');screen.querySelector('[data-upload-cancel]').click();assert.equal(f.messages.at(-1).command,'cancel');
 const count=f.messages.length;screen.querySelector('[data-upload-background]').click();assert.equal(screen.open,false);queue([task,download]);assert.equal(screen.open,false);assert.equal(f.messages.length,count,'continuing in background does not pause or cancel the service');
 f.w.PCRAuth={signedIn:false};f.emit('pcr:auth');assert.equal(screen.open,false);
});

test('incoming downloads alone do not show an upload screen',async t=>{
 const f=await fixture(t);f.emit('pcr:transfer-queue',{origin:f.w.location.origin,tasks:[{id:'phone',direction:'download',state:'running',name:'Received.png',size:100,received:50}]});assert.equal(f.d.getElementById('uploadProgressScreen').open,false);
});

test('phone shares wait for connection and bridge failures retain an explicit retry',async t=>{
 const f=await fixture(t,{signedIn:false});f.emit('pcr:share-inbox',{count:1});assert.equal(f.messages.length,0);
 f.w.PCRAuth={signedIn:true,role:'owner'};f.emit('pcr:auth');assert.ok(f.messages.some(row=>row.type==='transfer-ready'));
 f.w.PCRAndroid.postMessage=()=>{throw Error('bridge unavailable');};f.emit('pcr:share-inbox',{count:1});assert.equal(f.d.querySelector('.fmShareInbox button').hidden,false);
 f.w.PCRAndroid.postMessage=value=>f.messages.push(JSON.parse(value));f.d.querySelector('.fmShareInbox button').click();assert.equal(f.messages.at(-1).type,'transfer-shared');
});

test('Android Share offers starred PC folders and retries the chosen destination',async t=>{
 const f=await fixture(t);
 f.w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
 f.w.HTMLDialogElement.prototype.close=function(){this.open=false;};
 f.w.PCRFileManager.state={favourites:['@downloads/Photos','@this-pc'],locations:[{id:'@downloads',label:'Downloads'}]};
 const send=f.w.PCRAndroid.postMessage;
 f.w.PCRAndroid.postMessage=()=>{throw Error('bridge unavailable');};
 f.emit('pcr:share-inbox',{count:1,open:true});
 const options=[...f.d.querySelectorAll('[data-share-folders] button')];
 assert.equal(options[0].closest('dialog').open,true);
 assert.deepEqual(options.map(button=>button.textContent),['Transfers','Downloads / Photos']);
 options[1].click();
 assert.equal(options[0].closest('dialog').open,false);
 const retry=f.d.querySelector('.fmShareInbox button');
 assert.equal(retry.textContent,'Retry sending');
 f.w.PCRAndroid.postMessage=send;
 retry.click();
 assert.deepEqual(f.messages.at(-1),{type:'transfer-shared',destination:'@downloads/Photos'});
});

test('incoming PC deliveries start the native saver even with settings sync disabled, without acknowledging early',async t=>{
 const f=await fixture(t,{settingsSync:false,fetcher:async url=>({ok:true,json:async()=>url==='/api/phone/inbox'?{inbox:[{id,kind:'file',name:'From PC/photo + résumé.png',label:'photo + résumé.png'},{id:'bad',kind:'file',name:'bad',label:'bad'},{id,kind:'link',text:'https://example.com'}]}:{}})});
 await until(()=>f.messages.some(row=>row.type==='phone-file-offer'));
 const offer=f.messages.find(row=>row.type==='phone-file-offer');assert.equal(offer.offers.length,1);assert.equal(offer.offers[0].name,'photo + résumé.png');assert.equal(offer.offers[0].path,'/api/files/download?name='+encodeURIComponent('From PC/photo + résumé.png'));
 assert.equal(f.requests[0].url,'/api/sync/register');assert.equal(JSON.parse(f.requests[0].options.body).id,'phone-test-123456');assert.ok(f.requests.every(row=>row.options.headers['X-PCR']==='1'));
 assert.ok(!f.requests.some(row=>row.url.includes('/ack')),'the native saver acknowledges only after saving the bytes');
});

test('browser sessions and guests do not automatically receive phone deliveries',async t=>{
 for(const options of [{native:false},{role:'guest'},{signedIn:false}]){const f=await fixture(t,options);await f.w.PCRNativeTransfers.receiveFiles();assert.equal(f.requests.length,0);assert.equal(f.w.PCRNativeTransfers.autoReceive,false);}
});

test('a delayed response cannot send another account files after sign-out',async t=>{
 let release;const f=await fixture(t,{fetcher:async url=>url==='/api/phone/inbox'?new Promise(resolve=>{release=()=>resolve({ok:true,json:async()=>({inbox:[{id,kind:'file',name:'private.jpg',label:'private.jpg'}]})});}):{ok:true,json:async()=>({})}});
 await until(()=>release);const request=f.requests.find(row=>row.url==='/api/phone/inbox');f.w.PCRAuth={signedIn:false};f.emit('pcr:auth');assert.equal(request.options.signal.aborted,true);release();await new Promise(setImmediate);assert.ok(!f.messages.some(row=>row.type==='phone-file-offer'));
});

test('Android delivery cards report automatic saving and cannot dismiss a file before it is saved',async t=>{
 const file={id,kind:'file',name:'photo.jpg',label:'photo.jpg'};
 const f=await fixture(t,{fetcher:async url=>({ok:true,json:async()=>url.startsWith('/api/sync/state')?{settings:{},devices:[],inbox:[file],revision:1}:url==='/api/phone/inbox'?{inbox:[]}:{devices:[]}})});
 f.w.crypto.randomUUID=()=>id;f.w.eval(await source('shared-sync.js'));f.d.dispatchEvent(new f.w.Event('DOMContentLoaded'));
 await until(()=>f.d.querySelector('.syncInboxItem'));const row=f.d.querySelector('.syncInboxItem');assert.match(row.textContent,/Saving automatically/);assert.equal(row.querySelector('a'),null);assert.equal(row.querySelector('button'),null);
});

test('PC upload writes a normal disk file and a queued PC delivery reaches the native saver with the original bytes',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'elleson-auto-transfer-'));const app=createApp({transferDirectory:root,disableAgent:true,disableActions:true,clipboardProvider:{get:async()=>'',set:async()=>{}}});await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
 const base='http://127.0.0.1:'+app.server.address().port;
 t.after(async()=>{app.stop();await new Promise(resolve=>app.server.close(resolve));assert.equal(path.dirname(root),os.tmpdir());assert.ok(path.basename(root).startsWith('elleson-auto-transfer-'));await fs.rm(root,{recursive:true,force:true});});
 const paired=await fetch(base+'/api/pair',{method:'POST',headers:{'X-PCR':'1'},body:'{}'}),cookie=paired.headers.getSetCookie()[0].split(';')[0];
 const call=async(url,options={})=>fetch(base+url,{...options,signal:undefined,headers:{'X-PCR':'1',Cookie:cookie,...options.headers}});
 const bytes=Buffer.from('Synthetic phone picture bytes'),upload=await(await call('/api/files/uploads',{method:'POST',body:JSON.stringify({name:'phone-picture.jpg',size:bytes.length})})).json();
 const uploaded=await call('/api/files/uploads/'+upload.id+'?offset=0',{method:'PUT',body:bytes});assert.equal(uploaded.status,200);assert.deepEqual(await fs.readFile(path.join(root,'phone-picture.jpg')),bytes,'the upload itself saves directly on the PC drive');
 const f=await fixture(t,{fetcher:call});await until(()=>f.requests.some(row=>row.url==='/api/phone/inbox'));
 const queued=await call('/api/host/send',{method:'POST',body:JSON.stringify({files:[path.join(root,'phone-picture.jpg')],target:'phone-test-123456'})});assert.equal(queued.status,200);
 await until(async()=>{await f.w.PCRNativeTransfers.receiveFiles();return f.messages.some(row=>row.type==='phone-file-offer');});const offer=f.messages.find(row=>row.type==='phone-file-offer').offers[0];const download=await call(offer.path);assert.equal(download.status,200);assert.deepEqual(Buffer.from(await download.arrayBuffer()),bytes);
 const pending=await(await call('/api/phone/inbox')).json();assert.equal(pending.inbox.length,1,'the delivery remains pending until Android reports a successful save');
});
