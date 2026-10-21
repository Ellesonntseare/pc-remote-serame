'use strict';
(() => {
  const form=document.getElementById('pairForm'),gate=document.getElementById('pairGate');
  if(!form||!gate)return;
  const note=document.createElement('p');note.className='guestLoginNote';note.textContent='Guest access requires your approval.';form.querySelector('.pairHelp').before(note);
  const waiting=document.createElement('section');waiting.className='guestWaitingPanel';waiting.hidden=true;
  waiting.innerHTML='<div class="guestWaitingPulse" aria-hidden="true">↗</div><h2>Waiting for Serame</h2><p>Your request is ready. Serame needs to sign in and approve you.</p><span id="guestWaitStatus" role="status" aria-live="polite">Waiting for approval…</span><button type="button" id="guestCancelRequest">Back to sign in</button>';
  form.append(waiting);
  const dialog=document.createElement('dialog');dialog.id='guestApprovalDialog';dialog.setAttribute('aria-labelledby','guestApprovalTitle');
  dialog.innerHTML='<div class="guestDialogHead"><div><span class="guestEyebrow">YOUR PC · YOUR CHOICE</span><h2 id="guestApprovalTitle">Guest access</h2></div><button type="button" id="guestClose" aria-label="Close guest access">✕</button></div><p class="guestDialogDescription">Approve a guest for this session. You can end their access here at any time.</p><div id="guestRequestsList"></div><div id="guestActiveList"></div><p id="guestManageStatus" role="status" aria-live="polite"></p>';
  document.body.append(dialog);
  const button=document.createElement('button');button.type='button';button.id='guestManageButton';button.textContent='Guests';button.hidden=true;document.getElementById('unpairBtn').before(button);
  const choices=[['screen','View PC screen','See everything visible on the PC screen.'],['control','Mouse & keyboard','Full control can open PC apps and files.'],['clipboard','PC clipboard','Read and replace the PC clipboard.'],['upload','Send files to PC','Upload files; existing PC transfers stay hidden.'],['download','Browse & download transfers','See all files in the shared transfer folder.'],['apps','App switcher','See window titles and switch apps; includes control.'],['audio','Listen to PC audio','Hear the PC’s output.'],['status','PC status','Show CPU, memory and uptime.'],['power','Power controls','Lock, sleep, restart, shut down or sign out.'],['media','Media controls','Change volume and control playback.']];
  const drafts=new Map();
  let waitingOnOwner=false,guestTimer=null,polling=false,ownerPolling=false,seen=new Set(),current={requests:[],active:[]};
  const el=id=>document.getElementById(id);
  window.PCRCanAccess=key=>!!window.PCRAuth?.signedIn&&(window.PCRAuth.role==='owner'||window.PCRAuth.permissions?.[key]===true);
  const permission=(selector,key)=>{for(const node of document.querySelectorAll(selector))node.dataset.pcrDenied=String(!window.PCRCanAccess(key));};
  function applyPermissions(){
    const owner=window.PCRAuth?.signedIn&&window.PCRAuth.role==='owner';
    permission('.stats','status');const stats=document.querySelector('.stats');if(stats?.previousElementSibling)stats.previousElementSibling.dataset.pcrDenied=String(!window.PCRCanAccess('status'));
    permission('.power,.heroactions>.quick:not(.wide)','power');permission('.mediaWrap','media');const media=document.querySelector('.mediaWrap');if(media?.previousElementSibling)media.previousElementSibling.dataset.pcrDenied=String(!window.PCRCanAccess('media'));
    for(const node of document.querySelectorAll('.activity'))node.dataset.pcrDenied=String(!owner);const activity=document.querySelector('.activity');if(activity?.previousElementSibling)activity.previousElementSibling.dataset.pcrDenied=String(!owner);
    el('powerDrawer').dataset.pcrDenied=String(!owner&&!window.PCRCanAccess('power')&&!window.PCRCanAccess('media'));
    permission('#screenBtn','screen');permission('#pcAudioButton,#pcAudioHome','audio');permission('#pcAppsButton','apps');
    for(const node of document.querySelectorAll('#rsm,#rsk,.rsbot>button:not(#rsPresentation):not(#pcAudioButton):not(#pcAppsButton):not([data-files-button]),#precisionLensControls'))node.dataset.pcrDenied=String(!window.PCRCanAccess('control'));
    el('rs').classList.toggle('guestViewOnly',!owner&&!window.PCRCanAccess('control'));
    permission('#typingMode,#sendText','clipboard');
    for(const node of document.querySelectorAll('.filesHome,[data-files-button]'))node.dataset.pcrDenied=String(!['upload','download','clipboard'].some(window.PCRCanAccess));
    permission('#filesDrop,.filesRecovery,.textFileExtras','upload');permission('.filesListHeader,.filesSearch:has(#filesSearch),#filesList,#filesFolderPath','download');permission('#textTab','clipboard');permission('#filesTab','upload');
    // Download-only guests still need the Files tab.
    if(el('filesTab'))el('filesTab').dataset.pcrDenied=String(!window.PCRCanAccess('upload')&&!window.PCRCanAccess('download'));
    if(el('filesFolder'))el('filesFolder').dataset.pcrDenied=String(!owner);
  }
  const applyLater=()=>queueMicrotask(applyPermissions);new MutationObserver(applyLater).observe(document.querySelector('.app'),{subtree:true,childList:true});new MutationObserver(applyLater).observe(document.querySelector('.rsbot'),{childList:true});
  function leaveWaiting(){waitingOnOwner=false;clearTimeout(guestTimer);waiting.hidden=true;form.classList.remove('guestWaiting');el('pairSubmit').disabled=false;}
  async function checkWait(){
    if(!waitingOnOwner||polling)return;polling=true;
    try{
      const result=await api('/api/guest/poll',{method:'POST',body:'{}'});
      if(!waitingOnOwner)return;
      if(result.state==='approved'||result.state==='signed-in'){leaveWaiting();await init();return;}
      if(result.state==='denied'||result.state==='expired'){leaveWaiting();showPair(result.state==='denied'?'Your guest request was declined.':'This request expired. Sign in again to send a new request.');return;}
      el('guestWaitStatus').textContent='Waiting for approval…';
    }catch{el('guestWaitStatus').textContent='Reconnecting to your request…';}
    finally{polling=false;if(waitingOnOwner)guestTimer=setTimeout(checkWait,2000);}
  }
  function wait(){showPair();waitingOnOwner=true;waiting.hidden=false;form.classList.add('guestWaiting');el('pairSubmit').disabled=true;void checkWait();}
  el('guestCancelRequest').addEventListener('click',async()=>{leaveWaiting();try{await api('/api/guest/cancel',{method:'POST',body:'{}'});}catch{}showPair();});
  function requestCard(request){
    const card=document.createElement('article');card.className='guestRequestCard';
    const title=document.createElement('h3');title.textContent='A guest wants to connect';
    const device=document.createElement('p');device.className='guestDevice';device.textContent=request.device||'Guest browser';
    const hint=document.createElement('p');hint.textContent='Choose what to share for up to 2 hours. Your activity history always stays private.';
    let selected=drafts.get(request.id);if(!selected){selected=Object.fromEntries(choices.map(([key])=>[key,key==='screen']));drafts.set(request.id,selected);}
    const fields=document.createElement('div');fields.className='guestPermissions';const inputs=new Map();
    for(const [key,label,description]of choices){const row=document.createElement('label'),input=document.createElement('input'),text=document.createElement('span'),strong=document.createElement('strong'),small=document.createElement('small');input.type='checkbox';input.checked=selected[key];input.dataset.permission=key;strong.textContent=label;small.textContent=description;text.append(strong,small);row.append(input,text);fields.append(row);inputs.set(key,input);input.addEventListener('change',()=>{selected[key]=input.checked;if(key==='screen'&&!input.checked){selected.control=false;selected.apps=false;}if(key==='control'){if(input.checked)selected.screen=true;else selected.apps=false;}if(key==='apps'&&input.checked){selected.control=true;selected.screen=true;}for(const [key,node]of inputs)node.checked=selected[key];});}
    const actions=document.createElement('div');actions.className='guestActions';
    for(const [label,approve]of [['Deny',false],['Approve guest',true]]){const action=document.createElement('button');action.type='button';action.textContent=label;if(approve)action.className='guestApprove';action.addEventListener('click',async()=>{for(const item of actions.children)item.disabled=true;const r=await api('/api/guest/decide',{method:'POST',body:JSON.stringify({id:request.id,approve,permissions:selected})}).catch(()=>({error:'Could not reach your PC.'}));el('guestManageStatus').textContent=r.ok?(approve?'Guest approved.':'Guest declined.'):r.error;if(r.ok)drafts.delete(request.id);await refreshOwner();});actions.append(action);}
    card.append(title,device,hint,fields,actions);return card;
  }
  function render(){
    const list=el('guestRequestsList');list.replaceChildren(...current.requests.map(requestCard));
    if(!current.requests.length){const empty=document.createElement('p');empty.className='guestEmpty';empty.textContent='No guest requests waiting.';list.append(empty);}
    const active=el('guestActiveList');active.replaceChildren();
    if(current.active.length){const title=document.createElement('h3');title.textContent='Connected guests';active.append(title);}
    for(const guest of current.active){const row=document.createElement('div');row.className='guestActiveRow';const label=document.createElement('span');label.textContent=(guest.device||'Guest browser')+' · '+(choices.filter(([key])=>guest.permissions?.[key]).map(([,label])=>label).join(', ')||'No PC permissions');const end=document.createElement('button');end.type='button';end.textContent='End access';end.addEventListener('click',async()=>{end.disabled=true;const r=await api('/api/guest/revoke',{method:'POST',body:JSON.stringify({id:guest.id})}).catch(()=>({error:'Could not end access. Try again.'}));el('guestManageStatus').textContent=r.ok?'Guest disconnected.':r.error;await refreshOwner();});row.append(label,end);active.append(row);}
    button.textContent='Guests'+(current.requests.length?' · '+current.requests.length:'');
  }
  async function refreshOwner(){
    if(ownerPolling||!paired||window.PCRAuth?.role!=='owner'||!window.PCRAuth?.guestEnabled||document.hidden)return;
    ownerPolling=true;
    try{
      const result=await api('/api/guest/requests');if(!result.ok)return;
      const changed=JSON.stringify(current)!==JSON.stringify({requests:result.requests,active:result.active});
      const fresh=result.requests.some(request=>!seen.has(request.id));for(const request of result.requests)seen.add(request.id);
      current={requests:result.requests,active:result.active};if(changed)render();
      if(fresh&&!dialog.open)dialog.showModal();
    }catch{}finally{ownerPolling=false;}
  }
  button.addEventListener('click',()=>{render();if(!dialog.open)dialog.showModal();void refreshOwner();});el('guestClose').addEventListener('click',()=>dialog.close());
  window.addEventListener('pcr:auth',event=>{leaveWaiting();if(event.detail?.role==='guest'&&!event.detail.permissions?.clipboard){liveTyping=true;rsUpdateTypingUI();}applyPermissions();button.hidden=!event.detail?.signedIn||event.detail.role!=='owner'||!event.detail.guestEnabled;if(event.detail?.signedIn){void refreshOwner();}else{dialog.close();current={requests:[],active:[]};seen.clear();drafts.clear();}});
  setInterval(()=>{void refreshOwner().catch(()=>{});},2000);document.addEventListener('visibilitychange',()=>{void refreshOwner().catch(()=>{});});
  window.PCRGuestAccess={wait,leaveWaiting,applyPermissions};button.hidden=!(window.PCRAuth?.signedIn&&window.PCRAuth.role==='owner'&&window.PCRAuth.guestEnabled);applyPermissions();void refreshOwner();
  if(!paired)void api('/api/guest/poll',{method:'POST',body:'{}'}).then(result=>{if(paired)return;if(result.state==='pending'){wait();}else if(result.state==='approved'){void init();}}).catch(()=>{});
})();
