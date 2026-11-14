(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else{root.PCRContextControls=api;if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',api.mount,{once:true});else api.mount();}})(globalThis,function(){
  'use strict';
  const key=(label,code)=>({label,command:'key '+code}),combo=(label,...codes)=>({label,command:'combo '+codes.join(',')});
  function controls(process){const app=String(process||'').toLowerCase().replace(/\.exe$/,'');
    if(/^(chrome|msedge|firefox|brave|opera|vivaldi)$/.test(app))return {label:'Browser',actions:[combo('Back',18,37),combo('New tab',17,84),combo('Address',17,76),combo('Reopen tab',17,16,84)]};
    if(app==='explorer')return {label:'Files',actions:[key('Rename',113),combo('Copy',17,67),combo('Paste',17,86),combo('New folder',17,16,78)]};
    if(/^(vlc|mpc-hc64|mpc-hc|mpc-be64)$/.test(app))return {label:'Player',actions:[key('Play / Pause',32),combo('Back 10s',18,37),combo('Forward 10s',18,39),key('Fullscreen',70)]};
    if(app==='powerpnt')return {label:'Slides',actions:[key('Previous',37),key('Next',39),key('Start',116),key('End show',27)]};
    if(app==='adobe premiere pro'||app==='premierepro')return {label:'Premiere Pro',actions:[key('Play / Pause',32),key('Previous frame',37),key('Next frame',39),combo('Save',17,83)]};
    if(app==='resolve')return {label:'DaVinci Resolve',actions:[key('Play / Pause',32),key('Previous frame',37),key('Next frame',39),combo('Save',17,83)]};
    if(app==='shotcut'||app==='kdenlive')return {label:app==='shotcut'?'Shotcut':'Kdenlive',actions:[key('Play / Pause',32),key('Previous frame',37),key('Next frame',39),combo('Save',17,83)]};
    if(app==='photoshop')return {label:'Photoshop',actions:[combo('Undo',17,90),combo('Save',17,83),combo('Open',17,79),combo('Fit',17,48)]};
    if(/^gimp(?:-\d+\.\d+)?$/.test(app))return {label:'GIMP',actions:[combo('Undo',17,90),combo('Save',17,83),combo('Open',17,79),combo('Fit',17,16,74)]};
    if(/^(code|notepad|notepad\+\+|devenv|winword)$/.test(app))return {label:'Editor',actions:[combo('Undo',17,90),combo('Save',17,83),combo('Find',17,70),combo('Select all',17,65)]};
    return {label:'Shortcuts',actions:[combo('Copy',17,67),combo('Paste',17,86),combo('Undo',17,90),combo('Select all',17,65)]};
  }
  function mount(){const screen=document.getElementById('rs'),dock=screen?.querySelector('.dockQuickKeys');if(!screen||!dock)return;const bar=document.createElement('div');bar.className='contextControls';bar.setAttribute('aria-label','Active application shortcuts');dock.before(bar);const fullscreen=document.getElementById('rsFullscreen');let timer=null,controller=null,signature='';
    function draw(process){const data=controls(process),next=JSON.stringify(data);if(next===signature)return;signature=next;bar.replaceChildren();const label=document.createElement('span');label.textContent=data.label;if(data.label!=='Shortcuts')bar.append(label);for(const action of data.actions){const b=document.createElement('button');b.type='button';b.textContent=action.label;b.onpointerdown=e=>e.preventDefault();b.onclick=()=>{if(typeof rs!=='undefined'&&rs.on&&window.PCRCanAccess?.('control')&&(!window.PCRHoldControl||window.PCRHoldControl.can('pc')))window.qc?.(action.command);};bar.append(b);if(action.label==='Select all'&&fullscreen)bar.append(fullscreen);}if(fullscreen&&!bar.contains(fullscreen))bar.append(fullscreen);}
    function active(){return window.PCRAuth?.signedIn&&window.PCRCanAccess?.('apps')&&!document.hidden&&window.PCRPages?.current==='rs';}
    async function poll(){if(!active()||controller)return;const current=controller=new AbortController(),timeout=setTimeout(()=>current.abort(),4000);try{const response=await fetch('/api/apps/current',{headers:{'X-PCR':'1'},signal:current.signal});if(response.ok){const value=await response.json();if(active())draw(value.app?.processName);}}catch{}finally{clearTimeout(timeout);if(controller===current)controller=null;}}
    function update(){clearInterval(timer);timer=null;bar.hidden=!window.PCRCanAccess?.('control');if(active()){void poll();timer=setInterval(poll,2200);}else{controller?.abort();draw('');}}
    for(const event of ['pcr:page','pcr:auth'])window.addEventListener(event,update);document.addEventListener('visibilitychange',update);draw('');update();
  }
  return {controls,mount};
});
