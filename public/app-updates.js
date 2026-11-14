'use strict';
(()=>{
 function newer(left,right){const parse=text=>/^\d+\.\d+\.\d+$/.test(String(text))?String(text).split('.').map(Number):null,a=parse(left),b=parse(right);if(!a||!b)return false;for(let i=0;i<3;i++)if(a[i]!==b[i])return a[i]>b[i];return false;}
 function mount(){
  const settings=document.getElementById('workspaceSettings');if(!settings||document.getElementById('appUpdates'))return;
  const card=document.createElement('section');card.id='appUpdates';card.className='workspaceSettingsCard';card.innerHTML='<h3>App updates</h3><p data-version></p><button type="button" class="settingsQuietButton" data-check>Check for updates</button><button type="button" class="settingsQuietButton" data-install hidden>Update Android app</button><a class="settingsQuietButton" data-android-download hidden>Download Android update</a><a data-host-download hidden>Download Windows update</a><p class="settingsStatus" data-status role="status" aria-live="polite"></p>';
  (settings.querySelector('[data-settings-section="connection"] .settingsGroupContent')||settings).append(card);const q=selector=>card.querySelector(selector);let release=null,generation=0,ready=false,checking=null;
  const status=text=>q('[data-status]').textContent=text;
  function showRelease(){
   if(!release)return;
   const app=window.PCRNativeCapabilities?.version,available=app&&newer(release.latest,app),native=window.PCRNativeCapabilities?.appUpdates===true;
   q('[data-version]').textContent=(app?'Android · '+app+'   /   ':'')+'Windows host · '+release.currentHost;
   status(available?'Elleson Connect '+release.latest+' is available. '+(native?'Android will ask you to confirm installation.':'Download the APK, then open it from your phone’s Files app to install it.'):release.hostUpdateAvailable&&release.windows?'A Windows host update is available.':'You are up to date.');
   q('[data-install]').hidden=!available||!native;
   const link=q('[data-android-download]');link.hidden=!available||native||!release.android?.fileUrl;link.href=release.android?.fileUrl||'';link.download=release.android?.name||'';
   q('[data-host-download]').hidden=!release.hostUpdateAvailable||!release.windows;q('[data-host-download]').href='/api/updates/windows/download';q('[data-host-download]').download=release.windows?.name||'';
  }
  function refresh(){const app=window.PCRNativeCapabilities?.version;q('[data-version]').textContent=app?'Android app · '+app:'Elleson Connect · web app';card.hidden=window.PCRAuth?.role!=='owner';if(!card.hidden)showRelease();}
  q('[data-check]').onclick=async()=>{
   if(window.PCRAuth?.role!=='owner')return;
   const current=++generation;checking?.abort();const controller=new AbortController();checking=controller;const timeout=setTimeout(()=>controller.abort(),20000);
   release=null;ready=false;q('[data-install]').textContent='Update Android app';q('[data-check]').disabled=true;q('[data-install]').hidden=true;q('[data-android-download]').hidden=true;q('[data-host-download]').hidden=true;status('Checking published updates through your PC…');
   try{const edition=window.PCRNativeCapabilities?.phoneAccess?'phoneAccess':'standard',response=await fetch('/api/updates?refresh=1&edition='+edition,{headers:{'X-PCR':'1'},signal:controller.signal}),value=await response.json();if(current!==generation||window.PCRAuth?.role!=='owner')return;if(!response.ok)throw Error(value.error||'Could not check for updates.');release=value;showRelease();}
   catch(error){if(current===generation)status(error.name==='AbortError'?'The update check timed out. Check your PC’s connection and try again.':error.message);}
   finally{clearTimeout(timeout);if(checking===controller)checking=null;if(current===generation)q('[data-check]').disabled=false;}
  };
  q('[data-install]').onclick=()=>{if(window.PCRAuth?.role!=='owner')return;if(ready){window.PCRAndroid?.postMessage(JSON.stringify({type:'app-update-install'}));return;}if(!release)return;if(!window.PCRNativeCapabilities?.appUpdates){status('Download the signed Elleson Connect update from your trusted distribution source and open it in Android’s package installer. This edition does not request permission to install other apps.');return;}window.PCRAndroid.postMessage(JSON.stringify({type:'app-update',sha256:release.android.sha256,size:release.android.size,version:release.latest}));status('Preparing the verified update. Progress appears in your Android notification.');};
  q('[data-android-download]').onclick=()=>{if(window.PCRAuth?.role!=='owner'){return false;}status('Choose where to save the APK. When the download finishes, open it from your phone’s Files app to install it.');};
  window.addEventListener('pcr:app-update',event=>{if(window.PCRAuth?.role!=='owner'||!window.PCRNativeCapabilities?.appUpdates)return;status(event.detail?.message||'Update status changed.');ready=event.detail?.ready===true;if(ready){q('[data-install]').hidden=false;q('[data-install]').textContent='Install downloaded update';}});
  window.addEventListener('pcr:native-ready',refresh);window.addEventListener('pcr:auth',()=>{generation++;checking?.abort();release=null;ready=false;q('[data-check]').disabled=false;q('[data-install]').hidden=true;q('[data-android-download]').hidden=true;q('[data-install]').textContent='Update Android app';refresh();});refresh();
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(mount,0),{once:true});else setTimeout(mount,0);
})();
