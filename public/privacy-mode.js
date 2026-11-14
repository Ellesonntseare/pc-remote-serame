'use strict';
(()=>{
  const bar=document.getElementById('screenTools');if(!bar)return;
  const button=document.createElement('button');button.id='remotePrivacy';button.type='button';button.textContent='Privacy';button.title='Cover the physical PC displays while keeping your phone view';button.setAttribute('aria-pressed','false');button.hidden=true;bar.append(button);
  const note=document.createElement('p');note.className='remotePrivacyNote';note.setAttribute('role','status');note.hidden=true;note.textContent='The normal Windows desktop is covered. Windows security screens may still appear. Turn Privacy off here, or press Ctrl + Alt + Shift + P on the PC. It also ends if this connection is lost.';document.querySelector('.remoteOptionsPanel')?.append(note);
  let active=false,owned=false,timer=null,busy=false,generation=0;
  const failure=document.createElement('dialog');failure.id='privacyFailure';failure.className='privacyFailure';failure.setAttribute('aria-labelledby','privacyFailureTitle');failure.setAttribute('aria-describedby','privacyFailureReason');
  failure.innerHTML='<h2 id="privacyFailureTitle">Privacy mode could not start</h2><p id="privacyFailureReason"></p><p data-stage></p><p data-observed></p><p data-restored></p><p data-limit></p><label for="privacyFailureDetails">Diagnostic details</label><textarea id="privacyFailureDetails" readonly rows="7" spellcheck="false"></textarea><p data-copy-status role="status"></p><div class="privacyFailureActions"><button type="button" data-copy>Copy details</button><button type="button" data-close autofocus>Close</button></div>';
  document.body.append(failure);
  const alert=document.createElement('dialog');alert.className='privacyFailure';alert.setAttribute('aria-labelledby','privacyEndedTitle');
  alert.innerHTML='<h2 id="privacyEndedTitle">Privacy mode ended</h2><p data-privacy-ended></p><div class="privacyFailureActions"><button type="button">OK</button></div>';
  document.body.append(alert);alert.querySelector('button').onclick=()=>alert.close();
  let reconnectWarning=false;
  function warn(message,ended=false){
    alert.querySelector('h2').textContent=ended?'Privacy mode ended':'Check Privacy mode';
    alert.querySelector('[data-privacy-ended]').textContent=message;
    const parent=document.fullscreenElement||document.body;
    if(alert.parentElement!==parent)parent.append(alert);
    if(!alert.open)alert.showModal();
    window.PCRDeviceInput?.haptic?.();
  }
  failure.querySelector('[data-close]').onclick=()=>failure.close();
  failure.querySelector('[data-copy]').onclick=async()=>{
    const field=failure.querySelector('textarea'),status=failure.querySelector('[data-copy-status]');
    try{if(!navigator.clipboard?.writeText)throw Error('Clipboard unavailable');await navigator.clipboard.writeText(field.value);status.textContent='Details copied.';}
    catch{field.focus();field.select();let copied=false;try{copied=document.execCommand('copy');}catch{}status.textContent=copied?'Details copied.':'Details selected. Touch and hold the text, then choose Copy.';}
  };
  function showFailure(message,diagnostic){
    const data=diagnostic||{},labels={'startup-timeout':'Waiting for Windows capture to finish starting','helper-start':'Starting the Windows privacy helper','initialization':'Preparing Windows capture','capture-warmup':'Checking capture before covering the PC','cover-setup':'Creating the private display cover','restore-shortcut':'Setting up the PC restore shortcut','input-passthrough':'Checking mouse input through the cover','cover-exclusion':'Checking that capture can see behind the cover','live-update':'Checking that the hidden desktop still updates'};
    failure.querySelector('#privacyFailureReason').textContent=message||'The PC host did not return an error description.';
    failure.querySelector('[data-stage]').textContent='Failed step: '+(labels[data.stage]||'The host did not report a capture step.');
    failure.querySelector('[data-observed]').textContent=Number.isInteger(data.matched)?'The capture matched '+data.matched+' of '+data.samples+' test points; '+data.required+' were required. Capture restarts: '+data.restarts+'.':'';
    failure.querySelector('[data-restored]').textContent=data.displayRestored===true?'PC display restored: the privacy covers have been removed.':'The host has not confirmed the display state. If it is still covered, press Ctrl + Alt + Shift + P on the PC.';
    failure.querySelector('[data-limit]').textContent='These details identify the failed check. Windows may not report the underlying driver or graphics cause.';
    const lines=['Elleson Connect — Privacy diagnostic',message||'No error description',...Object.entries(data).filter(([key])=>key!=='events'&&key!=='message').map(([key,value])=>key+': '+value)];
    if(Array.isArray(data.events))lines.push('Capture checks: '+JSON.stringify(data.events));
    failure.querySelector('textarea').value=lines.join('\n');failure.querySelector('[data-copy-status]').textContent='';
    const parent=document.fullscreenElement||document.body;if(failure.parentElement!==parent)parent.append(failure);
    if(!failure.open)failure.showModal();
  }
  function draw(data){const before=active;active=data.active===true;owned=data.owned===true;button.setAttribute('aria-pressed',String(active));button.textContent=active?'Privacy on':'Privacy';button.hidden=window.PCRAuth?.role!=='owner'||data.available===false;note.hidden=!active;document.getElementById('rs').classList.toggle('privacyActive',active);clearTimeout(timer);if(active&&window.PCRAuth?.signedIn)timer=setTimeout(refresh,8000);if(before!==active)window.dispatchEvent(new Event('pcr:privacy-state'));}
  async function refresh(){
    if(busy){clearTimeout(timer);timer=setTimeout(refresh,1000);return;}
    const epoch=generation,controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),6000);
    try{
      const result=await api('/api/privacy',{...(active&&owned?{method:'POST',body:JSON.stringify({action:'heartbeat'})}:{}),signal:controller.signal});
      if(!result.ok)throw Error('Privacy status unavailable');
      if(epoch===generation){
        const ended=active&&owned&&!result.active;
        draw(result);reconnectWarning=false;
        if(ended)warn('The PC screen may be visible again. Turn Privacy on when you are ready to continue.',true);
      }
    }catch{
      if(epoch===generation&&active&&owned&&!reconnectWarning){
        reconnectWarning=true;
        warn('The connection to your PC was lost. The app cannot confirm that its screen is still covered.');
      }
    }finally{clearTimeout(timeout);if(epoch===generation&&active&&window.PCRAuth?.signedIn){clearTimeout(timer);timer=setTimeout(refresh,3000);}}
  }
  button.onclick=async()=>{if(busy)return;busy=true;button.disabled=true;const epoch=++generation;try{const result=await api('/api/privacy',{method:'POST',body:JSON.stringify({action:active?'stop':'start'})});if(epoch!==generation)return;if(!result.ok){showFailure(result.error||'Privacy mode is unavailable.',result.diagnostic);return;}draw(result);window.msg?.(result.active?'Privacy on · PC displays covered':'Privacy off · PC displays restored');}catch(error){if(epoch===generation)showFailure(error.message);}finally{busy=false;button.disabled=false;}};
  window.addEventListener('pcr:auth',()=>{generation++;clearTimeout(timer);if(window.PCRAuth?.role==='owner')void refresh();else{if(failure.open)failure.close();if(alert.open)alert.close();reconnectWarning=false;draw({available:false,active:false});}});
  window.addEventListener('pcr:page',event=>{if(event.detail?.id==='rs'&&window.PCRAuth?.role==='owner')void refresh();});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&active&&owned)void refresh();});
  window.addEventListener('pagehide',()=>{clearTimeout(timer);if(active&&owned)void fetch('/api/privacy',{method:'POST',headers:{'Content-Type':'application/json','X-PCR':'1'},body:JSON.stringify({action:'stop'}),keepalive:true}).catch(()=>{});});
  window.PCRPrivacy={get active(){return active;},refresh,routeInterrupted(){warn('The connection route changed. Check Privacy mode before continuing.');}};
})();
