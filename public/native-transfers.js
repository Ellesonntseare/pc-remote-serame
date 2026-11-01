'use strict';
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
    const sent=send({type:'transfer-shared',destination:''});inbox.querySelector('button').hidden=sent;
    if(!sent){sharing=false;status('Could not start sending. Tap Retry sending.',true);}
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
