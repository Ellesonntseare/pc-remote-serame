'use strict';

// Keep feature lifecycle handlers on their existing controls. Navigation changes
// presentation and history; closing a page still runs its normal cleanup.
(() => {
  if(window.PCRPages)return;
  const titles={rs:'Remote screen',rsSettings:'Customize controls',remoteOptions:'Remote tools',workspaceSettings:'Settings',powerPage:'Power controls',filesDialog:'Files & text',filePreviewDialog:'File preview',audioPage:'Audio',pcAudioDialog:'PC audio',phoneAudioPage:'Send audio',pcAppsDialog:'Switch apps',guestApprovalDialog:'Guest access',guestScreenDialog:'Shared screens',webrtcVideoDialog:'Watch PC',sessionTools:'Devices & handoff',collaborationDialog:'Collaborate',screenTextDialog:'Copy screen text',imageClipboardDialog:'Image clipboard',installHelp:'Install to phone',localConnectionPage:'Local connection',cameraSharing:'Cameras & microphones',missionSearch:'Find a control',missionActivity:'Recent activity',missionHelp:'Help & support'};
  // Preferences also open from Home. Move the existing controls intact into a
  // real page dialog so they can appear above Settings without starting video.
  const oldPreferences=document.getElementById('rsSettings');
  if(oldPreferences&&oldPreferences.tagName!=='DIALOG'){
    const preferences=document.createElement('dialog');for(const attribute of oldPreferences.attributes)preferences.setAttribute(attribute.name,attribute.value);preferences.append(...oldPreferences.childNodes);oldPreferences.replaceWith(preferences);document.body.append(preferences);
    const openPreferences=window.rsPrefsOpen,closePreferences=window.rsPrefsClose;
    window.rsPrefsOpen=function(...args){openPreferences?.apply(this,args);preferences.classList.remove('hide');if(!preferences.open)preferences.showModal();};
    window.rsPrefsClose=function(...args){closePreferences?.apply(this,args);preferences.classList.add('hide');if(preferences.open)preferences.close();};
  }
  const stateKey='pcrNavigation',token=String(Date.now())+'-'+Math.random().toString(36).slice(2),baseTitle=document.title;
  const pages=new Map(),saved=new Map(),activations=new WeakMap();let stack=[],serial=0,lastTrigger=null,activation=null,historyPath=[],historyBusy=false,restoring=null,changing=false;
  const nativeShow=window.HTMLDialogElement?.prototype.showModal,nativeClose=window.HTMLDialogElement?.prototype.close;
  const toggle=(node,name,on)=>{if(node.classList.contains(name)!==on)node.classList.toggle(name,on);};
  const state=path=>({...history.state,[stateKey]:{token,path}});
  const pathFrom=value=>value?.[stateKey]?.token===token&&Array.isArray(value[stateKey].path)?value[stateKey].path:[];
  try{history.replaceState(state([]),'');}catch{}

  function visible(node){
    if(!node?.isConnected)return false;
    if(node.tagName==='DIALOG'||node.tagName==='DETAILS')return node.open;
    return !node.classList.contains('hide')&&(node.id!=='rsSettings'||visible(document.getElementById('rs')));
  }
  function titleFor(node){return node.id==='rs'?titles.rs:node.querySelector('h2')?.textContent.trim()||titles[node.id];}
  function validLauncher(node){return !!node?.isConnected&&node.matches('button,[role=button]')&&!node.matches(':disabled')&&!node.closest('[hidden],.hide,[data-pcr-denied="true"]');}
  function currentLauncher(){
    const choices=[];for(let action=activation;action?.event.eventPhase;action=action.parent)choices.unshift(action.button);
    return choices.find(validLauncher)||null;
  }
  function layoutTools(){
    const grid=document.querySelector('#remoteOptions .workspaceMenuGrid');if(!grid)return;
    let group=[];const finish=()=>{if(group.length%2)toggle(group.at(-1),'pcrMenuWide',true);group=[];};
    for(const node of Array.from(grid.children).sort((a,b)=>(Number(a.style.order)||0)-(Number(b.style.order)||0))){
      if(node.classList.contains('menuGroupTitle')){finish();continue;}
      if(node.tagName!=='BUTTON')continue;toggle(node,'pcrMenuWide',false);
      if(!node.hidden&&node.dataset.pcrDenied!=='true'&&getComputedStyle(node).display!=='none')group.push(node);
    }
    finish();
  }
  function focusPage(node){
    const typing=document.getElementById('typePanel');
    if(node.id==='rs'&&typing&&!typing.classList.contains('hide')&&typing.contains(document.activeElement))return;
    const target=node.id==='rs'?document.getElementById('rsc'):node.querySelector('h2')||node.querySelector('.pcrPageBack');
    if(target){if(!target.hasAttribute('tabindex'))target.tabIndex=-1;target.focus({preventScroll:true});}
  }
  function decorate(node){
    if(node.id==='rs')return;
    const root=node.id==='rsSettings'?node.querySelector('.controlSheet'):node.id==='remoteOptions'?node.querySelector('.remoteOptionsPanel'):node;
    if(!root||(node.id==='audioPage'?root.querySelector(':scope > .pcrPageHeader'):root.querySelector('.pcrPageHeader')))return;
    let header=root.querySelector('.workspacePageHeader,.nativeDialogHead,.filesHeader,.guestDialogHead,.guestScreenHead,.controlHead,header');
    if(!header){header=document.createElement('header');const title=root.querySelector(':scope > h2')||document.createElement('h2');if(!title.textContent)title.textContent=titles[node.id];header.append(title);root.prepend(header);}
    header.classList.add('pcrPageHeader');
    let back=header.querySelector('[data-close],#filesClose,#filePreviewClose,#guestClose,.closeSettings');
    if(!back){back=document.createElement('button');back.type='button';back.addEventListener('click',()=>closePage(node));}
    back.classList.add('pcrPageBack');back.setAttribute('aria-label','Back to previous page');back.title='Back';
    back.innerHTML='<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m14 6-6 6 6 6M8 12h12"/></svg><span>Back</span>';
    header.prepend(back);
    if(node.id==='remoteOptions'){const duplicate=root.querySelector(':scope > strong');if(duplicate)duplicate.hidden=true;root.setAttribute('role','dialog');root.setAttribute('aria-modal','true');root.setAttribute('aria-labelledby','remoteOptionsPageTitle');}
    if(!node.hasAttribute('aria-labelledby')){const heading=header.querySelector('h2');if(heading){if(!heading.id)heading.id=node.id+'PageTitle';node.setAttribute('aria-labelledby',heading.id);}}
  }
  function render(){
    const current=stack.at(-1);
    for(const node of pages.values())toggle(node,'pcrPageCurrent',node===current?.node);
    toggle(document.body,'pcrPageOpen',stack.length>0);
    document.title=current?titleFor(current.node)+' · '+baseTitle:baseTitle;
    window.dispatchEvent(new CustomEvent('pcr:page',{detail:{id:current?.node.id||'home'}}));
  }
  function syncHistory(){
    if(changing||historyBusy)return;
    const desired=stack.map(page=>page.key);let common=0;
    while(common<historyPath.length&&common<desired.length&&historyPath[common]===desired[common])common++;
    try{
      if(historyPath.length>common){historyBusy=true;history.go(common-historyPath.length);return;}
      for(let i=common;i<desired.length;i++){historyPath=desired.slice(0,i+1);history.pushState(state(historyPath),'');}
    }catch{historyBusy=false;historyPath=desired;}
  }
  function enter(node){
    if(stack.some(page=>page.node===node))return;
    // The tools grid is a launcher. Selecting a feature replaces that launcher.
    const options=document.getElementById('remoteOptions');
    if(node.tagName==='DIALOG'&&options?.open){options.open=false;leave(options,false);}
    const screen=document.getElementById('rs');
    if(node!==screen&&visible(screen)&&!stack.some(page=>page.node===screen))enter(screen);
    if(node.id!=='rs'){
      window.rsTypeClose?.();window.PCRHoldControl?.release();
      document.activeElement?.blur?.();
    }
    decorate(node);if(node.id==='remoteOptions')layoutTools();
    const page=restoring?.node===node?restoring:{node,key:++serial,opener:lastTrigger?.isConnected?lastTrigger:document.activeElement,launcher:currentLauncher()};
    saved.set(page.key,page);stack.push(page);render();syncHistory();
    if(!changing)focusPage(node);
  }
  function restoreFocus(page){
    const current=stack.at(-1)?.node,opener=page?.opener;
    // A page must never reopen a phone text editor as a side effect of Back.
    if(opener?.isConnected&&opener.matches('button,a,summary,[role=button]')&&(!current||current.contains(opener))){opener.focus({preventScroll:true});return;}
    if(current)focusPage(current);
    else document.getElementById('screenBtn')?.focus({preventScroll:true});
  }
  function leave(node,focus=true){
    const index=stack.findIndex(page=>page.node===node);if(index<0)return;
    const [page]=stack.splice(index,1);render();syncHistory();if(focus&&!changing)restoreFocus(page);
  }
  function closePage(node){
    if(!node||!visible(node)){if(node)leave(node);return;}
    if(node.tagName==='DIALOG'){
      // Files has additional focus/preview work on its Close button.
      const close=node.querySelector('.pcrPageBack');
      if(close&&!close.dataset.pcrClosing){close.dataset.pcrClosing='true';close.click();delete close.dataset.pcrClosing;if(!visible(node))return;}
      node.close();
    }else if(node.id==='rsSettings'){window.rsPrefsClose?.();node.classList.add('hide');}
    else if(node.id==='remoteOptions')node.open=false;
    else if(node.id==='rs'){window.rsClose?.();node.classList.add('hide');}
    leave(node);
  }
  const observer=new MutationObserver(records=>{
    for(const {target}of records){if(!pages.has(target.id))continue;if(target.id==='rsSettings'&&target.tagName==='DIALOG'){if(target.classList.contains('hide')&&target.open)target.close();else if(!target.classList.contains('hide')&&!target.open)target.showModal();}if(visible(target))enter(target);else leave(target);}
  });
  function register(node){
    if(!node||!titles[node.id]||pages.has(node.id))return;
    pages.set(node.id,node);node.classList.add('pcrPage');decorate(node);
    observer.observe(node,{attributes:true,attributeFilter:node.id==='rsSettings'?['open','class']:node.tagName==='DIALOG'||node.tagName==='DETAILS'?['open']:['class']});
    if(node.tagName==='DIALOG'){
      node.addEventListener('close',()=>{if(!node.open)leave(node);});
      node.addEventListener('cancel',event=>{event.preventDefault();closePage(node);});
      // Empty page space is part of the page, not a dismissible backdrop.
      node.addEventListener('click',event=>{if(event.target===node)event.stopImmediatePropagation();},true);
    }
    if(node.id==='remoteOptions')new MutationObserver(layoutTools).observe(node,{subtree:true,attributes:true,attributeFilter:['hidden','data-pcr-denied']});
    if(visible(node))enter(node);
  }
  if(window.HTMLDialogElement){
    window.HTMLDialogElement.prototype.showModal=function(...args){
      if(!titles[this.id])return nativeShow?.apply(this,args);
      if(this.id==='rsSettings')this.classList.remove('hide');
      register(this);decorate(this);
      const result=nativeShow?nativeShow.apply(this,args):this.setAttribute('open','');enter(this);return result;
    };
    window.HTMLDialogElement.prototype.close=function(...args){
      if(this.id==='rsSettings'&&!this.classList.contains('hide'))this.classList.add('hide');
      const result=nativeClose?nativeClose.apply(this,args):this.removeAttribute('open');if(titles[this.id]&&!this.open)leave(this);return result;
    };
  }
  for(const id of Object.keys(titles))register(document.getElementById(id));
  new MutationObserver(records=>{for(const record of records){if(pages.has(record.target.id)&&visible(record.target))decorate(record.target);for(const node of record.addedNodes)if(node.nodeType===1){register(node);for(const child of node.querySelectorAll?.('dialog,#remoteOptions')||[])register(child);}}}).observe(document.body,{childList:true,subtree:true});
  document.addEventListener('click',event=>{
    const button=event.target.closest('button,a,summary,[role=button]');if(!button)return;lastTrigger=button;
    const action={button,event,parent:activation?.event.eventPhase?activation:null};activation=action;activations.set(event,action);
    queueMicrotask(()=>{if(activation===action)activation=null;});
  },true);
  document.addEventListener('click',event=>{const action=activations.get(event);if(activation===action)activation=action.parent;});

  function reconcile(){
    for(const node of pages.values()){if(visible(node))enter(node);else leave(node,false);}
  }
  function back(){
    const transient=Array.from(document.querySelectorAll('dialog[open]')).reverse().find(node=>!titles[node.id]);
    if(transient){transient.close();return true;}
    const confirmation=document.getElementById('modal');
    if(confirmation?.classList.contains('on')){window.closeM?.();confirmation.classList.remove('on');return true;}
    reconcile();
    const current=stack.at(-1)?.node;
    if(current?.id==='rs'&&document.getElementById('typePanel')&&!document.getElementById('typePanel').classList.contains('hide')){window.rsTypeClose?.();return true;}
    if(current?.id==='rs'&&current.classList.contains('screenClean')){document.getElementById('rsRestoreControls')?.click();return true;}
    if(!current)return false;
    closePage(current);return true;
  }
  document.addEventListener('keydown',event=>{
    if(event.defaultPrevented)return;
    const current=stack.at(-1)?.node;
    if(event.key==='Tab'&&current&&current.id!=='rs'&&current.tagName!=='DIALOG'){
      const root=current.id==='remoteOptions'?current.querySelector('.remoteOptionsPanel'):current;
      const targets=Array.from(root.querySelectorAll('button,input,select,textarea,a[href],[tabindex]')).filter(node=>!node.disabled&&node.tabIndex>=0&&!node.closest('[hidden],.hide,[data-pcr-denied="true"]')&&getComputedStyle(node).display!=='none');
      const index=targets.indexOf(document.activeElement);
      if(targets.length&&(index<0||event.shiftKey&&index===0||!event.shiftKey&&index===targets.length-1)){event.preventDefault();targets[event.shiftKey?targets.length-1:0].focus({preventScroll:true});}
      return;
    }
    if(event.key!=='Escape')return;
    reconcile();if(stack.at(-1)?.node.id==='rs'&&!document.querySelector('dialog[open]:not(.pcrPage),#modal.on'))return;
    if(back()){event.preventDefault();event.stopImmediatePropagation();}
  },true);
  document.addEventListener('focusin',event=>{
    const current=stack.at(-1)?.node;
    if(current&&current.id!=='rs'&&current.tagName!=='DIALOG'&&!current.contains(event.target)&&!event.target.closest('dialog[open]'))focusPage(current);
  },true);
  window.addEventListener('popstate',event=>{
    const next=pathFrom(event.state);historyPath=next;
    if(historyBusy){historyBusy=false;syncHistory();return;}
    changing=true;let common=0;while(common<stack.length&&common<next.length&&stack[common].key===next[common])common++;
    const departed=stack[common];
    for(const page of stack.slice(common).reverse())closePage(page.node);
    for(const key of next.slice(common)){
      const page=saved.get(key);if(!page?.node.isConnected)break;restoring=page;
      if(page.node.tagName==='DIALOG'){
        // Re-run the feature's own open handler so previews rebuild their media,
        // lists refresh, and sockets reconnect. Never replay an unrelated last
        // click or revive a page whose original launcher is no longer allowed.
        // An install helper's launcher can later become a native install prompt.
        if(page.node.id==='installHelp'||!validLauncher(page.launcher)){restoring=null;break;}
        page.launcher.click();
      }
      else if(page.node.id==='rs')window.rsOpen?.();
      else if(page.node.id==='rsSettings')window.rsPrefsOpen?.();
      else page.node.open=true;
      if(visible(page.node))enter(page.node);else{restoring=null;break;}restoring=null;
    }
    changing=false;render();syncHistory();restoreFocus(departed);
  });
  window.addEventListener('pcr:auth',event=>{
    if(event.detail?.signedIn)return;
    for(const page of stack.slice().reverse())closePage(page.node);
    saved.clear();
  });
  function home(){changing=true;try{for(let i=0;i<30&&stack.length;i++)closePage(stack.at(-1).node);}finally{changing=false;render();syncHistory();}}
  window.PCRPages={back,home,get current(){reconcile();return stack.at(-1)?.node.id||'home';}};
})();
