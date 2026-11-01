'use strict';
(()=>{
  const dialog=document.createElement('dialog');dialog.id='uploadProgressScreen';dialog.className='uploadProgressScreen';dialog.setAttribute('aria-labelledby','uploadProgressTitle');dialog.setAttribute('aria-describedby','uploadProgressDetail');
  dialog.innerHTML='<div class="uploadProgressCard"><span class="uploadProgressEyebrow">ELLESON CONNECT</span><div class="uploadProgressRing" aria-hidden="true"><svg viewBox="0 0 120 120"><circle class="uploadRingTrack" cx="60" cy="60" r="52"/><circle class="uploadRingFill" cx="60" cy="60" r="52"/></svg><strong data-upload-percent>…</strong></div><h2 id="uploadProgressTitle">Sending to your PC</h2><p data-upload-name></p><p id="uploadProgressDetail" role="status" aria-live="polite">Preparing your files…</p><progress data-upload-bar max="100" aria-label="Upload progress"></progress><p class="uploadProgressHint" data-upload-hint>The file saves directly on your PC when sending finishes.</p><div class="uploadProgressActions"><button type="button" data-upload-pause>Pause</button><button type="button" data-upload-cancel>Cancel upload</button><button type="button" data-upload-replace hidden>Replace existing file</button><button type="button" data-upload-done hidden>Done</button></div><button type="button" class="uploadProgressBackground" data-upload-background>Continue in background</button></div>';
  document.body.append(dialog);const q=selector=>dialog.querySelector(selector),terminal=state=>['complete','cancelled'].includes(state);
  let source='',view=null,suppressed=false,preparing=false,seen=new Set(),tracked=new Set(),nativeRows=[],previousFocus=null;
  const post=value=>{try{window.PCRAndroid?.postMessage(JSON.stringify(value));}catch{}};
  function close(){if(dialog.open){if(dialog.close)dialog.close();else dialog.removeAttribute('open');}if(previousFocus?.isConnected)previousFocus.focus({preventScroll:true});}
  function open(){if(dialog.open||suppressed||!window.PCRAuth?.signedIn)return;previousFocus=document.activeElement;try{if(dialog.showModal)dialog.showModal();else dialog.setAttribute('open','');}catch{dialog.setAttribute('open','');}}
  function begin(next){source=next;suppressed=false;view=null;preparing=next==='native';if(preparing)tracked.clear();render({state:'preparing',name:'Preparing your files…',percent:0,total:0,completed:0});}
  function render(value){
    view=value;const done=terminal(value.state),paused=value.state==='paused',pending=value.state==='preparing',percent=done&&value.state==='complete'?100:Math.min(99,Math.max(0,Number(value.percent)||0));
    dialog.dataset.state=value.state;dialog.style.setProperty('--upload-progress',String(percent));dialog.setAttribute('aria-busy',String(!done&&!paused));
    q('#uploadProgressTitle').textContent=value.state==='complete'?'Saved on your PC':value.state==='cancelled'?'Upload cancelled':paused?'Upload paused':'Sending to your PC';
    q('[data-upload-name]').textContent=value.name||'Your files';q('[data-upload-percent]').textContent=done?(value.state==='complete'?'✓':'×'):pending?'…':Math.floor(percent)+'%';
    const detail=value.message||(pending?'Preparing your files…':done?value.completed+' '+(value.completed===1?'file saved':'files saved')+(value.cancelled?' · '+value.cancelled+' cancelled':''):paused?'Sending is paused. Resume when you are ready.':'File '+Math.min(value.total,(value.completed||0)+1)+' of '+value.total+' · '+Math.floor(percent)+'%');
    q('#uploadProgressDetail').textContent=detail;const bar=q('[data-upload-bar]');if(pending)bar.removeAttribute('value');else bar.value=percent;
    q('[data-upload-hint]').textContent=done?(value.state==='complete'?'Your files are on the PC. There is no extra download step.':'Files that finished sending stay on your PC.'):'The file saves directly on your PC when sending finishes.';
    q('[data-upload-pause]').hidden=done||pending;q('[data-upload-pause]').textContent=paused?'Resume':'Pause';q('[data-upload-cancel]').hidden=done;q('[data-upload-cancel]').disabled=pending;
    q('[data-upload-replace]').hidden=!value.replace;q('[data-upload-done]').hidden=!done;q('[data-upload-background]').hidden=done;q('[data-upload-background]').textContent=source==='browser'?'Keep using the app':'Continue in background';open();
  }
  function native(tasks){
    const rows=tasks.filter(row=>row.direction==='upload'&&typeof row.id==='string'),fresh=rows.filter(row=>!seen.has(row.id)),active=rows.filter(row=>!terminal(row.state));nativeRows=rows;
    const newBatch=fresh.some(row=>!terminal(row.state));
    if(newBatch&&(!tracked.size||source!=='native'||terminal(view?.state))){source='native';suppressed=false;tracked=new Set(active.map(row=>row.id));}
    if(preparing||source==='native'&&!terminal(view?.state))for(const row of fresh)tracked.add(row.id);
    if(!view&&active.length){source='native';tracked=new Set(active.map(row=>row.id));}
    seen=new Set(rows.map(row=>row.id));if(source!=='native'||!tracked.size)return;
    const batch=rows.filter(row=>tracked.has(row.id));if(!batch.length)return;preparing=false;
    const unfinished=batch.filter(row=>!terminal(row.state)),current=unfinished.find(row=>['running','saving'].includes(row.state))||unfinished[0]||batch.at(-1),completed=batch.filter(row=>row.state==='complete').length,cancelled=batch.filter(row=>row.state==='cancelled').length;
    const state=!unfinished.length?(cancelled?'cancelled':'complete'):unfinished.every(row=>row.state==='paused')?'paused':current.state==='queued'?'preparing':'sending';
    render({state,name:current.name||'Preparing your file…',percent:current.size>0?100*current.received/current.size:0,total:batch.length,completed,cancelled,message:state==='paused'?current.message:'',replace:state==='paused'&&!!current.conflictingETag&&window.PCRAuth?.role==='owner'});
  }
  function control(command){
    if(source==='native'){for(const row of nativeRows.filter(row=>tracked.has(row.id)&&!terminal(row.state))){if(command==='resume'&&row.state!=='paused'||command==='pause'&&row.state==='paused'||command==='replace'&&!row.conflictingETag)continue;post({type:'transfer-control',id:row.id,command});}}
    else document.getElementById(command==='cancel'?'filesCancel':command==='replace'?'filesReplaceExisting':'filesPause')?.click();
  }
  q('[data-upload-pause]').onclick=()=>control(view?.state==='paused'?'resume':'pause');q('[data-upload-cancel]').onclick=()=>control('cancel');q('[data-upload-replace]').onclick=()=>control('replace');q('[data-upload-done]').onclick=()=>{suppressed=true;close();};q('[data-upload-background]').onclick=()=>{suppressed=true;close();};dialog.addEventListener('cancel',event=>{event.preventDefault();suppressed=true;close();});
  function reset(){close();source='';view=null;preparing=false;suppressed=false;seen.clear();tracked.clear();nativeRows=[];}
  window.addEventListener('pcr:upload-start',()=>begin('browser'));
  window.addEventListener('pcr:upload-progress',event=>{if(source==='browser'&&event.detail)render(event.detail);});
  window.addEventListener('pcr:auth',reset);window.PCRUploadProgress={begin,native,reset,failed:message=>render({state:'paused',name:'Your shared files',percent:0,total:0,completed:0,message})};
})();
(()=>{
  const send=value=>{try{if(!window.PCRAndroid?.postMessage)return false;window.PCRAndroid.postMessage(JSON.stringify(value));return true;}catch{return false;}};
  const native=()=>window.PCRNativeCapabilities?.nativeTransfers&&window.PCRAuth?.signedIn;
  const autoReceive=()=>!!(native()&&window.PCRAndroid?.postMessage&&window.PCRAuth.role==='owner');
  let queue=[],sharedCount=0,hadSession=false,sharing=false,receiveTimer=null,receiveController=null,receiveEpoch=0,registeredAt=0;
  const pane=document.getElementById('filesPane');if(!pane)return;
  const section=document.createElement('section');section.className='nativeTransfers';section.hidden=true;section.innerHTML='<div class="fmSectionHead"><h3>Transfer queue</h3><span>Continues when you switch apps</span></div><div data-native-queue></div>';pane.prepend(section);
  const inbox=document.createElement('section');inbox.className='fmShareInbox';inbox.hidden=true;inbox.setAttribute('role','status');inbox.innerHTML='<div><strong data-share-count></strong><p>Shared files save automatically in the PC transfer folder.</p></div><button type="button" class="filesPrimary" hidden>Retry sending</button>';pane.prepend(inbox);inbox.querySelector('button').onclick=()=>{sharing=false;sendShared();};
  function status(message,error=false){const target=document.getElementById('filesStatus');if(target){target.textContent=message;target.dataset.error=String(error);}}
  function sendShared(){
    if(!native()||!sharedCount||sharing)return;
    sharing=true;inbox.hidden=false;inbox.querySelector('[data-share-count]').textContent='Sending '+sharedCount+' shared '+(sharedCount===1?'file':'files')+' to your PC…';
    // Android shares always use the PC inbox, independent of the folder/tab
    // being browsed. The native service owns the bytes and background transfer.
    window.PCRUploadProgress?.begin('native');const sent=send({type:'transfer-shared',destination:''});inbox.querySelector('button').hidden=sent;
    if(!sent){sharing=false;status('Could not start sending. Tap Retry sending.',true);window.PCRUploadProgress?.failed('Could not start sending. Close this screen and tap Retry sending.');}
  }
  async function receiveFiles(){
    if(!autoReceive()||document.hidden||receiveController)return;
    const epoch=receiveEpoch,controller=new AbortController();receiveController=controller;const timeout=setTimeout(()=>controller.abort(),8000);
    async function request(url,body){const response=await fetch(url,{headers:{'X-PCR':'1',...(body?{'Content-Type':'application/json'}:{})},...(body?{method:'POST',body:JSON.stringify(body)}:{}),signal:controller.signal});if(!response.ok)throw Error('File delivery is waiting for your PC.');return response.json();}
    const current=()=>epoch===receiveEpoch&&autoReceive()&&!document.hidden;
    try{
      const caps=window.PCRNativeCapabilities,id=caps.deviceId;
      if(typeof id!=='string'||!/^[-a-zA-Z0-9]{12,80}$/.test(id))return;
      // File delivery remains available when settings/clipboard sync is off.
      if(!registeredAt||Date.now()-registeredAt>30000){await request('/api/sync/register',{id,name:caps.deviceName||'My phone',platform:'android'});if(!current())return;registeredAt=Date.now();}
      const result=await request('/api/phone/inbox');if(!current())return;
      const offers=(Array.isArray(result.inbox)?result.inbox:[]).filter(item=>item.kind==='file'&&/^[a-f0-9-]{36}$/.test(item.id)&&typeof item.name==='string'&&typeof item.label==='string').slice(0,100).map(item=>({id:item.id,name:item.label,path:'/api/files/download?name='+encodeURIComponent(item.name),group:item.id}));
      // Native receipts suppress repeat downloads. Only the receiver acknowledges
      // a delivery after its bytes have been saved successfully on the phone.
      if(offers.length)send({type:'phone-file-offer',offers});
    }catch{ /* Keep the host inbox intact; the next poll retries the delivery. */ }
    finally{clearTimeout(timeout);if(receiveController===controller)receiveController=null;}
  }
  function updateReceiver(){
    if(autoReceive()&&!document.hidden){if(!receiveTimer)receiveTimer=setInterval(receiveFiles,5000);void receiveFiles();}
    else{clearInterval(receiveTimer);receiveTimer=null;receiveEpoch++;receiveController?.abort();receiveController=null;registeredAt=0;}
  }
  function ready(){const preference=pane.querySelector('.filesNotify');if(preference)preference.hidden=!!window.PCRNativeCapabilities?.nativeTransfers;if(native())send({type:'transfer-ready'});updateReceiver();}
  function draw(){
    if(native())window.PCRUploadProgress?.native(queue);
    section.hidden=!native()||!queue.length;const list=section.querySelector('[data-native-queue]');list.replaceChildren();
    for(const item of queue){const row=document.createElement('div');row.className='fmTransfer';const copy=document.createElement('div'),name=document.createElement('strong'),detail=document.createElement('small'),bar=document.createElement('progress');name.textContent=item.name||'Preparing file';detail.textContent=(item.direction==='upload'?'To PC':'To phone')+' · '+item.state+(item.message?' · '+item.message:'');bar.max=100;if(item.size>0)bar.value=Math.min(100,item.received/item.size*100);copy.append(name,detail,bar);row.append(copy);
      if(!['complete','cancelled'].includes(item.state))for(const command of [item.state==='paused'?'resume':'pause','cancel']){const button=document.createElement('button');button.type='button';button.className='filesSmallButton';button.textContent=command==='resume'&&item.message?'Retry':command[0].toUpperCase()+command.slice(1);button.onclick=()=>send({type:'transfer-control',id:item.id,command});row.append(button);}
      if(item.state==='paused'&&item.direction==='upload'&&item.conflictingETag&&window.PCRAuth?.role==='owner'){const replace=document.createElement('button');replace.type='button';replace.className='filesSmallButton';replace.textContent='Replace existing file';replace.onclick=()=>send({type:'transfer-control',id:item.id,command:'replace'});row.append(replace);}
      if(item.state==='complete'&&item.direction==='download'&&window.PCRNativeCapabilities?.transferActions)for(const command of ['open','share']){const button=document.createElement('button');button.type='button';button.className='filesSmallButton';button.textContent=command==='open'?'Open':'Share';button.onclick=()=>send({type:'transfer-file-action',id:item.id,command});row.append(button);}
      if(item.state==='complete'&&item.direction==='upload'&&item.pcName&&window.PCRAuth?.role==='owner'){const button=document.createElement('button');button.type='button';button.className='filesSmallButton';button.textContent='Show in PC folder';button.onclick=async()=>{button.disabled=true;try{const result=await api('/api/files/reveal',{method:'POST',body:JSON.stringify({name:item.pcName})});window.msg?.(result.ok?'File selected on your PC.':result.error);}finally{button.disabled=false;}};row.append(button);}list.append(row);
    }
    window.dispatchEvent(new CustomEvent('pcr:transfers',{detail:queue.slice(-20).map(item=>({name:item.name,percent:item.size>0?100*item.received/item.size:0,state:item.state==='running'?'sending':item.state}))}));
    const unfinished=queue.filter(item=>!['complete','cancelled'].includes(item.state)),current=unfinished.find(item=>['running','saving'].includes(item.state))||unfinished[0];window.dispatchEvent(new CustomEvent('pcr:transfer-summary',{detail:{source:'native',remaining:unfinished.length,paused:!!unfinished.length&&unfinished.every(item=>item.state==='paused'),percent:current?.size>0?100*current.received/current.size:0}}));
  }
  document.addEventListener('click',event=>{if(native()&&event.target.closest('#filesInput,#filesChoose,[data-phone-pick]')){event.preventDefault();event.stopImmediatePropagation();send({type:'transfer-pick',destination:window.PCRFileManager?.destination||''});}},true);
  window.addEventListener('pcr:transfer-queue',event=>{if(!native()||event.detail?.origin!==location.origin)return;const completed=new Set(queue.filter(item=>item.state==='complete').map(item=>item.id));queue=Array.isArray(event.detail.tasks)?event.detail.tasks:[];draw();if(queue.some(item=>item.state==='complete'&&!completed.has(item.id)))window.PCRFileManager?.refresh?.();});
  window.addEventListener('pcr:share-inbox',event=>{if(!native())return;const value=event.detail||{};sharedCount=Math.max(0,Math.min(200,Number(value.count)||0));if(!sharedCount){sharing=false;inbox.hidden=true;}if(value.open){document.querySelector('.filesHome')?.click();if(value.text){if(!sharedCount)document.getElementById('textTab')?.click();const note=document.getElementById('filesNote');if(note)note.value=value.text;}}sendShared();});
  window.addEventListener('pcr:sync',()=>void receiveFiles());
  window.addEventListener('pcr:second-screen-files',event=>{if(autoReceive()&&event.detail?.message)status(event.detail.message,true);});
  document.addEventListener('visibilitychange',updateReceiver);
  window.addEventListener('pagehide',()=>{clearInterval(receiveTimer);receiveTimer=null;receiveEpoch++;receiveController?.abort();receiveController=null;});
  window.addEventListener('pcr:native-ready',ready);window.addEventListener('pcr:page',event=>{if(event.detail?.id==='filesDialog')ready();});
  window.addEventListener('pcr:auth',()=>{receiveEpoch++;registeredAt=0;receiveController?.abort();receiveController=null;if(!window.PCRAuth?.signedIn){if(hadSession&&window.PCRNativeCapabilities?.nativeTransfers)send({type:'transfer-signout'});hadSession=false;queue=[];sharedCount=0;sharing=false;inbox.hidden=true;draw();updateReceiver();}else{hadSession=true;ready();}});window.PCRNativeTransfers={ready,receiveFiles,get autoReceive(){return autoReceive();}};ready();
})();
