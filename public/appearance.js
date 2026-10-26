'use strict';
(()=>{
  const key='pcr_appearance_v1';let mode='immersive';try{mode=localStorage.getItem(key)==='light'?'light':'immersive';}catch{}
  function apply(){document.documentElement.dataset.appearance=mode;window.PCRAppearance={get light(){return mode==='light';}};window.dispatchEvent(new CustomEvent('pcr:appearance',{detail:{mode}}));}apply();
  const settings=document.getElementById('workspaceSettings');if(!settings)return;
  const card=document.createElement('section');card.className='workspaceSettingsCard appearanceSettings';card.innerHTML='<h3>Appearance</h3><p>Choose the experience that suits this device.</p><div class="appearanceChoices" role="group" aria-label="Appearance"><button type="button" data-appearance="immersive"><strong>Immersive</strong><span>Ambient glow and smooth page transitions</span></button><button type="button" data-appearance="light"><strong>Lightweight</strong><span>Crisp surfaces and fewer visual effects</span></button></div><p role="status" data-appearance-status></p>';settings.querySelector('.workspaceSettingsIntro')?.after(card);
  function draw(){for(const button of card.querySelectorAll('[data-appearance]'))button.setAttribute('aria-pressed',String(button.dataset.appearance===mode));}
  for(const button of card.querySelectorAll('[data-appearance]'))button.onclick=()=>{mode=button.dataset.appearance;try{localStorage.setItem(key,mode);}catch{}apply();draw();card.querySelector('[data-appearance-status]').textContent=mode==='light'?'Lightweight appearance enabled on this device.':'Immersive appearance enabled on this device.';};draw();
})();
