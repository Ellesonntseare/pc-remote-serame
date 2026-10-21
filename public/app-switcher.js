(function(){
  'use strict';
  function mount(){
    const bar=document.querySelector('.rsbot');if(!bar||document.getElementById('pcAppsButton'))return;
    const button=document.createElement('button');button.id='pcAppsButton';button.type='button';button.textContent='Apps';button.setAttribute('aria-haspopup','dialog');
    const dialog=document.createElement('dialog');dialog.id='pcAppsDialog';dialog.className='nativeDialog nativeAppsDialog';dialog.setAttribute('aria-labelledby','pcAppsTitle');
    dialog.innerHTML='<div class="nativeDialogHead"><div><span class="nativeEyebrow">ON YOUR PC</span><h2 id="pcAppsTitle">Switch apps</h2></div><button type="button" data-close aria-label="Close app switcher">×</button></div><p class="nativeDialogHint">Bring an open window to the front.</p><div class="nativeAppTools"><input type="search" placeholder="Find an open app…" aria-label="Search open apps" autocomplete="off"><button type="button" data-refresh>Refresh</button></div><div class="nativeAppsStatus" role="status" aria-live="polite"></div><div class="nativeAppList"></div>';
    document.body.append(dialog);bar.append(button);
    const status=dialog.querySelector('.nativeAppsStatus'),list=dialog.querySelector('.nativeAppList'),search=dialog.querySelector('input'),refresh=dialog.querySelector('[data-refresh]');
    let apps=[],generation=0,busy=false;
    const call=(path,options)=>api(path,options);
    function render(){
      list.replaceChildren();const query=search.value.trim().toLocaleLowerCase(),visible=apps.filter(app=>(app.title+' '+app.processName).toLocaleLowerCase().includes(query));
      for(const app of visible){
        const row=document.createElement('button');row.type='button';row.className='nativeAppRow';row.disabled=busy;
        const icon=document.createElement('span');icon.className='nativeAppIcon';icon.setAttribute('aria-hidden','true');icon.textContent=(app.processName||app.title||'?').slice(0,1).toLocaleUpperCase();
        const copy=document.createElement('span');copy.className='nativeAppCopy';const title=document.createElement('strong');title.textContent=app.title;const detail=document.createElement('span');detail.textContent=app.processName+(app.minimized?' · Minimized':app.active?' · Active':'');copy.append(title,detail);
        const arrow=document.createElement('span');arrow.className='nativeAppArrow';arrow.textContent=app.active?'●':'↗';arrow.setAttribute('aria-hidden','true');row.append(icon,copy,arrow);
        row.addEventListener('click',()=>{void focus(app);});list.append(row);
      }
      if(!visible.length){const empty=document.createElement('p');empty.className='nativeAppEmpty';empty.textContent=apps.length?'No apps match your search.':'No open app windows found.';list.append(empty);}
    }
    async function load(){
      const version=++generation;busy=true;refresh.disabled=true;status.textContent='Finding open apps…';list.replaceChildren();
      try{
        const result=await call('/api/apps');if(version!==generation)return;
        if(result.status!==200||!Array.isArray(result.apps))throw Error(result.error||'The PC app list is unavailable.');
        apps=result.apps.filter(app=>app&&typeof app.id==='string'&&typeof app.title==='string'&&typeof app.processName==='string');status.textContent=apps.length+' open '+(apps.length===1?'window':'windows');
      }catch(error){if(version===generation){apps=[];status.textContent=error.message||'Could not load open apps.';}}
      finally{if(version===generation){busy=false;refresh.disabled=false;render();}}
    }
    async function focus(app){
      if(busy)return;const version=generation;busy=true;refresh.disabled=true;status.textContent='Opening '+app.processName+'…';render();
      try{
        const result=await call('/api/apps/focus',{method:'POST',body:JSON.stringify({id:app.id})});if(version!==generation)return;
        if(result.status!==200||!result.ok)throw Error(result.error||'Windows could not switch to this app.');
        dialog.close();
      }catch(error){if(version===generation)status.textContent=error.message||'Could not switch apps.';}
      finally{if(version===generation){busy=false;refresh.disabled=false;render();}}
    }
    button.addEventListener('click',()=>{search.value='';dialog.showModal();void load();});refresh.addEventListener('click',()=>{void load();});search.addEventListener('input',render);dialog.querySelector('[data-close]').addEventListener('click',()=>dialog.close());dialog.addEventListener('click',event=>{if(event.target===dialog)dialog.close();});
    dialog.addEventListener('close',()=>{generation++;busy=false;refresh.disabled=false;});
    const screen=document.getElementById('rs');if(screen)new MutationObserver(()=>{if(screen.classList.contains('hide'))dialog.close();}).observe(screen,{attributes:true,attributeFilter:['class']});
    const gate=document.getElementById('pairGate');if(gate)new MutationObserver(()=>{if(!gate.classList.contains('hide'))dialog.close();}).observe(gate,{attributes:true,attributeFilter:['class']});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount);else mount();
})();
