'use strict';
(() => {
 let card=null,last=null;
 function send(type){try{window.PCRAndroid?.postMessage(JSON.stringify({type}));}catch{}}
 function paint(){
  const supported=window.PCRNativeCapabilities?.biometricSignIn===true&&!!window.PCRAndroid,owner=window.PCRAuth?.signedIn&&window.PCRAuth?.role==='owner';
  const group=document.querySelector('#workspaceSettings [data-settings-section=privacy] .settingsGroupContent');
  if(!card&&group){card=document.createElement('section');card.className='workspaceSettingsCard biometricSettings';card.innerHTML='<h4>Fingerprint / face sign-in</h4><p>Unlock your saved sign-in with Android biometrics when reopening this app. Enable Remember me when signing in to keep your session.</p><p data-bio-status role="status"></p><button type="button" data-bio-toggle>Enable fingerprint / face sign-in</button>';group.append(card);card.querySelector('button').onclick=()=>{if(!window.PCRAuth?.signedIn||window.PCRAuth?.role!=='owner')return;send(last?.enabled?'biometric-disable':'biometric-enable');};}
  if(!card)return;card.hidden=!supported||!owner;if(card.hidden)return;
  card.querySelector('[data-bio-status]').textContent=last?.message||'Checking Android biometric support…';const button=card.querySelector('button');button.textContent=last?.enabled?'Disable fingerprint / face sign-in':'Enable fingerprint / face sign-in';button.disabled=!last||(!last.available&&!last.enabled);
 }
 window.addEventListener('pcr:biometric-state',event=>{last=event.detail;paint();});
 function refresh(){paint();if(window.PCRNativeCapabilities?.biometricSignIn&&window.PCRAuth?.signedIn)send('biometric-status');}
 window.addEventListener('pcr:native-ready',refresh);window.addEventListener('pcr:auth',()=>{last=null;refresh();});
 function mount(){const settings=document.getElementById('workspaceSettings');if(settings)new MutationObserver(()=>{if(!card)paint();}).observe(settings,{childList:true,subtree:true});refresh();}
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
})();
