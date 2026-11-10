'use strict';
(() => {
 function mount(){
  const grid=document.querySelector('.heroactions');if(!grid||document.getElementById('projectsButton'))return;
  const button=document.createElement('button');button.id='projectsButton';button.type='button';button.className='quick wide homeShortcut';button.dataset.dashboardTile='projects';button.style.order='8.5';button.innerHTML='<span class="dashboardTileIcon"><svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="3" y="3" width="11" height="11" rx="2"/><rect x="18" y="3" width="11" height="11" rx="2"/><rect x="3" y="18" width="11" height="11" rx="2"/><rect x="18" y="18" width="11" height="11" rx="2"/></svg></span><span class="dashboardTileCopy"><strong>Projects</strong><small>Open your apps</small></span>';grid.append(button);
  const dialog=document.createElement('dialog');dialog.id='projectsPage';dialog.innerHTML='<header><h2>Projects</h2><button type="button" data-close aria-label="Back">Back</button></header><div class="projectsGrid" role="status"></div>';document.body.append(dialog);
  dialog.querySelector('[data-close]').onclick=()=>dialog.close();
  const requested=new URLSearchParams(location.search).get('project');if(requested==='socials')try{sessionStorage.setItem('elleson-open-project','socials');}catch{}
  function permitted(){return !!window.PCRAuth?.signedIn&&window.PCRAuth.role!=='guest';}
  function update(){if(permitted())try{if(sessionStorage.getItem('elleson-open-project')==='socials'){sessionStorage.removeItem('elleson-open-project');location.assign('/socials/');return;}}catch{}button.hidden=!permitted();if(!permitted()&&dialog.open)dialog.close();}
  button.onclick=async()=>{
   if(!permitted())return;dialog.showModal();const list=dialog.querySelector('.projectsGrid');list.textContent='Loading…';
   try{
    const response=await fetch('/api/projects',{headers:{'X-PCR':'1'},credentials:'same-origin'});const data=await response.json();if(!response.ok)throw Error(data.error||'Projects are unavailable.');list.replaceChildren();
    for(const project of data.projects){const card=document.createElement('article'),title=document.createElement('h3'),detail=document.createElement('p');title.textContent=project.name;detail.textContent=project.description;card.append(title,detail);
     if(project.available){const link=document.createElement('a');link.className='projectsOpen';link.href=project.id==='alderwick'?'/alderwick/':'/socials/';link.textContent='Open';card.append(link);}else{const state=document.createElement('span');state.textContent='Not installed';card.append(state);}list.append(card);}
   }catch(error){list.textContent=error.message;}
  };
  window.addEventListener('pcr:auth',update);update();
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount);else mount();
})();
