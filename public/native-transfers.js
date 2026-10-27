'use strict';
(()=>{
  const send=value=>window.PCRAndroid?.postMessage(JSON.stringify(value));
  const native=()=>window.PCRNativeCapabilities?.nativeTransfers&&window.PCRAuth?.signedIn;
  let queue=[],sharedCount=0,hadSession=false;
  const pane=document.getElementById('filesPane');if(!pane)return;
  const section=document.createElement('section');section.className='nativeTransfers';section.hidden=true;section.innerHTML='<div class="fmSectionHead"><h3>Transfer queue</h3><span>Continues when you switch apps</span></div><div data-native-queue></div>';pane.prepend(section);
  const inbox=document.createElement('section');inbox.className='fmShareInbox';inbox.hidden=true;inbox.innerHTML='<div><strong data-share-count></strong><p>Choose the PC destination above, then send.</p></div><button type="button" class="filesPrimary">Send to PC</button>';pane.prepend(inbox);inbox.querySelector('button').onclick=()=>send({type:'transfer-shared',destination:window.PCRFileManager?.destination||''});
  function ready(){const preference=pane.querySelector('.filesNotify');if(preference)preference.hidden=!!window.PCRNativeCapabilities?.nativeTransfers;if(native())send({type:'transfer-ready'});}
  function draw(){
    section.hidden=!native()||!queue.length;const list=section.querySelector('[data-native-queue]');list.replaceChildren();
    for(const item of queue){const row=document.createElement('div');row.className='fmTransfer';const copy=document.createElement('div'),name=document.createElement('strong'),detail=document.createElement('small'),bar=document.createElement('progress');name.textContent=item.name||'Preparing file';detail.textContent=(item.direction==='upload'?'To PC':'To phone')+' · '+item.state+(item.message?' · '+item.message:'');bar.max=100;if(item.size>0)bar.value=Math.min(100,item.received/item.size*100);copy.append(name,detail,bar);row.append(copy);
      if(!['complete','cancelled'].includes(item.state))for(const command of [item.state==='paused'?'resume':'pause','cancel']){const button=document.createElement('button');button.type='button';button.className='filesSmallButton';button.textContent=command[0].toUpperCase()+command.slice(1);button.onclick=()=>send({type:'transfer-control',id:item.id,command});row.append(button);}list.append(row);
    }
    window.dispatchEvent(new CustomEvent('pcr:transfers',{detail:queue.slice(-20).map(item=>({name:item.name,percent:item.size>0?100*item.received/item.size:0,state:item.state==='running'?'sending':item.state}))}));
    const unfinished=queue.filter(item=>!['complete','cancelled'].includes(item.state)),current=unfinished.find(item=>['running','saving'].includes(item.state))||unfinished[0];window.dispatchEvent(new CustomEvent('pcr:transfer-summary',{detail:{source:'native',remaining:unfinished.length,paused:!!unfinished.length&&unfinished.every(item=>item.state==='paused'),percent:current?.size>0?100*current.received/current.size:0}}));
  }
  document.addEventListener('click',event=>{if(native()&&event.target.closest('#filesInput,#filesChoose,[data-phone-pick]')){event.preventDefault();event.stopImmediatePropagation();send({type:'transfer-pick',destination:window.PCRFileManager?.destination||''});}},true);
  window.addEventListener('pcr:transfer-queue',event=>{if(!native()||event.detail?.origin!==location.origin)return;const completed=new Set(queue.filter(item=>item.state==='complete').map(item=>item.id));queue=Array.isArray(event.detail.tasks)?event.detail.tasks:[];draw();if(queue.some(item=>item.state==='complete'&&!completed.has(item.id)))window.PCRFileManager?.refresh?.();});
  window.addEventListener('pcr:share-inbox',async event=>{if(!native())return;const value=event.detail||{};sharedCount=Number(value.count)||0;inbox.hidden=!sharedCount;inbox.querySelector('[data-share-count]').textContent=sharedCount+' shared '+(sharedCount===1?'file':'files')+' ready';if(value.open){document.querySelector('.filesHome')?.click();if(value.text){if(!sharedCount)document.getElementById('textTab')?.click();document.getElementById('filesNote').value=value.text;}}});
  window.addEventListener('pcr:native-ready',ready);window.addEventListener('pcr:page',event=>{if(event.detail?.id==='filesDialog')ready();});
  window.addEventListener('pcr:auth',()=>{if(!window.PCRAuth?.signedIn){if(hadSession&&window.PCRNativeCapabilities?.nativeTransfers)send({type:'transfer-signout'});hadSession=false;queue=[];inbox.hidden=true;draw();}else{hadSession=true;ready();}});window.PCRNativeTransfers={ready};ready();
})();
