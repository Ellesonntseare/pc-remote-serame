'use strict';
(() => {
 function mount(){
  const page=document.getElementById('audioPage');if(!page||page.querySelector('.audioSuiteHero'))return;
  page.classList.add('audioSuiteDesign');
  const hero=document.createElement('section');hero.className='audioSuiteHero';
  hero.innerHTML='<div class="audioSuiteBanner"><div><span>SOUND BETWEEN YOUR DEVICES</span><h3>Your sound. Where you need it.</h3><p>Listen to your PC, send your microphone or share supported phone audio.</p></div><button type="button" data-suite-toggle>Start audio</button></div><div class="audioSuiteSignal"><div><strong>Live audio level</strong><span data-suite-status role="status">Audio is off</span></div><div class="audioSuiteWave" aria-label="Live audio level history">'+Array.from({length:32},()=>'<i></i>').join('')+'</div><small>Shows the selected stream’s measured signal level.</small></div>';
  page.querySelector('header').after(hero);
  const toggle=hero.querySelector('button'),status=hero.querySelector('[data-suite-status]'),bars=[...hero.querySelectorAll('.audioSuiteWave i')],history=Array(32).fill(0),states={pc:{state:'stopped'},phone:{state:'stopped'}};
  let lastMode='pc';
  function render(){
   const mode=page.dataset.direction||'pc',value=states[mode==='pc'?'pc':'phone'],busy=['connecting','stopping'].includes(value.state),active=['playing','streaming'].includes(value.state),pane=document.getElementById(mode==='pc'?'pcAudioDialog':'phoneAudioPage');
   if(mode!==lastMode||!active||value.muted)history.fill(0);lastMode=mode;
   const action=pane.querySelector(active||busy?'[data-stop]':'[data-start]');toggle.textContent=value.state==='stopping'?'Stopping…':busy?'Cancel connection':active?'Stop audio':value.state==='error'?'Try audio again':'Start audio';toggle.disabled=!action||action.disabled||value.state==='stopping';
   status.textContent=value.muted&&active?'Muted':value.state==='playing'?'Listening to PC':value.state==='streaming'?'Streaming to PC':value.state==='connecting'?'Connecting…':value.state==='stopping'?'Stopping…':value.state==='error'?'Audio needs attention — check the message below':'Audio is off';page.dataset.audioState=value.state;
   bars.forEach((bar,index)=>{bar.style.height=Math.max(3,Math.min(100,history[index]*250))+'%';});
  }
  function update(key,value){states[key]={...states[key],...value};const selected=(page.dataset.direction||'pc')==='pc'?'pc':'phone';if(key===selected){history.shift();history.push(['playing','streaming'].includes(states[key].state)&&!states[key].muted?Math.max(0,Number(value.level)||0):0);}render();}
  window.addEventListener('pcr:audio-state',event=>update('pc',event.detail||{}));window.addEventListener('pcr:phone-audio-state',event=>update('phone',event.detail||{}));
  new MutationObserver(render).observe(page,{attributes:true,attributeFilter:['data-direction']});
  for(const pane of page.querySelectorAll('.audioHubPane'))new MutationObserver(render).observe(pane,{attributes:true,subtree:true,attributeFilter:['disabled']});
  toggle.onclick=()=>{const mode=page.dataset.direction||'pc',value=states[mode==='pc'?'pc':'phone'],pane=document.getElementById(mode==='pc'?'pcAudioDialog':'phoneAudioPage');pane.querySelector(['playing','streaming','connecting','stopping'].includes(value.state)?'[data-stop]':'[data-start]')?.click();};
  window.addEventListener('pcr:auth',()=>{history.fill(0);states.pc={state:'stopped'};states.phone={state:'stopped'};render();});render();
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
})();
