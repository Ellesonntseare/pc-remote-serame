'use strict';
(() => {
  const native = value => {try {window.PCRAndroid?.postMessage(JSON.stringify(value));} catch {}};
  const hasNative = () => typeof window.PCRAndroid?.postMessage === 'function';
  const read = (key, fallback) => {try {const value=localStorage.getItem(key);return value===null?fallback:value==='true';}catch{return fallback;}};
  const write = (key,value) => {try{localStorage.setItem(key,String(value));}catch{}};
  let vibration=read('pcr_haptics',true),volumeKeys=read('pcr_volume_keys',false),nativeVolume=false,lastHaptic=-100,volumePending=0,volumeBusy=false;
  let settingsStatus;
  const remoteActive=()=>typeof rs!=='undefined'&&rs.on&&!document.hidden&&!document.getElementById('rs').classList.contains('hide');
  function haptic(){
    if(!vibration||document.hidden||!window.PCRCanAccess?.('control'))return;
    const now=performance.now();if(now-lastHaptic<40)return;lastHaptic=now;
    if(hasNative())native({type:'haptic'});else navigator.vibrate?.(9);
  }
  function focusKeyboard(){if(hasNative())native({type:'keyboard'});}
  function hideKeyboard(){if(hasNative())native({type:'keyboard-hide'});}
  function syncVolume(){const enabled=hasNative()&&volumeKeys&&!!window.PCRAuth?.signedIn&&!!window.PCRCanAccess?.('media')&&!document.hidden;if(enabled!==nativeVolume){nativeVolume=enabled;native({type:'volume-keys',enabled});}}
  async function volume(action){
    if(!volumeKeys||document.hidden||!window.PCRCanAccess?.('media')||!['volup','voldown'].includes(action))return;
    volumePending=Math.max(-8,Math.min(8,volumePending+(action==='volup'?1:-1)));if(volumeBusy)return;
    volumeBusy=true;
    try{while(volumePending&&volumeKeys&&!document.hidden&&window.PCRCanAccess?.('media')){const next=volumePending>0?'volup':'voldown';volumePending+=volumePending>0?-1:1;const result=await api('/api/cmd',{method:'POST',body:JSON.stringify({action:next})});if(!result.ok)throw Error(result.error||'PC volume is unavailable.');}}
    catch(error){volumePending=0;msg(error.message);}finally{volumeBusy=false;}
  }
  function screenshot(){
    if(!remoteActive()||!window.PCRCanAccess?.('screen'))return;
    const canvas=document.getElementById('rsc');if(!canvas.width||!canvas.height){msg('Wait for a PC picture first.');return;}
    const name='Elleson-Connect-'+new Date().toISOString().replace(/[:.]/g,'-')+'.png';
    if(hasNative()){const data=canvas.toDataURL('image/png').split(',')[1];if(data.length>12*1024*1024){msg('This screen image is too large. Reduce quality and try again.');return;}window.PCRAccountWorkspace?.record('screenshot.prepared','Screen screenshot ready',{name});native({type:'save-image',name,data});return;}
    canvas.toBlob(blob=>{if(!blob)return;window.PCRAccountWorkspace?.record('screenshot.prepared','Screen screenshot ready',{name,size:blob.size});const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=name;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);msg('Screenshot ready to save.');},'image/png');
  }
  async function saveWake(){
    if(!hasNative()||window.PCRAuth?.role!=='owner')return;
    try{const data=await api('/api/wake');if(!data.ok||window.PCRAuth?.role!=='owner')return;const selected=localStorage.getItem('pcr_wake_mac'),target=data.networks.find(item=>item.mac===selected)||data.networks.find(item=>item.mac&&item.mac!=='00:00:00:00:00:00'&&!/virtual|loopback|vpn|tailscale/i.test(item.name));if(target){native({type:'wake-config',mac:target.mac});if(settingsStatus)settingsStatus.textContent='Wake target saved for the Android connection screen. Use it on the PC’s Wi-Fi when the PC is asleep.';}}
    catch{}
  }
  function mount(){
    const header=document.querySelector('.remoteSwipeDockHeader'),bar=document.querySelector('.rsbot');if(!header||!bar)return;
    const capture=document.createElement('button');capture.type='button';capture.id='remoteScreenshot';capture.textContent='Save screenshot';capture.addEventListener('click',screenshot);bar.append(capture);
    const preferences=document.getElementById('workspaceSettingsPreferences');
    if(preferences){
      preferences.hidden=false;const title=document.createElement('h3');title.textContent='Phone controls';preferences.append(title);
      for(const [key,label,detail,enabled]of [['haptic','Click vibration','A short tap when you select or start dragging on the PC.',vibration],['volume','Phone volume buttons','Use Android volume buttons for PC volume while this app is open.',volumeKeys]]){
        const row=document.createElement('label');row.className='devicePreference';const copy=document.createElement('span'),strong=document.createElement('strong'),small=document.createElement('small'),input=document.createElement('input');strong.textContent=label;small.textContent=detail;copy.append(strong,small);input.type='checkbox';input.checked=enabled;input.id='devicePreference-'+key;input.disabled=key==='volume'&&!hasNative();input.addEventListener('change',()=>{if(key==='haptic'){vibration=input.checked;write('pcr_haptics',vibration);}else{volumeKeys=input.checked;write('pcr_volume_keys',volumeKeys);syncVolume();}});row.append(copy,input);preferences.append(row);
      }
      settingsStatus=document.createElement('p');settingsStatus.className='deviceWakeStatus';preferences.append(settingsStatus);
    }
    const auth=()=>{volumePending=0;capture.hidden=!window.PCRCanAccess?.('screen');syncVolume();void saveWake();};
    window.addEventListener('pcr:auth',auth);
    document.addEventListener('visibilitychange',()=>{if(document.hidden)volumePending=0;syncVolume();});window.addEventListener('pagehide',()=>{native({type:'volume-keys',enabled:false});});
    auth();
  }
  window.PCRDeviceInput={haptic,focusKeyboard,hideKeyboard,volume,screenshot};
  window.addEventListener('pcr:settings-sync',()=>{vibration=read('pcr_haptics',true);volumeKeys=read('pcr_volume_keys',false);syncVolume();});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
})();
