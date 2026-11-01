'use strict';
(()=>{
  const bar=document.getElementById('screenTools');if(!bar)return;
  const button=document.createElement('button');button.id='remotePrivacy';button.type='button';button.textContent='Privacy';button.title='Cover the physical PC displays while keeping your phone view';button.setAttribute('aria-pressed','false');button.hidden=true;bar.append(button);
  const note=document.createElement('p');note.className='remotePrivacyNote';note.setAttribute('role','status');note.hidden=true;note.textContent='The normal Windows desktop is covered. Windows security screens may still appear. Turn Privacy off here, or press Ctrl + Alt + Shift + P on the PC. It also ends if this connection is lost.';document.querySelector('.remoteOptionsPanel')?.append(note);
  let active=false,owned=false,timer=null,busy=false,generation=0;
  function draw(data){active=data.active===true;owned=data.owned===true;button.setAttribute('aria-pressed',String(active));button.textContent=active?'Privacy on':'Privacy';button.hidden=window.PCRAuth?.role!=='owner'||data.available===false;note.hidden=!active;document.getElementById('rs').classList.toggle('privacyActive',active);clearTimeout(timer);if(active&&window.PCRAuth?.signedIn)timer=setTimeout(refresh,8000);}
  async function refresh(){
    if(busy){clearTimeout(timer);timer=setTimeout(refresh,1000);return;}
    const epoch=generation,controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),6000);
    try{const result=await api('/api/privacy',{...(active&&owned?{method:'POST',body:JSON.stringify({action:'heartbeat'})}:{}),signal:controller.signal});if(epoch===generation&&result.ok)draw(result);}
    catch{}finally{clearTimeout(timeout);if(epoch===generation&&active&&window.PCRAuth?.signedIn){clearTimeout(timer);timer=setTimeout(refresh,3000);}}
  }
  button.onclick=async()=>{if(busy)return;busy=true;button.disabled=true;const epoch=++generation;try{const result=await api('/api/privacy',{method:'POST',body:JSON.stringify({action:active?'stop':'start'})});if(epoch!==generation)return;if(!result.ok)throw Error(result.error||'Privacy mode is unavailable.');draw(result);window.msg?.(result.active?'Privacy on · PC displays covered':'Privacy off · PC displays restored');}catch(error){window.msg?.(error.message);}finally{busy=false;button.disabled=false;}};
  window.addEventListener('pcr:auth',()=>{generation++;clearTimeout(timer);if(window.PCRAuth?.role==='owner')void refresh();else draw({available:false,active:false});});
  window.addEventListener('pcr:page',event=>{if(event.detail?.id==='rs'&&window.PCRAuth?.role==='owner')void refresh();});
  window.addEventListener('pagehide',()=>{clearTimeout(timer);if(active&&owned)void fetch('/api/privacy',{method:'POST',headers:{'Content-Type':'application/json','X-PCR':'1'},body:JSON.stringify({action:'stop'}),keepalive:true}).catch(()=>{});});
  window.PCRPrivacy={get active(){return active;},refresh};
})();
