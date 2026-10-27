'use strict';
(() => {
  function mount(){
    const main=document.getElementById('main');if(!main||document.getElementById('homePanels'))return;
    // Power gets a dedicated page, while the three requested home lists expand inline.
    const drawer=document.getElementById('powerDrawer'),power=document.querySelector('.dashboardPowerTile');
    if(drawer&&power){
      const page=document.createElement('dialog');page.id='powerPage';page.className='workspacePage powerWorkspace';page.innerHTML='<header><div><span class="nativeEyebrow">YOUR PC</span><h2>Power controls</h2></div><button type="button" data-close aria-label="Close power controls">×</button></header><p class="powerPageIntro">Lock your PC or change its power state.</p>';
      drawer.querySelector(':scope > summary').hidden=true;drawer.open=true;page.append(drawer);const confirmation=document.getElementById('modal');if(confirmation){confirmation.setAttribute('role','dialog');confirmation.setAttribute('aria-modal','true');confirmation.setAttribute('aria-labelledby','q');page.append(confirmation);}document.body.append(page);
      power.setAttribute('aria-controls','powerPage');power.setAttribute('aria-haspopup','dialog');power.setAttribute('aria-expanded','false');
      power.addEventListener('click',event=>{event.stopImmediatePropagation();if(!window.PCRCanAccess?.('power'))return;if(!page.open)page.showModal();power.setAttribute('aria-expanded','true');},true);
      drawer.addEventListener('toggle',()=>power.setAttribute('aria-expanded',String(page.open)));
      page.querySelector('[data-close]').addEventListener('click',()=>page.close());page.addEventListener('close',()=>{power.setAttribute('aria-expanded','false');window.closeM?.();});page.addEventListener('click',event=>{if(event.target.closest('[data-q]'))queueMicrotask(()=>confirmation?.querySelector('.confirm button')?.focus());});
      window.addEventListener('pcr:auth',()=>{if(!window.PCRCanAccess?.('power'))page.close();});
    }
    window.addEventListener('pcr:settings-sync',event=>{if(event.detail?.key!=='pcr_home_panels_v1')return;try{const values=JSON.parse(event.detail.value);if(!values||typeof values!=='object'||Array.isArray(values))return;saved=values;for(const item of panels)item.panel.open=values[item.panel.dataset.homePanel]===true;}catch{}});
    const storageKey='pcr_home_panels_v1';let saved={};try{const value=JSON.parse(localStorage.getItem(storageKey)||'{}');if(value&&typeof value==='object'&&!Array.isArray(value))saved=value;}catch{}
    const group=document.createElement('section');group.id='homePanels';group.className='homePanels';group.setAttribute('aria-label','More PC controls');const panels=[];
    const icons={media:'<path d="m8 5 11 7-11 7Z"/>',status:'<path d="M3 13h4l3-8 4 14 3-8h4"/>',history:'<path d="M4 5v5h5M4.5 10a8 8 0 1 1 0 5M12 7v5l3 2"/>'};
    for(const [key,title,description,selector,permission]of [['media','Media remote','Playback & volume','.mediaWrap','media'],['status','System status','CPU, memory & uptime','.stats','status'],['history','History','Recent PC activity','.activity','owner']]){
      const content=main.querySelector(selector);if(!content)continue;
      const panel=document.createElement('details');panel.id='homePanel'+key[0].toUpperCase()+key.slice(1);panel.className='homePanel';panel.dataset.homePanel=key;panel.open=saved[key]===true;
      const summary=document.createElement('summary');summary.innerHTML='<span class="homePanelIcon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">'+icons[key]+'</svg></span><span class="homePanelCopy"><strong>'+title+'</strong><small>'+description+'</small></span><svg class="homePanelChevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="m7 10 5 5 5-5"/></svg>';summary.setAttribute('aria-expanded',String(panel.open));
      panel.append(summary,content);group.append(panel);panels.push({panel,permission});
      panel.addEventListener('toggle',()=>{summary.setAttribute('aria-expanded',String(panel.open));saved[key]=panel.open;try{localStorage.setItem(storageKey,JSON.stringify(saved));}catch{}});
    }
    if(!panels.length)return;main.append(group);
    function sync(){for(const {panel,permission}of panels)panel.hidden=!window.PCRAuth?.signedIn||(permission==='owner'?window.PCRAuth.role!=='owner':!window.PCRCanAccess?.(permission));group.hidden=panels.every(({panel})=>panel.hidden);}
    window.addEventListener('pcr:auth',sync);sync();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
})();
