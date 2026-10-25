'use strict';
(() => {
  function mount(){
    const pane=document.getElementById('textPane'),dialog=document.getElementById('filesDialog');if(!pane||!dialog)return;
    const panel=document.createElement('section');panel.id='deviceLinks';panel.className='deviceLinks';panel.innerHTML='<div class="deviceLinksHeading"><div><h3>Send a link</h3><p>Open a phone link on the PC, or leave one for your other device.</p></div></div><form class="deviceLinkForm"><label for="deviceLinkUrl">Web link</label><input id="deviceLinkUrl" type="text" inputmode="url" autocomplete="url" maxlength="4096" placeholder="https://example.com"><div class="deviceLinkActions"><button type="submit" data-link-pc>Open on PC</button><button type="button" data-link-send>Send to my devices</button></div></form><div class="deviceLinkUtilities"><button type="button" data-link-paste>Paste a link</button><button type="button" data-link-clipboard>Get link from PC clipboard</button></div><p class="deviceLinkStatus" role="status" aria-live="polite"></p><div class="deviceLinksInboxHeading"><h4>Link inbox</h4><button type="button" data-link-refresh>Refresh</button></div><p class="deviceLinksHint">Shared for one hour. Links open only when you choose Open.</p><div class="deviceLinksInbox"></div>';
    pane.prepend(panel);const q=selector=>panel.querySelector(selector),input=q('input'),status=q('.deviceLinkStatus'),inbox=q('.deviceLinksInbox');let epoch=0,busy=false,timer=null,loading=false,loadAgain=false;
    const owner=()=>window.PCRAuth?.role==='owner';
    const allowed=()=>window.PCRCanAccess?.('clipboard');
    const active=()=>panel.isConnected&&allowed()&&dialog.open&&!pane.hidden&&!document.hidden;
    const say=(message,error=false)=>{if(!panel.isConnected)return;status.textContent=message;status.dataset.error=String(error);};
    async function call(route,options){const result=await api(route,options);if(!result.ok)throw Error(result.error||'Link sharing is unavailable.');return result;}
    function openHere(url){
      if(window.PCRAndroid?.postMessage){window.PCRAndroid.postMessage(JSON.stringify({type:'open-link',url}));return;}
      const anchor=document.createElement('a');anchor.href=url;anchor.target='_blank';anchor.rel='noopener noreferrer';anchor.click();
    }
    async function run(action){if(busy||!allowed())return;busy=true;const version=epoch;for(const button of q('form').querySelectorAll('button'))button.disabled=true;
      try{await action(version);}catch(error){if(version===epoch)say(error.message,true);}finally{busy=false;if(panel.isConnected)for(const button of q('form').querySelectorAll('button'))button.disabled=false;}}
    function render(links){
      inbox.replaceChildren();if(!links.length){const empty=document.createElement('p');empty.className='deviceLinksEmpty';empty.textContent='Links sent from your devices will appear here.';inbox.append(empty);return;}
      for(const link of links){
        let url;try{url=new URL(link.url);if(!['http:','https:'].includes(url.protocol))continue;}catch{continue;}
        const row=document.createElement('article');row.className='deviceLinkRow';const copy=document.createElement('div');copy.className='deviceLinkCopy';const title=document.createElement('strong');title.textContent=url.hostname;const detail=document.createElement('span');detail.textContent=link.url;detail.title=link.url;const origin=document.createElement('small');origin.textContent=link.from+(link.target==='pc'?' · For the PC':' · For your devices');copy.append(title,detail,origin);
        const actions=document.createElement('div');actions.className='deviceLinkRowActions';const here=document.createElement('button');here.type='button';here.textContent='Open here';here.addEventListener('click',()=>openHere(link.url));actions.append(here);
        if(owner()){const pc=document.createElement('button');pc.type='button';pc.textContent='Open on PC';pc.addEventListener('click',()=>void run(async version=>{await call('/api/links/open',{method:'POST',body:JSON.stringify({url:link.url})});if(version===epoch)say('Opened in the PC browser.');}));actions.append(pc);}
        const remove=document.createElement('button');remove.type='button';remove.className='deviceLinkRemove';remove.textContent='Remove';remove.addEventListener('click',()=>void run(async version=>{await call('/api/links/'+link.id,{method:'DELETE'});if(version===epoch)await load();}));actions.append(remove);row.append(copy,actions);inbox.append(row);
      }
    }
    async function load(){
      if(!active())return;if(loading){loadAgain=true;return;}loading=true;const version=epoch;
      try{const result=await call('/api/links');if(version!==epoch||!panel.isConnected)return;render(result.links||[]);}
      catch(error){if(version===epoch&&active())say(error.message,true);}finally{loading=false;if(loadAgain){loadAgain=false;void load();}}
    }
    function schedule(){clearTimeout(timer);if(!active())return;void load();timer=setTimeout(schedule,10000);}
    q('form').addEventListener('submit',event=>{event.preventDefault();void run(async version=>{
      const result=await call(owner()?'/api/links/open':'/api/links',{method:'POST',body:JSON.stringify({url:input.value,target:'pc'})});if(version!==epoch)return;input.value=result.url||result.link?.url||input.value;say(owner()?'Opened in the PC browser.':'Link sent to your host. They can choose Open on PC.');await load();
    });});
    q('[data-link-send]').addEventListener('click',()=>void run(async version=>{const result=await call('/api/links',{method:'POST',body:JSON.stringify({url:input.value,target:'device'})});if(version!==epoch)return;input.value=result.link.url;say('Link saved. On your other signed-in device, open Files & text → Text → Link inbox.');await load();}));
    q('[data-link-paste]').addEventListener('click',async()=>{const version=epoch;try{const text=await navigator.clipboard.readText();if(version===epoch&&active())input.value=text.trim();}catch{if(version===epoch&&active()){say('Paste the link into the Web link field.');input.focus();}}});
    q('[data-link-clipboard]').addEventListener('click',()=>void run(async version=>{const result=await call('/api/links/clipboard');if(version!==epoch||!panel.isConnected)return;input.value=result.url;say('PC link received. Choose Open here or send it to your other devices.');const here=document.createElement('button');here.type='button';here.textContent='Open here';here.addEventListener('click',()=>openHere(result.url));status.append(' ',here);}));
    q('[data-link-refresh]').addEventListener('click',()=>void load());
    function auth(){epoch++;clearTimeout(timer);input.value='';inbox.replaceChildren();status.textContent='';panel.hidden=!allowed();q('[data-link-pc]').textContent=owner()?'Open on PC':'Send to host';q('[data-link-send]').textContent=owner()?'Send to my devices':'Save to my inbox';schedule();}
    window.addEventListener('pcr:auth',auth);window.addEventListener('pcr:page',schedule);document.addEventListener('visibilitychange',schedule);
    new MutationObserver(schedule).observe(dialog,{attributes:true,attributeFilter:['open']});new MutationObserver(schedule).observe(pane,{attributes:true,attributeFilter:['hidden']});auth();
    window.PCRDeviceLinks={refresh:load};
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
})();
