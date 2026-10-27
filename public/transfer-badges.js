'use strict';
(()=>{
  const sources=new Map(),labels=new WeakMap();let last='';
  function draw(){
    const items=[...sources.values()].filter(item=>item.remaining>0),remaining=items.reduce((count,item)=>count+item.remaining,0),paused=!!items.length&&items.every(item=>item.paused),percent=items.find(item=>!item.paused)?.percent??items[0]?.percent??0;
    const state=remaining?(paused?'paused':'sending'):'none',description=remaining?remaining+' '+(remaining===1?'transfer remaining':'transfers remaining')+(paused?' · paused':' · current file '+Math.floor(percent)+'%'):'';
    const key=[remaining,state,Math.floor(percent),!!window.PCRAuth?.signedIn].join(':');if(last===key)return;last=key;
    for(const button of document.querySelectorAll('[data-files-button],.spatialQuick [data-mission-action=file],.mcBottomNav [data-mission-action=file],[data-quick-action=file]')){
      if(!labels.has(button))labels.set(button,button.getAttribute('aria-label')||button.textContent.trim());const label=labels.get(button);let badge=button.querySelector('.transferBadge');
      if(!badge){badge=document.createElement('span');badge.className='transferBadge';badge.setAttribute('aria-hidden','true');button.append(badge);}
      const shown=remaining>0&&window.PCRAuth?.signedIn;badge.hidden=!shown;badge.textContent=remaining>99?'99+':String(remaining);button.classList.toggle('hasTransferBadge',!!shown);button.dataset.transferState=state;button.style.setProperty('--transfer-progress',Math.min(100,Math.max(0,percent))+'%');button.setAttribute('aria-label',shown?label+' · '+description:label);button.title=shown?description:label;
    }
  }
  window.addEventListener('pcr:transfer-summary',event=>{const item=event.detail;if(!item||!['browser','native'].includes(item.source))return;sources.set(item.source,{remaining:Number.isSafeInteger(item.remaining)?Math.max(0,Math.min(2200,item.remaining)):0,paused:item.paused===true,percent:Number.isFinite(item.percent)?Math.max(0,Math.min(100,item.percent)):0});draw();});
  window.addEventListener('pcr:auth',()=>{sources.clear();last='';draw();});window.addEventListener('pcr:page',()=>{last='';draw();});draw();
})();
