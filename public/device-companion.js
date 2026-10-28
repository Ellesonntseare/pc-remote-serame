'use strict';
(()=>{
 function mount(){
  const settings=document.getElementById('workspaceSettings');if(!settings)return;
  const card=document.createElement('section');card.className='workspaceSettingsCard companionSettings';card.hidden=true;
  card.innerHTML='<h3>Shared clipboard & keyboard</h3><label><input type="checkbox" data-shared-clipboard checked>Copy and paste across my devices</label><label><input type="checkbox" data-shared-pictures checked>Include copied pictures</label><p data-companion-state role="status">Connecting to your PC…</p><button type="button" data-keyboard-setup>Set up Serame Keyboard</button><p data-keyboard-help>Keep your current keyboard for sync while PC Remote is open, or choose Serame Keyboard once for clipboard sync in other apps. Copy and paste normally after setup.</p>';
  (settings.querySelector('[data-settings-section=controls] .settingsGroupContent')||settings).append(card);
  const send=value=>window.PCRAndroid?.postMessage(JSON.stringify(value)),native=()=>!!window.PCRNativeCapabilities?.sharedClipboard;
  let linked='',page='',lastContext='',timer=null;
  function context(){const panel=document.getElementById('rs'),remote=panel&&!panel.classList.contains('hide'),id=remote?'rs':page,value={type:'companion-context',page:id,pcInput:remote&&document.getElementById('typeText')?.readOnly===false};const signature=JSON.stringify(value);if(linked&&signature!==lastContext){lastContext=signature;send(value);}}
  function update(){
   const auth=window.PCRAuth,caps=window.PCRNativeCapabilities,enabled=localStorage.getItem('pcr_sync_enabled')!=='false';
   const account=auth?.signedIn&&auth.role==='owner'&&enabled?auth.workspaceId:'';
   card.hidden=!native()||!account;
   if(!native())return;
   if(!account){if(linked)send({type:'companion-disconnect'});linked='';lastContext='';return;}
   const id=window.PCRSharedSync?.deviceId||caps.deviceId;if(!id)return;
   const key=account+':'+id;if(key!==linked){linked=key;send({type:'companion-connect',account,deviceId:id,name:caps.deviceName||'My phone'});context();}
   const prefs=window.PCRAccountWorkspace?.get('clipboard.preferences')||{};
   card.querySelector('[data-shared-clipboard]').checked=prefs.enabled!==false;card.querySelector('[data-shared-pictures]').checked=prefs.images!==false;
  }
  for(const [selector,key]of [['[data-shared-clipboard]','enabled'],['[data-shared-pictures]','images']])card.querySelector(selector).onchange=event=>{const workspace=window.PCRAccountWorkspace;if(!workspace?.ready){event.target.checked=!event.target.checked;return;}workspace.set('clipboard.preferences',{...workspace.get('clipboard.preferences'),[key]:event.target.checked});};
  card.querySelector('[data-keyboard-setup]').onclick=()=>send({type:'keyboard-settings'});
  window.addEventListener('pcr:companion-state',event=>{card.querySelector('[data-companion-state]').textContent=event.detail?.state||'Waiting for your PC';});
  window.addEventListener('pcr:page',event=>{page=event.detail?.id||'';context();});
  const panel=document.getElementById('typePanel');if(panel)new MutationObserver(context).observe(panel,{attributes:true,attributeFilter:['class']});
  for(const name of ['pcr:auth','pcr:native-ready','pcr:sync','pcr:account-workspace'])window.addEventListener(name,update);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden){linked='';update();context();}});
  settings.addEventListener('change',()=>{clearTimeout(timer);timer=setTimeout(update,0);});update();
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
})();
