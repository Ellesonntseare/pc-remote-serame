'use strict';
(()=>{
  const dock=document.createElement('nav');dock.className='featureQuickAccess';dock.setAttribute('aria-label','Quick access');dock.hidden=true;
  for(const [action,label,glyph]of [['home','Home','home'],['screen','Screen','screen'],['file','Files','file'],['keyboard','Keyboard','keyboard'],['more','Search','search']]){const button=document.createElement('button');button.type='button';button.dataset.quickAction=action;button.innerHTML=(window.PCRMission?.icon(glyph)||'')+'<span>'+label+'</span>';button.onclick=()=>{if(action==='file'&&window.PCRPages?.current==='filesDialog')return;if(action==='more'){document.querySelector('.mcSearchTrigger')?.click();return;}window.PCRPages?.home();if(action==='home')window.PCRMission?.setView('workspace');else if(action==='file')document.querySelector('.filesHome')?.click();else{window.rsOpen?.();if(action==='keyboard')window.rsKb?.();}};dock.append(button);}
  document.body.append(dock);
  function update(){const current=window.PCRPages?.current||'home',page=document.getElementById(current);dock.hidden=!window.PCRAuth?.signedIn||['home','rs','rsSettings','remoteOptions','missionSearch'].includes(current);for(const button of dock.querySelectorAll('button')){const action=button.dataset.quickAction;button.hidden=action==='screen'&&!window.PCRCanAccess?.('screen')||action==='keyboard'&&!window.PCRCanAccess?.('control')||action==='file'&&!['upload','download','clipboard'].some(p=>window.PCRCanAccess?.(p));button.setAttribute('aria-current',String(action==='file'&&current==='filesDialog'?'page':'false'));}if(!dock.hidden&&page){page.append(dock);page.classList.add('hasFeatureQuickAccess');}}
  window.addEventListener('pcr:page',update);window.addEventListener('pcr:auth',update);
  // Existing icon buttons keep their established handler and receive readable names.
  const names={'↑':'Move up','↓':'Move down','↻':'Refresh','×':'Close','✕':'Close','−':'Decrease','+':'Increase','☆':'Add favourite','★':'Remove favourite','⛶':'Fullscreen'};
  function nameButtons(){for(const node of document.querySelectorAll('button:not([aria-label])')){const text=node.textContent.trim();if(names[text])node.setAttribute('aria-label',names[text]);else if(!text&&node.title)node.setAttribute('aria-label',node.title);}}
  nameButtons();window.addEventListener('pcr:page',nameButtons);update();
})();
