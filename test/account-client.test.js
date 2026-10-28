'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{JSDOM}=require('jsdom');
const {createApp}=require('../server');
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(predicate){for(let i=0;i<150;i++){if(await predicate())return;await sleep(30);}throw Error('Account client condition timed out.');}
test('two device clients share saved state and history without replay, and pending changes recover after disconnect',async t=>{
  const app=createApp({password:'account-client-check',disableAgent:true,disableActions:true});await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+app.server.address().port,windows=[];
  t.after(async()=>{for(const w of windows){w.PCRAuth={signedIn:false};w.dispatchEvent(new w.Event('pcr:auth'));w.close();}app.stop();app.server.closeAllConnections?.();await new Promise(resolve=>app.server.close(resolve));});
  const cookie=(await fetch(base+'/api/pair',{method:'POST',headers:{'X-PCR':'1'},body:JSON.stringify({password:'account-client-check'})})).headers.get('set-cookie').split(';')[0];
  const call=async(route,body)=>{const response=await fetch(base+route,{headers:{'X-PCR':'1',Cookie:cookie},...(body?{method:'POST',body:JSON.stringify(body)}:{})});return response.json();};
  function device(){
    const dom=new JSDOM('<dialog id="missionActivity"><header><h2>History</h2></header><div class="mcActivityList"></div></dialog><dialog id="workspaceSettings"></dialog><div class="activityHead"></div><span id="activityCount"></span><textarea id="filesNote"></textarea>',{url:base,runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window;windows.push(w);let offline=false,workspace={favourites:[],view:'details',sorting:{field:'name',descending:false},location:{path:'',destination:'',selection:[],positions:{}},tabs:{items:[''],active:0}},replayed=0;
    w.AbortController=global.AbortController;w.PCRAuth={signedIn:true,workspaceId:'owner',role:'owner'};w.fetch=(route,options={})=>offline?Promise.reject(Error('offline')):fetch(base+route,{...options,headers:{...options.headers,Cookie:cookie}});w.PCRFileManager={get workspace(){return workspace;},applyWorkspace(data){for(const name of ['favourites','view','location','tabs'])if(data['files.'+name]!==undefined)workspace[name]=JSON.parse(JSON.stringify(data['files.'+name]));if(data['files.sorting'])workspace.sorting=data['files.sorting'];}};w.PCRAndroid={postMessage(){replayed++;}};w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;};
    w.eval(fs.readFileSync(path.join(__dirname,'../public/account-workspace.js'),'utf8'));return{w,get workspace(){return workspace;},get replayed(){return replayed;},offline(value){offline=value;},change(value){workspace.location=value;w.dispatchEvent(new w.Event('pcr:files-state'));}};
  }
  const a=device(),b=device();await until(()=>a.w.PCRAccountWorkspace?.ready&&b.w.PCRAccountWorkspace?.ready);
  assert.equal(a.w.document.querySelector('.accountHistoryFilters select option[value=clipboard]').textContent,'Clipboard');
  a.change({path:'@downloads',destination:'@downloads',selection:['@downloads/one.txt'],positions:{'@downloads':320}});
  try{await until(()=>b.workspace.location.path==='@downloads');}catch(error){console.log({server:await call('/api/workspace'),a:a.workspace,b:b.workspace,as:a.w.document.querySelector('.accountSyncState').textContent,bs:b.w.document.querySelector('.accountSyncState').textContent,cache:a.w.localStorage.getItem('pcr_account_workspace_v1:'+base+':owner')});throw error;}assert.equal(b.workspace.location.positions['@downloads'],320);assert.deepEqual(Array.from(b.workspace.location.selection),['@downloads/one.txt']);assert.equal(b.replayed,0);
  a.w.PCRAccountWorkspace.record('audio.started','Phone microphone started',{source:'phone'},'durable-audio-event');
  await until(async()=> (await call('/api/history?type=audio')).events.length===1);b.w.PCRAccountHistory.open('audio');await until(()=>b.w.document.querySelectorAll('.accountHistoryEntry').length===1);assert.match(b.w.document.querySelector('.accountHistoryEntry').textContent,/Phone microphone started/);
  b.workspace.location.positions['@downloads']=470;
  a.offline(true);a.w.PCRAccountWorkspace.set('drafts.compose','Text kept while disconnected');await sleep(200);assert.match(a.w.localStorage.getItem('pcr_account_workspace_v1:'+base+':owner'),/Text kept while disconnected/);a.offline(false);a.w.dispatchEvent(new a.w.Event('online'));await until(()=>b.w.document.getElementById('filesNote').value==='Text kept while disconnected');assert.equal(a.replayed+b.replayed,0);assert.equal(b.workspace.location.positions['@downloads'],470,'unrelated activity must not reset the working scroll position');
  const localEvents=(await call('/api/history?type=audio')).events;assert.equal(localEvents.length,1);
});
