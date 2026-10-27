'use strict';
(()=>{
  const pc=document.getElementById('pcAudioDialog'),phone=document.getElementById('phoneAudioPage');if(!pc||!phone)return;
  const page=document.createElement('dialog');page.id='audioPage';page.className='workspacePage audioHub';
  page.innerHTML='<header><div><span class="nativeEyebrow">SOUND BETWEEN YOUR DEVICES</span><h2>Audio</h2></div><button type="button" data-close>Back</button></header><div class="audioRoutes" role="group" aria-label="Audio direction"><button type="button" data-audio-route="pc"><span aria-hidden="true">↓</span><strong>Listen to PC</strong><small>PC → this device</small></button><button type="button" data-audio-route="microphone"><span aria-hidden="true">↑</span><strong>Send microphone</strong><small>Microphone → PC</small></button><button type="button" data-audio-route="playback"><span aria-hidden="true">↑</span><strong>Send phone audio</strong><small>Phone sound → PC</small></button></div><p class="audioHubNotice" role="status"></p><div class="audioHubPanes"></div>';
  const panes=page.querySelector('.audioHubPanes'),notice=page.querySelector('.audioHubNotice'),meter=document.createElement('div');meter.className='audioHubMeter';meter.setAttribute('aria-label','PC audio level');meter.innerHTML='<span></span>';pc.querySelector('.nativeAudioStatus').before(meter);
  for(const pane of [pc,phone]){pane.classList.add('audioHubPane');pane.setAttribute('role','region');pane.removeAttribute('open');panes.append(pane);}
  document.body.append(page);let mode='pc',generation=0,changing=false,pcState='stopped';
  function draw(){for(const button of page.querySelectorAll('[data-audio-route]')){button.setAttribute('aria-pressed',String(button.dataset.audioRoute===mode));button.disabled=changing;button.hidden=button.dataset.audioRoute==='pc'?!window.PCRCanAccess?.('audio'):window.PCRAuth?.role!=='owner';}pc.hidden=mode!=='pc';phone.hidden=mode==='pc';page.dataset.direction=mode;}
  async function select(next){if(!['pc','microphone','playback'].includes(next)||changing)return;if(next===mode){draw();return;}changing=true;const epoch=++generation;draw();notice.textContent='Switching audio…';window.PCRAudio.player?.stop();window.PCRPhoneAudio.stop?.();
    const deadline=Date.now()+5500;while(!['stopped','error'].includes(window.PCRPhoneAudio.state||'stopped')&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,60));
    if(epoch!==generation)return;changing=false;if(!['stopped','error'].includes(window.PCRPhoneAudio.state||'stopped')){notice.textContent='The previous audio is still stopping. Try again in a moment.';draw();return;}
    mode=next;if(mode!=='pc')window.PCRPhoneAudio.choose?.(mode);notice.textContent='';meter.firstElementChild.style.width='0%';draw();
  }
  function open(next){if(!window.PCRAuth?.signedIn)return;if(!page.open)page.showModal();if(next)void select(next);else draw();}
  pc.showModal=()=>open('pc');phone.showModal=()=>open('microphone');pc.close=phone.close=()=>{if(page.open)page.close();};
  page.querySelector('[data-close]').onclick=()=>page.close();for(const button of page.querySelectorAll('[data-audio-route]'))button.onclick=()=>void select(button.dataset.audioRoute);
  // Existing launchers now enter the same page. Keep their original audio handlers.
  const pcHome=document.getElementById('pcAudioHome');if(pcHome){const heading=pcHome.querySelector('strong');if(heading)heading.textContent='Audio';}
  const duplicate=pc.querySelector(':scope > .nativePrimary');if(duplicate)duplicate.hidden=true;
  window.addEventListener('pcr:audio-state',event=>{pcState=event.detail?.state||'stopped';meter.firstElementChild.style.width=(event.detail?.muted?0:Math.min(100,(event.detail?.level||0)*250))+'%';});
  window.addEventListener('pcr:auth',()=>{generation++;changing=false;if(!window.PCRAuth?.signedIn){notice.textContent='';if(page.open)page.close();}draw();});
  window.PCRAudioHub={open,select,get mode(){return mode;},get pcState(){return pcState;}};draw();
})();
