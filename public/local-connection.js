(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else{root.PCRLocalConnection=api;if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',api.mount,{once:true});else api.mount();}})(globalThis,function(){
  'use strict';
  function parseAddress(value,portValue=7666){
    if(typeof value!=='string'||value.length>160)return null;
    const match=/^(?:http:\/\/)?(\d{1,3}(?:\.\d{1,3}){3})(?::(\d{1,5}))?\/?$/i.exec(value.trim());if(!match)return null;
    const octets=match[1].split('.').map(Number);if(octets.some(n=>n>255)||!(octets[0]===10||octets[0]===172&&octets[1]>=16&&octets[1]<=31||octets[0]===192&&octets[1]===168))return null;
    const text=match[2]||String(portValue||7666).trim();if(!/^\d{1,5}$/.test(text))return null;const port=Number(text);if(port<1||port>65535)return null;
    const ip=octets.join('.');return {ip,port,url:'http://'+ip+':'+port+'/'};
  }
  function mount(){
    if(document.getElementById('localConnectionPage'))return;
    const dialog=document.createElement('dialog');dialog.id='localConnectionPage';dialog.className='workspacePage localConnectionPage';dialog.innerHTML='<header><div><span class="nativeEyebrow">DIRECT TO YOUR PC</span><h2>Local connection</h2></div><button type="button" data-close>Back</button></header><section class="localConnectionCard"><span class="localConnectionSymbol" aria-hidden="true">⇄</span><h3>Take the faster route.</h3><p>Connect directly to your PC on the same Wi-Fi or home network.</p><label for="localPcAddress">PC IP address</label><div class="localAddressField"><input id="localPcAddress" type="text" inputmode="url" autocomplete="off" autocapitalize="off" spellcheck="false" maxlength="160" placeholder="192.168.8.100" enterkeyhint="go"><button type="button" data-paste>Paste</button></div><details class="localPortOptions"><summary>Port <span data-port-label>7666</span></summary><label for="localPcPort">Server port</label><input id="localPcPort" type="text" inputmode="numeric" maxlength="5" value="7666" autocomplete="off"></details><button class="mcPrimary" type="button" data-connect>Connect to local PC <span aria-hidden="true">→</span></button><p class="localConnectionStatus" role="status" aria-live="polite"></p><div class="localSavedPcs" hidden><h4>Your PC addresses</h4><div></div></div><p class="localConnectionNote">Use the same app password. Your PC host must be running and allowed through Windows Firewall on your Private network.</p></section>';document.body.append(dialog);
    const q=s=>dialog.querySelector(s),input=q('#localPcAddress'),port=q('#localPcPort'),status=q('.localConnectionStatus');let busy=false,fetching=null,accountVersion=0;
    const storage='pcr_local_connection_v1';let saved=null;try{const data=JSON.parse(localStorage.getItem(storage));saved=parseAddress(data?.ip,data?.port);}catch{}
    function fill(target){if(!target)return;input.value=target.ip;port.value=String(target.port);q('[data-port-label]').textContent=String(target.port);}
    function activeUpload(){return document.getElementById('filesProgress')?.hidden===false;}
    function setStatus(message,error=false){status.textContent=message;status.dataset.error=String(error);}
    async function loadAddresses(){
      if(fetching||window.PCRAuth?.role!=='owner'||!window.PCRAuth?.signedIn)return;const version=accountVersion,controller=fetching=new AbortController(),timeout=setTimeout(()=>controller.abort(),4000);
      try{const response=await fetch('/api/local-network',{headers:{'X-PCR':'1'},signal:controller.signal}),data=await response.json();if(!response.ok||version!==accountVersion||!dialog.open)return;const list=q('.localSavedPcs>div');list.replaceChildren();for(const address of data.addresses||[]){const target=parseAddress(address.address,data.port);if(!target)continue;const button=document.createElement('button');button.type='button';const title=document.createElement('strong'),detail=document.createElement('span');title.textContent=data.name||'Your PC';detail.textContent=target.ip+' · '+address.name;button.append(title,detail);button.onclick=()=>{fill(target);setStatus('Address selected. Tap Connect to use the local link.');};list.append(button);}q('.localSavedPcs').hidden=!list.childElementCount;if(!input.value&&data.addresses?.length)fill(parseAddress(data.addresses[0].address,data.port));}
      catch{}finally{clearTimeout(timeout);if(fetching===controller)fetching=null;}
    }
    function open(){if(!dialog.open)dialog.showModal();fill(saved||parseAddress(location.hostname,location.port||7666));setStatus('');void loadAddresses();requestAnimationFrame(()=>input.focus({preventScroll:true}));}
    function connect(){
      if(busy)return;const target=parseAddress(input.value,port.value);if(!target){setStatus('Enter a private PC IP such as 192.168.8.100. A full local URL or IP:port also works.',true);input.focus();return;}
      if(activeUpload()){setStatus('Pause or finish the current transfer before switching connections.',true);return;}
      fill(target);saved=target;try{localStorage.setItem(storage,JSON.stringify({ip:target.ip,port:target.port}));}catch{}
      if(target.url===location.origin+'/'){dialog.close();window.msg?.('You are already using this local connection.');return;}
      if(window.PCRAndroid?.postMessage){
        if(window.PCRNativeCapabilities?.localConnection){busy=true;q('[data-connect]').disabled=true;setStatus('Checking the PC on your local network…');window.PCRAndroid.postMessage(JSON.stringify({type:'connect-local',address:target.ip,port:target.port}));}
        else{window.PCRAndroid.postMessage(JSON.stringify({type:'open-link',url:target.url}));setStatus('Opening the local address in your browser. Install Android app 1.7 to switch inside the app.');}
      }else{busy=true;q('[data-connect]').disabled=true;setStatus('Opening your local PC…');location.assign(target.url);}
    }
    function nativeStatus(value){busy=false;q('[data-connect]').disabled=false;if(value?.message)setStatus(value.message,value.state==='error');}
    q('[data-connect]').onclick=connect;q('[data-close]').onclick=()=>dialog.close();port.addEventListener('input',()=>q('[data-port-label]').textContent=port.value||'7666');for(const field of [input,port])field.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();connect();}});
    q('[data-paste]').onclick=async()=>{try{const text=await navigator.clipboard.readText();input.value=text.trim().slice(0,160);input.focus();const target=parseAddress(input.value,port.value);if(target)fill(target);setStatus(target?'Address pasted.':'Paste your PC address into the field.',!target);}catch{input.focus();setStatus('Touch and hold the address field, then choose Paste.');}};
    dialog.addEventListener('close',()=>{fetching?.abort();busy=false;q('[data-connect]').disabled=false;});
    // The old login shortcut only displayed help. Both sign-in and Devices now
    // reach an actual editable connection page, with no password-form submit.
    const login=document.querySelector('.mcLoginBottom [data-login-help]');if(login){const replacement=login.cloneNode(true);replacement.removeAttribute('data-login-help');replacement.dataset.localOpen='true';login.replaceWith(replacement);replacement.onclick=open;}
    const devices=document.getElementById('sessionTools');if(devices){const section=document.createElement('section');section.className='localDeviceSection';section.innerHTML='<h3>Fast local connection</h3><p>Enter your PC address or choose one from this host.</p><button type="button" class="mcPrimary" data-local-open>Connect using an IP address →</button>';devices.querySelector('header').after(section);section.querySelector('button').onclick=open;}
    const files=document.getElementById('filesDialog');if(files){const shortcut=document.createElement('button');shortcut.type='button';shortcut.className='filesSmallButton localFilesShortcut';shortcut.textContent='Local connection';shortcut.onclick=open;files.querySelector('.filesTabs').after(shortcut);}
    window.addEventListener('pcr:auth',()=>{accountVersion++;fetching?.abort();if(!window.PCRAuth?.signedIn){q('.localSavedPcs>div').replaceChildren();q('.localSavedPcs').hidden=true;}});
    Object.assign(window.PCRLocalConnection,{open,nativeStatus});
  }
  return {parseAddress,mount};
});
