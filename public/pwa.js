'use strict';
(()=>{
  let installPrompt=null;
  let installed=false;
  const standalone=window.matchMedia('(display-mode: standalone)');
  const isInstalled=()=>installed||standalone.matches||navigator.standalone===true;
  const button=()=>document.getElementById('installPhone');
  function updateButton(){const b=button();if(b){b.hidden=isInstalled();b.textContent='Install to phone';}}
  function notify(text){if(typeof window.msg==='function')window.msg(text);}
  function installHelp(){
    let dialog=document.getElementById('installHelp');
    if(!dialog){dialog=document.createElement('dialog');dialog.id='installHelp';document.body.append(dialog);}
    const title=document.createElement('h2');title.id='installHelpTitle';title.textContent='Install PC Remote';
    dialog.setAttribute('aria-labelledby',title.id);
    const ios=/iphone|ipad|ipod/i.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
    const steps=document.createElement('p');
    steps.textContent=ios?'Open this page in Safari, tap Share, then Add to Home Screen and Add.':'Open your browser menu and choose Install app or Add to Home screen. On Android, Chrome supports the install prompt.';
    const note=document.createElement('p');
    note.textContent=window.isSecureContext?'The installed app still needs an internet connection and your Windows host running.':'For installation, open https://remote.teamtrader.co.za in your browser. The installed app needs an internet connection and your Windows host running.';
    const close=document.createElement('button');close.type='button';close.textContent='Got it';close.addEventListener('click',()=>{if(typeof dialog.close==='function')dialog.close();else dialog.removeAttribute('open');});
    dialog.replaceChildren(title,steps,note,close);
    if(typeof dialog.showModal==='function'){if(!dialog.open)dialog.showModal();}else dialog.setAttribute('open','');
  }
  window.addEventListener('beforeinstallprompt',event=>{
    event.preventDefault();installPrompt=event;updateButton();
  });
  window.addEventListener('appinstalled',()=>{installed=true;installPrompt=null;updateButton();notify('PC Remote installed.');});
  standalone.addEventListener?.('change',updateButton);
  async function install(){
    if(isInstalled())return updateButton();
    if(!installPrompt)return installHelp();
    const b=button(),prompt=installPrompt;installPrompt=null;b.disabled=true;
    try{
      await prompt.prompt();
      const choice=await prompt.userChoice;
      if(choice.outcome==='accepted')notify('Finish the installation in your browser.');
    }catch{installHelp();}
    finally{b.disabled=false;updateButton();}
  }
  function init(){
    const b=button();if(b)b.addEventListener('click',install);updateButton();
    if('serviceWorker' in navigator&&window.isSecureContext){
      navigator.serviceWorker.register('/sw.js',{scope:'/',updateViaCache:'none'})
        .catch(()=>{/* Browser menu installation remains available when registration fails. */});
    }
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
