'use strict';
(() => {
  const form=document.getElementById('pairForm'),gate=document.getElementById('pairGate');
  if(!form||!gate)return;
  const waiting=document.createElement('section');waiting.className='guestWaitingPanel';waiting.hidden=true;
  waiting.innerHTML='<div class="guestWaitingPulse" aria-hidden="true">↗</div><h2>Waiting for Serame</h2><p>Your request is ready. Serame needs to sign in and approve you.</p><span id="guestWaitStatus" role="status" aria-live="polite">Waiting for approval…</span><button type="button" id="guestCancelRequest">Back to sign in</button>';
  form.append(waiting);
  const dialog=document.createElement('dialog');dialog.id='guestApprovalDialog';dialog.setAttribute('aria-labelledby','guestApprovalTitle');
  dialog.innerHTML='<div class="guestDialogHead"><div><span class="guestEyebrow">YOUR PC · YOUR CHOICE</span><h2 id="guestApprovalTitle">Guest access</h2></div><button type="button" id="guestClose" aria-label="Close guest access">✕</button></div><p class="guestDialogDescription">Approve a guest for this session. You can end their access here at any time.</p><div id="guestRequestsList"></div><div id="guestActiveList"></div><p id="guestManageStatus" role="status" aria-live="polite"></p>';
  document.body.append(dialog);
  const button=document.createElement('button');button.type='button';button.id='guestManageButton';button.textContent='Guests';button.hidden=true;document.getElementById('unpairBtn').before(button);
  const choices=[['screen','View PC screen','See everything visible on the PC screen.'],['control','Mouse & keyboard','Full control can open PC apps and files.'],['clipboard','PC clipboard','Read and replace the PC clipboard.'],['upload','Send files to PC','Upload files; existing PC transfers stay hidden.'],['download','Browse & download transfers','See all files in the shared transfer folder.'],['apps','App switcher','See window titles and switch apps; includes control.'],['audio','Listen to PC audio','Hear the PC’s output.'],['status','PC status','Show CPU, memory and uptime.'],['power','Power controls','Lock, sleep, restart, shut down or sign out.'],['media','Media controls','Change volume and control playback.'],['voice','Voice chat','Talk during this session.'],['whiteboard','Shared whiteboard','Draw together during this session.'],['chat','Session chat','Exchange messages with the owner in your private guest session.'],['notes','Shared notes & checklists','Edit session notes and checklist items together.']];
  const drafts=new Map(),durations=new Map();
  const ribbon=document.createElement('div');ribbon.className='guestAccountRibbon';ribbon.hidden=true;ribbon.innerHTML='<strong>Guest account</strong>';document.querySelector('.topbar').after(ribbon);
  const sessionClock=document.createElement('span');sessionClock.className='guestSessionClock';ribbon.append(sessionClock);
  const screenBadge=document.createElement('span');screenBadge.className='screenGuestBadge';screenBadge.textContent='Guest';screenBadge.hidden=true;document.querySelector('.screenTools')?.prepend(screenBadge);
  const warning=document.createElement('section');warning.className='guestExpiryNotice';warning.hidden=true;warning.setAttribute('aria-label','Guest session ending');warning.innerHTML='<div><strong>Guest session ending</strong><span data-time></span></div><button type="button" data-extend>Extend 30 min</button><button type="button" data-manage>Manage</button><p role="status"></p>';document.body.append(warning);
  let warningId='',guestChecking=false;
  async function refreshGuest(){
    const auth=window.PCRAuth;if(guestChecking||!auth?.signedIn||auth.role!=='guest')return;guestChecking=true;const id=auth.guestId;
    try{const result=await api('/api/session');if(window.PCRAuth!==auth||window.PCRAuth.guestId!==id)return;if(result.status===401){showPair('Your guest session has ended.');return;}if(result.ok&&Number.isFinite(result.until)){auth.until=result.until;updateClock();}}
    catch{}finally{guestChecking=false;}
  }
  function updateClock(){const auth=window.PCRAuth;const guest=auth?.signedIn&&auth.role==='guest';ribbon.hidden=!guest;screenBadge.hidden=!guest;sessionClock.hidden=!guest||!Number.isFinite(auth.until);if(sessionClock.hidden)return;const remaining=Math.max(0,Math.ceil((auth.until-Date.now())/1000));sessionClock.textContent=Math.floor(remaining/60)+':'+String(remaining%60).padStart(2,'0')+' left';ribbon.classList.toggle('ending',remaining<=120);if(!remaining)void refreshGuest();}
  function updateWarning(){
    const owner=window.PCRAuth?.signedIn&&window.PCRAuth.role==='owner';const next=owner?current.active.filter(g=>g.until>Date.now()&&g.until-Date.now()<=120000).sort((a,b)=>a.until-b.until)[0]:null;
    warning.hidden=!next;warningId=next?.id||'';if(!next)return;const seconds=Math.max(0,Math.ceil((next.until-Date.now())/1000));warning.querySelector('[data-time]').textContent=Math.floor(seconds/60)+':'+String(seconds%60).padStart(2,'0')+' left';
    const open=Array.from(document.querySelectorAll('dialog[open]')).at(-1),parent=open||document.body;warning.classList.toggle('inDialog',!!open);if(warning.parentElement!==parent){if(open)parent.prepend(warning);else parent.append(warning);}
  }
  async function extend(id,minutes,status,control){
    control.disabled=true;const account=window.PCRAuth;ownerRevision++;
    try{const result=await api('/api/guest/extend',{method:'POST',body:JSON.stringify({id,minutes})});ownerRevision++;if(window.PCRAuth!==account||account?.role!=='owner')return;if(!result.ok)throw Error(result.error||'Could not extend this session.');const guest=current.active.find(g=>g.id===id);if(guest)guest.until=result.until;status.textContent='Session extended by '+minutes+' minutes.';render();updateWarning();}
    catch(error){status.textContent=error.message||'Could not extend this session.';}finally{control.disabled=false;}
  }
  warning.querySelector('[data-extend]').addEventListener('click',()=>{if(warningId)void extend(warningId,30,warning.querySelector('p'),warning.querySelector('[data-extend]'));});
  warning.querySelector('[data-manage]').addEventListener('click',()=>{if(!dialog.open)dialog.showModal();void refreshOwner();});
  let waitingOnOwner=false,guestTimer=null,polling=false,ownerPolling=false,ownerRevision=0,seen=new Set(),current={requests:[],active:[]};
  const el=id=>document.getElementById(id);
  const endAllDialog=document.createElement('dialog');endAllDialog.id='guestEndAllConfirmation';endAllDialog.setAttribute('aria-labelledby','guestEndAllTitle');endAllDialog.innerHTML='<h2 id="guestEndAllTitle">End guest access?</h2><p data-confirm-count></p><p>Screen viewing, controls, transfers and session tools will disconnect immediately.</p><div class="guestEndAllActions"><button type="button" data-cancel>Keep connected</button><button type="button" data-confirm>End access</button></div><p data-result role="status"></p>';document.body.append(endAllDialog);let endAllIds=[],endAllBusy=false;
  function requestEndAll(){endAllIds=[...new Set(current.active.filter(guest=>guest.until>Date.now()).map(guest=>guest.id))];if(!endAllIds.length)return;endAllDialog.querySelector('[data-confirm-count]').textContent='This will disconnect '+endAllIds.length+' '+(endAllIds.length===1?'guest.':'guests.');endAllDialog.querySelector('[data-confirm]').textContent='End '+endAllIds.length+' '+(endAllIds.length===1?'guest':'guests');endAllDialog.querySelector('[data-result]').textContent='';endAllDialog.showModal();}
  endAllDialog.querySelector('[data-cancel]').addEventListener('click',()=>endAllDialog.close());endAllDialog.querySelector('[data-confirm]').addEventListener('click',async()=>{
    if(endAllBusy||window.PCRAuth?.role!=='owner'||!endAllIds.length)return;endAllBusy=true;const control=endAllDialog.querySelector('[data-confirm]');control.disabled=true;const ids=endAllIds.slice();
    try{const result=await api('/api/guest/revoke-all',{method:'POST',body:JSON.stringify({ids})});if(window.PCRAuth?.role!=='owner'||!endAllDialog.isConnected)return;if(!result.ok)throw Error(result.error||'Could not end guest access.');el('guestManageStatus').textContent=result.revoked+' '+(result.revoked===1?'guest disconnected.':'guests disconnected.');endAllDialog.close();await refreshOwner();}
    catch(error){if(endAllDialog.isConnected&&endAllDialog.open)endAllDialog.querySelector('[data-result]').textContent=error.message;}
    finally{endAllBusy=false;if(endAllDialog.isConnected)control.disabled=false;}
  });
  window.PCRCanAccess=key=>!!window.PCRAuth?.signedIn&&(window.PCRAuth.role==='owner'||window.PCRAuth.permissions?.[key]===true);
  const permission=(selector,key)=>{for(const node of document.querySelectorAll(selector))node.dataset.pcrDenied=String(!window.PCRCanAccess(key));};
  function applyPermissions(){
    const owner=window.PCRAuth?.signedIn&&window.PCRAuth.role==='owner';
    permission('.stats','status');const stats=document.querySelector('.stats');if(stats?.previousElementSibling?.matches('.section'))stats.previousElementSibling.dataset.pcrDenied=String(!window.PCRCanAccess('status'));
    permission('.power,.heroactions>.quick:not(.wide),.dashboardPowerTile','power');permission('.mediaWrap','media');const media=document.querySelector('.mediaWrap');if(media?.previousElementSibling?.matches('.section'))media.previousElementSibling.dataset.pcrDenied=String(!window.PCRCanAccess('media'));
    for(const node of document.querySelectorAll('.activity'))node.dataset.pcrDenied=String(!owner);const activity=document.querySelector('.activity');if(activity?.previousElementSibling?.matches('.section'))activity.previousElementSibling.dataset.pcrDenied=String(!owner);
    el('powerDrawer').dataset.pcrDenied=String(!owner&&!window.PCRCanAccess('power')&&(el('powerDrawer').classList.contains('dashboardPower')||!window.PCRCanAccess('media')));
    permission('#screenBtn,[data-ocr]','screen');permission('#pcAudioButton,#pcAudioHome','audio');permission('#pcAppsButton','apps');
    for(const node of document.querySelectorAll('#rsm,#rsk,.rsbot>button:not(#rsPresentation):not(#pcAudioButton):not(#pcAppsButton):not([data-files-button]):not([data-ocr]),#precisionLensControls'))node.dataset.pcrDenied=String(!window.PCRCanAccess('control'));
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
    const hint=document.createElement('p');hint.textContent='Choose permissions and how long this guest can stay. Your activity history stays private.';
    const duration=document.createElement('label');duration.className='guestDuration';duration.textContent='Access duration ';const timer=document.createElement('select');timer.setAttribute('aria-label','Guest session duration');
    for(const minutes of [5,15,30,60,120,240,480]){const option=document.createElement('option');option.value=minutes;option.textContent=minutes<60?minutes+' minutes':minutes/60+' hours';timer.append(option);}timer.value=durations.get(request.id)||120;timer.addEventListener('change',()=>durations.set(request.id,Number(timer.value)));duration.append(timer);
    let selected=drafts.get(request.id);if(!selected){selected=Object.fromEntries(choices.map(([key])=>[key,key==='screen']));drafts.set(request.id,selected);}
    const fields=document.createElement('div');fields.className='guestPermissions';const inputs=new Map();
    const allRow=document.createElement('label');allRow.className='guestSelectAll';const all=document.createElement('input');all.type='checkbox';all.dataset.selectAll='true';all.setAttribute('aria-label','Select all guest permissions');const allText=document.createElement('strong');allText.textContent='Select all';allRow.append(all,allText);
    function updateAll(){const count=choices.filter(([key])=>selected[key]).length;all.checked=count===choices.length;all.indeterminate=count>0&&count<choices.length;}
    all.addEventListener('change',()=>{for(const[key]of choices){selected[key]=all.checked;inputs.get(key).checked=all.checked;}updateAll();});fields.addEventListener('change',updateAll);updateAll();
    for(const [key,label,description]of choices){const row=document.createElement('label'),input=document.createElement('input'),text=document.createElement('span'),strong=document.createElement('strong'),small=document.createElement('small');input.type='checkbox';input.checked=selected[key];input.dataset.permission=key;strong.textContent=label;small.textContent=description;text.append(strong,small);row.append(input,text);fields.append(row);inputs.set(key,input);input.addEventListener('change',()=>{selected[key]=input.checked;if(key==='screen'&&!input.checked){selected.control=false;selected.apps=false;}if(key==='control'){if(input.checked)selected.screen=true;else selected.apps=false;}if(key==='apps'&&input.checked){selected.control=true;selected.screen=true;}for(const [key,node]of inputs)node.checked=selected[key];});}
    const actions=document.createElement('div');actions.className='guestActions';
    for(const [label,approve]of [['Deny',false],['Approve guest',true]]){const action=document.createElement('button');action.type='button';action.textContent=label;if(approve)action.className='guestApprove';action.addEventListener('click',async()=>{for(const item of actions.children)item.disabled=true;const r=await api('/api/guest/decide',{method:'POST',body:JSON.stringify({id:request.id,approve,permissions:selected,durationMinutes:Number(timer.value)})}).catch(()=>({error:'Could not reach your PC.'}));el('guestManageStatus').textContent=r.ok?(approve?'Guest approved.':'Guest declined.'):r.error;if(r.ok){drafts.delete(request.id);durations.delete(request.id);}await refreshOwner();});actions.append(action);}
    card.append(title,device,hint,duration,allRow,fields,actions);return card;
  }
  function render(){
    const list=el('guestRequestsList');list.replaceChildren(...current.requests.map(requestCard));
    if(!current.requests.length){const empty=document.createElement('p');empty.className='guestEmpty';empty.textContent='No guest requests waiting.';list.append(empty);}
    const active=el('guestActiveList');active.replaceChildren();
    if(current.active.length){const heading=document.createElement('div');heading.className='guestActiveHeading';const title=document.createElement('h3');title.textContent='Connected guests';const endAll=document.createElement('button');endAll.type='button';endAll.id='guestEndAllButton';endAll.textContent='End all guests';endAll.addEventListener('click',requestEndAll);heading.append(title,endAll);active.append(heading);}
    for(const guest of current.active){const row=document.createElement('article');row.className='guestActiveRow';const label=document.createElement('span');label.textContent=(guest.device||'Guest browser')+' · '+(choices.filter(([key])=>guest.permissions?.[key]).map(([,label])=>label).join(', ')||'No PC permissions');const time=document.createElement('small');time.className='guestActiveTime';time.dataset.until=guest.until;
      const actions=document.createElement('div');actions.className='guestActiveActions';const duration=document.createElement('select');duration.setAttribute('aria-label','Extra guest session time');for(const minutes of [15,30,60]){const option=document.createElement('option');option.value=minutes;option.textContent='+'+minutes+' min';duration.append(option);}duration.value='30';const more=document.createElement('button');more.type='button';more.textContent='Extend session';more.dataset.extendGuest=guest.id;more.addEventListener('click',()=>void extend(guest.id,Number(duration.value),el('guestManageStatus'),more));
      const end=document.createElement('button');end.type='button';end.textContent='End access';end.addEventListener('click',async()=>{end.disabled=true;const r=await api('/api/guest/revoke',{method:'POST',body:JSON.stringify({id:guest.id})}).catch(()=>({error:'Could not end access. Try again.'}));el('guestManageStatus').textContent=r.ok?'Guest disconnected.':r.error;await refreshOwner();});actions.append(duration,more,end);row.append(label,time,actions);active.append(row);}
    button.textContent='Guests'+(current.requests.length?' · '+current.requests.length:'');
    updateActiveTimes();updateWarning();
  }
  function updateActiveTimes(){for(const node of document.querySelectorAll('.guestActiveTime')){const seconds=Math.max(0,Math.ceil((Number(node.dataset.until)-Date.now())/1000));node.textContent=Math.floor(seconds/60)+':'+String(seconds%60).padStart(2,'0')+' remaining';}}
  async function refreshOwner(){
    if(ownerPolling||!paired||window.PCRAuth?.role!=='owner'||!window.PCRAuth?.guestEnabled||document.hidden)return;
    ownerPolling=true;
    const ownerAccount=window.PCRAuth,revision=ownerRevision;
    try{
      const result=await api('/api/guest/requests');if(!result.ok||window.PCRAuth!==ownerAccount||!paired||revision!==ownerRevision)return;
      const changed=JSON.stringify(current)!==JSON.stringify({requests:result.requests,active:result.active});
      const fresh=result.requests.some(request=>!seen.has(request.id));for(const request of result.requests)seen.add(request.id);
      current={requests:result.requests,active:result.active};if(changed)render();
      if(changed)window.dispatchEvent(new CustomEvent('pcr:guests',{detail:{active:current.active,requests:current.requests.length}}));
      if(fresh&&!dialog.open)dialog.showModal();
    }catch{}finally{ownerPolling=false;}
  }
  button.addEventListener('click',()=>{render();if(!dialog.open)dialog.showModal();void refreshOwner();});el('guestClose').addEventListener('click',()=>dialog.close());
  window.addEventListener('pcr:auth',event=>{leaveWaiting();endAllDialog.close();endAllIds=[];if(event.detail?.role==='guest'&&!event.detail.permissions?.clipboard){liveTyping=true;rsUpdateTypingUI();}applyPermissions();button.hidden=!event.detail?.signedIn||event.detail.role!=='owner'||!event.detail.guestEnabled;if(event.detail?.signedIn){void refreshOwner();}else{dialog.close();current={requests:[],active:[]};seen.clear();drafts.clear();}});
  setInterval(()=>{void refreshOwner().catch(()=>{});},2000);document.addEventListener('visibilitychange',()=>{void refreshOwner().catch(()=>{});});
  window.PCRGuestAccess={wait,leaveWaiting,applyPermissions};button.hidden=!(window.PCRAuth?.signedIn&&window.PCRAuth.role==='owner'&&window.PCRAuth.guestEnabled);applyPermissions();void refreshOwner();
  window.addEventListener('pcr:auth',()=>{updateClock();updateWarning();});setInterval(()=>{if(!document.hidden&&window.PCRAuth?.signedIn){updateClock();updateActiveTimes();updateWarning();}},1000);document.addEventListener('visibilitychange',()=>{if(!document.hidden){updateClock();updateActiveTimes();updateWarning();}});setInterval(()=>{if(!document.hidden)void refreshGuest();},5000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)void refreshGuest();});updateClock();
  if(!paired)void api('/api/guest/poll',{method:'POST',body:'{}'}).then(result=>{if(paired)return;if(result.state==='pending'){wait();}else if(result.state==='approved'){void init();}}).catch(()=>{});
})();
