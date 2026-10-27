'use strict';
(() => {
  const dialog=document.createElement('dialog');dialog.id='filesDialog';dialog.setAttribute('aria-labelledby','filesTitle');
  dialog.innerHTML='<div class="filesHeader"><div><span class="filesEyebrow">YOUR PERSONAL DROP</span><h2 id="filesTitle">Files & text<span>↗</span></h2><p>From this device to your PC. And back.</p></div><button class="filesIconButton" id="filesClose" aria-label="Close file transfers">✕</button></div><div class="filesTabs" role="tablist" aria-label="Transfer type"><button role="tab" aria-selected="true" aria-controls="filesPane" id="filesTab">Files</button><button role="tab" aria-selected="false" aria-controls="textPane" id="textTab">Text</button></div><section id="filesPane" role="tabpanel" aria-labelledby="filesTab"><div id="filesDrop" class="filesDrop"><div class="filesUploadIcon">↥</div><strong>Drop it here.</strong><span>Any file type. No converting.</span><button type="button" class="filesPrimary" id="filesChoose">Choose files</button><input type="file" id="filesInput" multiple hidden></div><div class="filesListHeader"><div><h3>On your PC</h3><span id="filesCount">Loading files…</span></div><div><button type="button" class="filesSmallButton" id="filesFolder">Open PC folder</button><button type="button" class="filesIconButton" id="filesRefresh" aria-label="Refresh files">↻</button></div></div><label class="filesSearch"><span aria-hidden="true">⌕</span><input type="search" id="filesSearch" placeholder="Find a file" aria-label="Search shared files"></label><div id="filesList" class="filesList"></div><p class="filesFolderPath" id="filesFolderPath"></p></section><section id="textPane" role="tabpanel" aria-labelledby="textTab" hidden><div class="filesTextIntro"><span>✎</span><h3>A thought. A link. A whole page.</h3><p>Send your text to the PC as a .txt file.</p></div><label for="filesNoteName">File name</label><input id="filesNoteName" class="filesField" placeholder="Quick note.txt" maxlength="160"><label for="filesNote">Your text</label><textarea id="filesNote" class="filesField" rows="7" placeholder="Type or paste anything here…"></textarea><button type="button" class="filesPrimary filesSendText" id="filesSendText">Send text to PC <span>↗</span></button></section><div id="filesProgress" class="filesProgress" hidden><div><span id="filesProgressName"></span><button id="filesCancel" type="button">Cancel</button></div><progress id="filesProgressBar" max="100" value="0"></progress><span id="filesProgressLabel"></span></div><p id="filesStatus" class="filesStatus" role="status" aria-live="polite"></p>';
  document.body.append(dialog);const el=id=>document.getElementById(id);
  const folderInput=document.createElement('input');folderInput.type='file';folderInput.id='filesFolderInput';folderInput.multiple=true;folderInput.hidden=true;folderInput.setAttribute('webkitdirectory','');folderInput.setAttribute('directory','');
  const folderButton=document.createElement('button');folderButton.type='button';folderButton.id='filesChooseFolder';folderButton.className='filesSmallButton';folderButton.textContent='Send a folder';
  const pickers=document.createElement('div');pickers.className='filesPickers';el('filesChoose').before(pickers);pickers.append(el('filesChoose'),folderButton,folderInput);
  // A real, directly tapped file input works in WebViews that ignore a hidden
  // input's synthetic click. Keep the button as the visual and keyboard fallback.
  const pickerSlot=document.createElement('span');pickerSlot.className='filesPickerSlot';el('filesChoose').before(pickerSlot);pickerSlot.append(el('filesChoose'),el('filesInput'));el('filesInput').hidden=false;el('filesInput').setAttribute('aria-label','Choose files to send to your PC');el('filesChoose').tabIndex=-1;el('filesChoose').setAttribute('aria-hidden','true');
  el('filesDrop').querySelector('strong').textContent='Send to your PC';el('filesDrop').querySelector('strong+span').textContent='Choose files or a folder. Drop them here on a computer.';
  const directions=document.createElement('nav');directions.className='filesDirections';directions.setAttribute('aria-label','File transfer direction');
  for(const [value,label]of [['all','All transfers'],['send','Send to PC'],['receive','Receive here']]){const button=document.createElement('button');button.type='button';button.dataset.direction=value;button.textContent=label;button.setAttribute('aria-pressed',String(value==='all'));button.addEventListener('click',()=>{el('filesPane').dataset.direction=value;for(const other of directions.querySelectorAll('button'))other.setAttribute('aria-pressed',String(other===button));if(value==='receive')void refresh();});directions.append(button);}el('filesPane').prepend(directions);el('filesPane').querySelector('.filesListHeader h3').textContent='Receive on this device';el('textTab').textContent='Text & links';
  const folderHint=document.createElement('p');folderHint.className='filesFolderHint';folderHint.textContent='Folders keep their structure. On phones without a folder picker, choose files or send a ZIP.';el('filesDrop').append(folderHint);
  const notifyRow=document.createElement('label');notifyRow.className='filesNotify';notifyRow.innerHTML='<input type="checkbox" id="filesNotify"><span>Notify me when a transfer finishes</span>';el('filesPane').append(notifyRow);
  const batchList=document.createElement('ol');batchList.id='filesBatchList';batchList.className='filesBatchList';batchList.hidden=true;el('filesProgress').before(batchList);
  const filePaths=new WeakMap();let folders=[];
  function selectedPath(file,fallback){const name=filePaths.get(file)||file.webkitRelativePath||file.name;return fallback||(window.PCRFileManager?.destination?window.PCRFileManager.destination+'/'+name:name);}
  const notificationKey='pcr_transfer_notifications';try{el('filesNotify').checked=localStorage.getItem(notificationKey)==='true'&&globalThis.Notification?.permission==='granted';}catch{}
  el('filesNotify').addEventListener('change',async()=>{
    const input=el('filesNotify');if(input.checked){
      if(!('Notification' in window)){input.checked=false;status('This browser does not support transfer notifications.',true);return;}
      const epoch=authEpoch;let permission=Notification.permission;try{if(permission==='default')permission=await Notification.requestPermission();}catch{permission='denied';}
      if(epoch!==authEpoch||!dialog.isConnected)return;if(permission!=='granted'){input.checked=false;status('Notifications are off. Transfer progress stays here.');}
    }
    try{localStorage.setItem(notificationKey,String(input.checked));}catch{}
  });
  async function finishedNotice(count){
    if(!count||!el('filesNotify')?.checked||globalThis.Notification?.permission!=='granted')return;
    const title=count===1?'File sent to your PC':count+' files sent to your PC';
    const options={body:'Your transfer is ready in the PC transfer folder.',tag:'pcr-file-transfer'};
    try{const notice=new Notification(title,options);notice.onclick=()=>{window.focus();notice.close();};}
    catch{try{const registration=await navigator.serviceWorker?.getRegistration?.();if(registration)await registration.showNotification(title,options);}catch{}}
  }
  el('textPane').innerHTML='<div class="filesTextIntro"><span>⇄</span><h3>Copy here. Paste there.</h3><p>Text between your phone and PC, in both directions.</p></div><label for="filesNote">Your text</label><textarea id="filesNote" class="filesField" rows="6" maxlength="250000" placeholder="Type or paste your text here…"></textarea><div class="clipboardActions"><button type="button" id="clipboardSend" class="filesPrimary">Send to PC clipboard ↗</button><button type="button" id="clipboardGet" class="filesSmallButton">Get PC clipboard ↙</button></div><div class="clipboardLocal"><button type="button" id="clipboardPaste">Paste from this device</button><button type="button" id="clipboardCopy">Copy to this device</button></div><details class="textFileExtras"><summary>Save text as a file</summary><label for="filesNoteName">File name</label><input id="filesNoteName" class="filesField" placeholder="Quick note.txt" maxlength="160"><button type="button" class="filesSmallButton filesSendText" id="filesSendText">Save .txt on PC ↗</button></details>';
  const historySection=document.createElement('section');historySection.className='clipboardHistory';historySection.innerHTML='<div class="clipboardHistoryHeader"><div><h3>Snippets & history</h3><span>Saved on this device · pinned text stays at the top</span></div><button type="button" id="clipboardClear">Clear unpinned</button></div><label class="filesSearch"><span aria-hidden="true">⌕</span><input type="search" id="clipboardSearch" placeholder="Search saved text" aria-label="Search snippets and clipboard history"></label><div id="clipboardHistoryList"></div>';el('textPane').append(historySection);
  const HISTORY_KEY='pcr_clipboard_history_v1';let history=[];
  function loadHistory(){try{const saved=JSON.parse(localStorage.getItem(HISTORY_KEY)||'[]');if(Array.isArray(saved))history=saved.filter(item=>item&&typeof item.text==='string'&&item.text.length<=250000&&typeof item.source==='string'&&item.source.length<=100&&Number.isFinite(item.time)).slice(0,40).map(item=>({...item,pinned:item.pinned===true}));}catch{}}
  function saveHistory(){
    // Keep at most twenty pins, twenty recent items and ~1 MB of text on this device.
    history=history.filter(item=>item.pinned).slice(0,20).concat(history.filter(item=>!item.pinned).slice(0,20));
    while(history.length&&JSON.stringify(history).length>500000){const index=history.map(item=>item.pinned).lastIndexOf(false);history.splice(index<0?history.length-1:index,1);}
    if(window.PCRAuth?.signedIn&&window.PCRAuth.role==='owner')try{localStorage.setItem(HISTORY_KEY,JSON.stringify(history));}catch{status('Device storage is full. Saved text is available until this page closes.',true);}
  }
  function renderHistory(){
    const list=el('clipboardHistoryList');list.replaceChildren();
    const query=el('clipboardSearch').value.trim().toLocaleLowerCase(),visible=history.filter(item=>(item.text+' '+item.source).toLocaleLowerCase().includes(query)).sort((a,b)=>Number(b.pinned)-Number(a.pinned)||b.time-a.time);
    if(!visible.length){const empty=document.createElement('p');empty.className='clipboardHistoryEmpty';empty.textContent=query?'No matching saved text.':'Your copied text will appear here. Pin text to keep it handy.';list.append(empty);return;}
    for(const item of visible){
      const row=document.createElement('details');row.className='clipboardHistoryItem';row.dataset.pinned=String(item.pinned);const summary=document.createElement('summary'),meta=document.createElement('span'),preview=document.createElement('span');meta.className='clipboardHistoryMeta';meta.textContent=(item.pinned?'★ Pinned · ':'')+item.source+' · '+new Date(item.time).toLocaleString([],{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'});preview.className='clipboardHistorySnippet';preview.textContent=item.text.replace(/\s+/g,' ').slice(0,100);summary.append(meta,preview);
      const body=document.createElement('div');body.className='clipboardHistoryBody';const text=document.createElement('pre');text.className='clipboardHistoryPreview';const use=document.createElement('button');use.type='button';use.textContent='Use full text ↗';use.addEventListener('click',()=>{el('filesNote').value=item.text;el('filesNote').focus();status('Saved text loaded. Copy it or send it to the PC.');});
      const pin=document.createElement('button');pin.type='button';pin.textContent=item.pinned?'Unpin':'Pin snippet';pin.setAttribute('aria-pressed',String(item.pinned));pin.addEventListener('click',()=>{if(!item.pinned&&history.filter(h=>h.pinned).length>=20){status('You can pin up to 20 snippets. Unpin one to make room.',true);return;}if(!item.pinned&&JSON.stringify(history.filter(h=>h.pinned).concat({...item,pinned:true})).length>500000){status('Pinned snippets have reached this device’s storage limit. Unpin a snippet first.',true);return;}item.pinned=!item.pinned;saveHistory();renderHistory();});
      const remove=document.createElement('button');remove.type='button';remove.textContent='Delete';remove.addEventListener('click',()=>{history=history.filter(h=>h!==item);saveHistory();renderHistory();});body.append(text,use,pin,remove);row.append(summary,body);row.addEventListener('toggle',()=>{text.textContent=row.open?item.text:'';});list.append(row);
    }
  }
  function rememberText(text,source){
    if(!text||text.length>250000)return;const previous=history.find(item=>item.text===text);history=history.filter(item=>item.text!==text);
    history.unshift({text,source,time:Date.now(),pinned:previous?.pinned===true});saveHistory();renderHistory();
  }
  saveHistory();renderHistory();el('clipboardSearch').addEventListener('input',renderHistory);el('clipboardClear').addEventListener('click',()=>{history=history.filter(item=>item.pinned);saveHistory();renderHistory();status('Unpinned clipboard history cleared on this device.');});
  const home=document.createElement('button');home.className='quick wide filesHome';home.type='button';home.innerHTML='Files & text <span>Send files between this device and your PC</span>';
  document.querySelector('.heroactions').append(home);
  const remote=document.createElement('button');remote.type='button';remote.textContent='Files';remote.dataset.filesButton='true';remote.addEventListener('click',open);document.querySelector('.rsbot').append(remote);home.addEventListener('click',open);
  let files=[],maxBytes=2*1024*1024*1024,batch=null,pausedBatch=null,previousFocus=null;
  let transferRows=[],lastTransferNotice=0,unloadGuard=false;
  function keepBatchOpen(event){event.preventDefault();event.returnValue='';}
  function publishTransfer(index,patch,force=false){if(batch&&index===batch.index&&Number.isFinite(patch.percent))batch.percent=patch.percent;if(transferRows[index])Object.assign(transferRows[index],patch);const now=Date.now();if(!force&&now-lastTransferNotice<150)return;lastTransferNotice=now;window.dispatchEvent(new CustomEvent('pcr:transfers',{detail:transferRows.map(row=>({...row}))}));publishSummary();}
  function publishSummary(){const current=batch?.epoch===authEpoch?batch:null,remaining=current?Math.max(0,current.files.length-current.nextIndex):(pausedBatch?.files.length||0);if(!!remaining!==unloadGuard){unloadGuard=!!remaining;if(unloadGuard)window.addEventListener('beforeunload',keepBatchOpen);else window.removeEventListener('beforeunload',keepBatchOpen);}window.dispatchEvent(new CustomEvent('pcr:transfer-summary',{detail:{source:'browser',remaining,paused:!!pausedBatch||!!current?.paused,percent:current?current.percent||0:pausedBatch?.percent||0}}));}
  const TRANSFER_KEY='pcr_pending_uploads_v1',fileCache=new Map();let pending=[];
  function loadPending(){try{const saved=JSON.parse(localStorage.getItem(TRANSFER_KEY)||'[]');if(Array.isArray(saved))pending=saved.filter(u=>u&&/^[a-f0-9]{32}$/.test(u.id)&&/^[a-f0-9]{64}$/.test(u.resumeSecret)&&typeof u.name==='string'&&u.name.length<=180&&(!u.relativePath||typeof u.relativePath==='string'&&u.relativePath.length<=800)&&Number.isSafeInteger(u.size)&&u.size>=0&&Number.isFinite(u.modified)&&Number.isFinite(u.expires)&&u.expires>Date.now()&&Number.isSafeInteger(u.received)&&u.received>=0&&u.received<=u.size&&typeof u.fingerprint==='string'&&u.fingerprint.length<=100).slice(0,8);}catch{}}
  const recovery=document.createElement('section');recovery.className='filesRecovery';recovery.innerHTML='<h3>Interrupted transfers</h3><p>Resume from the last saved chunk. After reopening this page, choose the original file to continue. Kept for 7 days.</p><div id="filesPending"></div><input type="file" id="filesResumeInput" hidden>';el('filesDrop').after(recovery);let reselectId=null;
  function savePending(redraw=true){if(window.PCRAuth?.signedIn&&window.PCRAuth.role==='owner')try{localStorage.setItem(TRANSFER_KEY,JSON.stringify(pending));}catch{status('Device storage is full. Keep this page open to resume this transfer.',true);}if(redraw)renderPending();}
  function forgetPending(id){pending=pending.filter(u=>u.id!==id);fileCache.delete(id);savePending();}
  async function discardUpload(upload){
    if(batch)return false;const epoch=authEpoch;
    try{const result=await api('/api/files/uploads/'+upload.id+'/resume',{method:'POST',body:JSON.stringify({resumeSecret:upload.resumeSecret})});if(epoch!==authEpoch)return false;
      if(!result.ok){if(result.status===404){forgetPending(upload.id);return true;}throw Error(result.error||'Sign in to the same account to discard this upload.');}
      const removed=await api('/api/files/uploads/'+upload.id,{method:'DELETE'});if(epoch!==authEpoch)return false;if(!removed.ok&&removed.status!==404)throw Error(removed.error||'Could not discard the upload.');forgetPending(upload.id);return true;
    }catch(error){if(epoch===authEpoch)status(error.message||'Connect to the PC to discard this transfer.',true);return false;}
  }
  function renderPending(){
    recovery.hidden=!pending.length;const list=el('filesPending');list.replaceChildren();
    for(const upload of pending){
      const row=document.createElement('div');row.className='filesPendingRow';const info=document.createElement('div'),title=document.createElement('strong'),detail=document.createElement('span');title.textContent=upload.name;detail.textContent=size(upload.received)+' of '+size(upload.size)+' saved';info.append(title,detail);
      const resume=document.createElement('button');resume.type='button';resume.className='filesSmallButton';resume.textContent=fileCache.has(upload.id)?'Resume / Retry':'Choose file to resume';resume.disabled=!!batch||!!pausedBatch;resume.hidden=pausedBatch?.id===upload.id;
      resume.addEventListener('click',()=>{if(fileCache.has(upload.id))void send([fileCache.get(upload.id)],upload);else{reselectId=upload.id;el('filesResumeInput').value='';el('filesResumeInput').click();}});
      const remove=document.createElement('button');remove.type='button';remove.className='filesSmallButton';remove.textContent='Discard';remove.disabled=!!batch||!!pausedBatch;remove.hidden=resume.hidden;remove.addEventListener('click',async()=>{remove.disabled=true;try{if(await discardUpload(upload))status('Interrupted transfer discarded.');}finally{remove.disabled=!!batch||!!pausedBatch;}});row.append(info,resume,remove);list.append(row);
    }
  }
  async function fingerprint(file){
    if(!globalThis.crypto?.subtle)return 'metadata-only';
    const blob=new Blob([file.slice(0,65536),file.slice(Math.max(0,file.size-65536))]);
    const sample=typeof blob.arrayBuffer==='function'?await blob.arrayBuffer():await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(Error('This file could not be read. Choose it again from your device.'));reader.readAsArrayBuffer(blob);});
    const hash=await crypto.subtle.digest('SHA-256',sample);return Array.from(new Uint8Array(hash),b=>b.toString(16).padStart(2,'0')).join('');
  }
  el('filesResumeInput').addEventListener('change',async()=>{const file=el('filesResumeInput').files[0],u=pending.find(p=>p.id===reselectId);if(!file||!u)return;if(file.name!==u.name||file.size!==u.size||file.lastModified!==u.modified||(u.fingerprint!=='metadata-only'&&await fingerprint(file)!==u.fingerprint)){status('Choose the same original file: its name, size, date or contents differ.',true);return;}fileCache.set(u.id,file);void send([file],u);});renderPending();
  const preview=document.createElement('dialog');preview.id='filePreviewDialog';preview.setAttribute('aria-labelledby','filePreviewTitle');preview.innerHTML='<header><div><span class="filesEyebrow">FILE PREVIEW</span><h2 id="filePreviewTitle"></h2></div><button type="button" class="filesIconButton" id="filePreviewClose" aria-label="Close preview">✕</button></header><div id="filePreviewBody"></div><footer><span id="filePreviewHint">Preview unavailable? Download the original file.</span><a id="filePdfViewer" class="filesSmallButton" target="_blank" rel="noopener noreferrer" hidden>Open PDF viewer ↗</a><a id="filePreviewDownload" class="filesSmallButton">Download original ↓</a></footer>';document.body.append(preview);let previewFocus=null;
  function cleanupPreview(){for(const media of preview.querySelectorAll('audio,video')){media.pause();media.removeAttribute('src');media.load();}for(const frame of preview.querySelectorAll('iframe'))frame.src='about:blank';el('filePreviewBody').replaceChildren();}
  function closePreview(){preview.close();}
  preview.addEventListener('close',()=>{cleanupPreview();previewFocus?.focus?.({preventScroll:true});});el('filePreviewClose').addEventListener('click',closePreview);
  function openPreview(file){
    if(!file.preview)return;cleanupPreview();previewFocus=document.activeElement;el('filePreviewTitle').textContent=file.name;const url='/api/files/preview?name='+encodeURIComponent(file.name),type=file.preview.type;let media;
    if(type==='image'){media=document.createElement('img');media.alt=file.name;}
    else if(type==='pdf'){media=document.createElement('iframe');media.title='PDF preview: '+file.name;media.setAttribute('sandbox','');media.setAttribute('referrerpolicy','no-referrer');}
    else if(type==='audio'||type==='video'){media=document.createElement(type);media.controls=true;media.preload='metadata';if(type==='video')media.playsInline=true;}
    else return;
    media.src=url;media.addEventListener('error',()=>{el('filePreviewHint').textContent='This browser cannot preview the file. Download it to open it.';});el('filePreviewBody').append(media);el('filePreviewHint').textContent=type==='pdf'?'If this restricted frame is blank, open your browser’s PDF viewer.':'Preview unavailable? Download the original file.';el('filePdfViewer').hidden=type!=='pdf';el('filePdfViewer').href=type==='pdf'?url:'';el('filePreviewDownload').href='/api/files/download?name='+encodeURIComponent(file.name);el('filePreviewDownload').download=file.name;preview.showModal();
  }
  window.PCRFilePreview=openPreview;
  function size(bytes){if(bytes<1024)return bytes+' B';const units=['KB','MB','GB'];let value=bytes/1024,i=0;while(value>=1024&&i<2){value/=1024;i++;}return value.toFixed(value>=100?0:1)+' '+units[i];}
  function status(message,error=false){el('filesStatus').textContent=message;el('filesStatus').dataset.error=String(error);}
  function kind(name){const ext=name.split('.').pop().toLowerCase();if(['mp3','wav','flac','aac','m4a','ogg'].includes(ext))return ['♫','audio'];if(ext==='pdf')return ['PDF','document'];if(['png','jpg','jpeg','webp','gif','heic','svg'].includes(ext))return ['▧','image'];if(['mp4','mkv','mov','avi','webm'].includes(ext))return ['▷','video'];if(['txt','md','csv','log','json'].includes(ext))return ['≡','text'];if(['zip','7z','rar','gz'].includes(ext))return ['▤','archive'];return ['↳','file'];}
  function render(){
    const list=el('filesList');if(window.PCRFileManager){list.replaceChildren();return;}const query=el('filesSearch').value.trim().toLowerCase();list.replaceChildren();
    const visible=files.filter(file=>file.name.toLowerCase().includes(query));
    for(const folder of folders.filter(folder=>folder.name.toLowerCase().includes(query))){const row=document.createElement('div');row.className='filesRow filesFolderRow';const icon=document.createElement('span');icon.className='filesType folder';icon.textContent='▤';const info=document.createElement('div');info.className='filesInfo';const title=document.createElement('strong');title.textContent=folder.name;const detail=document.createElement('span');detail.textContent=folder.count+' files · '+size(folder.size);info.append(title,detail);const download=document.createElement('a');download.className='filesSmallButton filesFolderDownload';download.href='/api/files/folder?name='+encodeURIComponent(folder.name);download.textContent='Save ZIP';download.setAttribute('download',folder.name+'.zip');row.append(icon,info,download);list.append(row);}
    if(!visible.length){const empty=document.createElement('div');empty.className='filesEmpty';empty.textContent=query?'No matching files.':'A clear space for your next file. Upload one, or add files to the PC folder.';list.append(empty);return;}
    for(const file of visible){
      const row=document.createElement('div');row.className='filesRow';const [symbol,type]=kind(file.name),icon=document.createElement('span');icon.className='filesType '+type;icon.textContent=symbol;
      const info=document.createElement('div');info.className='filesInfo';const name=document.createElement('strong');name.textContent=file.name;name.title=file.name;const detail=document.createElement('span');detail.textContent=size(file.size)+' · '+new Date(file.modified).toLocaleDateString(undefined,{month:'short',day:'numeric'});info.append(name,detail);
      row.append(icon,info);if(file.preview){const view=document.createElement('button');view.type='button';view.className='filesSmallButton';view.textContent='Preview';view.setAttribute('aria-label','Preview '+file.name);view.addEventListener('click',()=>openPreview(file));row.append(view);}const download=document.createElement('a');download.className='filesDownload';download.href='/api/files/download?name='+encodeURIComponent(file.name);download.download=file.name.split('/').at(-1);download.textContent='↓';download.title='Download '+file.name;download.setAttribute('aria-label','Download '+file.name);download.draggable=true;download.addEventListener('dragstart',event=>{event.dataTransfer?.setData('DownloadURL','application/octet-stream:'+download.download+':'+download.href);});row.append(download);list.append(row);
    }
  }
  async function refresh(){
    const epoch=authEpoch;if(!dialog.isConnected)return;if(!window.PCRCanAccess?.('download')){files=[];folders=[];render();return;}
    try{const data=await api('/api/files');if(epoch!==authEpoch||!dialog.isConnected)return;if(!data.ok)throw Error(data.error||'Sign in again to see your files.');files=data.files;folders=Array.isArray(data.folders)?data.folders:[];maxBytes=data.maxBytes;el('filesCount').textContent=data.total+' '+(data.total===1?'file':'files')+(data.truncated?' · first 2,000 shown':'');el('filesFolderPath').textContent=window.PCRAuth?.role==='guest'?'Shared transfer folder':data.folder;render();}
    catch(e){if(epoch!==authEpoch||!dialog.isConnected)return;status(e.message,true);el('filesCount').textContent='Files unavailable';}
  }
  async function open(event){
    if(!dialog.open){
      // Bottom controls can retain textarea focus. Restore the Files button,
      // never that editor, when the dialog closes.
      previousFocus=event?.currentTarget||home;
      document.activeElement?.blur?.();rsTypeClose();
      tab(!window.PCRCanAccess?.('upload')&&!window.PCRCanAccess?.('download'));dialog.showModal();
    }
    await refresh();
  }
  function close(){const wasOpen=dialog.open;if(preview.open)closePreview();dialog.close();if(wasOpen&&window.PCRAuth?.signedIn)previousFocus?.focus?.({preventScroll:true});}
  el('filesClose').addEventListener('click',close);el('filesRefresh').addEventListener('click',refresh);el('filesSearch').addEventListener('input',render);
  function tab(text){el('filesTab').setAttribute('aria-selected',String(!text));el('textTab').setAttribute('aria-selected',String(text));el('filesPane').hidden=text;el('textPane').hidden=!text;}
  el('filesTab').addEventListener('click',()=>tab(false));el('textTab').addEventListener('click',()=>tab(true));
  el('filesFolder').addEventListener('click',async()=>{try{const r=await api('/api/files/open-folder',{method:'POST',body:'{}'});status(r.ok?'Transfer folder opened on your PC. Add files there to download them here.':r.error,!r.ok);}catch{status('Could not open the folder. Its location is shown below the file list.',true);}});
  function chunk(upload,file,start,end,job){
    return new Promise((resolve,reject)=>{
      const xhr=job.xhr=new XMLHttpRequest();xhr.open('PUT','/api/files/uploads/'+upload.id+'?offset='+start);xhr.setRequestHeader('X-PCR','1');xhr.setRequestHeader('Content-Type','application/octet-stream');xhr.timeout=180000;
      xhr.upload.addEventListener('progress',e=>{if(e.lengthComputable){const loaded=Math.min(file.size,start+e.loaded);el('filesProgressBar').value=file.size?100*loaded/file.size:100;el('filesProgressLabel').textContent=size(loaded)+' / '+size(file.size);publishTransfer(job.index,{percent:file.size?100*loaded/file.size:100,state:'sending'});}});
      xhr.onload=()=>{job.xhr=null;let data;try{data=JSON.parse(xhr.responseText);}catch{return reject(Error('The host did not accept this upload. Sign in again and retry.'));}if(xhr.status>=200&&xhr.status<300&&data.ok)resolve(data);else reject(Error(data.error||'Upload failed.'));};
      xhr.onerror=()=>reject(Error('Connection interrupted. Tap Resume batch to continue from the last saved chunk.'));xhr.ontimeout=()=>reject(Error('Upload timed out. Tap Resume batch when the connection improves.'));xhr.onabort=()=>reject(Error(job.cancelled?'Upload cancelled.':'Upload paused. Tap Resume batch to continue.'));xhr.send(file.slice(start,end));
    });
  }
  async function send(list,resuming=null,locations=null){
    if(!window.PCRCanAccess?.('upload')){status('Sending files was not approved.',true);return;}
    if(batch){status('Finish or cancel the current transfer first.',true);return;}
    if(pausedBatch){status('Resume or cancel the paused batch before choosing more files.',true);return;}
    if(list.length>2000){status('Choose up to 2,000 files per batch.',true);return;}
    // A batch keeps its original destination even if another folder is browsed.
    const paths=locations||new Map(list.map((file,index)=>[file,index===0&&resuming?.relativePath||selectedPath(file)]));
    const job=batch={cancelled:false,paused:false,id:null,xhr:null,epoch:authEpoch,files:list,paths,nextIndex:0,index:0,percent:0};el('filesProgress').hidden=false;el('filesProgress').dataset.state='sending';pause.textContent='Pause';renderPending();let completed=0;
    batchList.replaceChildren();batchList.hidden=false;const rows=new Map();transferRows=list.slice(0,20).map(file=>({name:file.name,percent:0,state:'queued'}));publishTransfer(-1,{},true);
    for(const [index,file]of list.slice(0,20).entries()){const row=document.createElement('li');const name=document.createElement('span'),state=document.createElement('small');name.textContent=paths.get(file);state.textContent='Queued';row.append(name,state);batchList.append(row);rows.set(index,row);}
    if(list.length>20){const more=document.createElement('li');more.textContent='And '+(list.length-20)+' more files';batchList.append(more);}
    try{
      for(const [index,file]of list.entries()){
        job.index=index;job.percent=0;publishTransfer(index,{state:'sending'},true);
        if(job.cancelled)throw Error('Upload cancelled.');if(job.paused)throw Error('Upload paused. Resume the batch when ready.');if(file.size>maxBytes)throw Error(file.name+' is larger than '+size(maxBytes)+'.');
        const relativePath=paths.get(file),row=rows.get(index);if(row){row.dataset.state='active';row.querySelector('small').textContent='Sending';}
        el('filesProgressName').textContent=(index+1)+' / '+list.length+' · '+relativePath;el('filesProgressBar').value=0;status('Sending '+(completed+1)+' of '+list.length+'…');
        // Selecting the same file again recovers its saved transfer instead of silently starting over.
        let saved=resuming||pending.find(u=>u.name===file.name&&(u.relativePath||u.name)===relativePath&&u.size===file.size&&u.modified===file.lastModified),upload;
        if(saved){job.receiptId=saved.id;if(saved.fingerprint!=='metadata-only'&&await fingerprint(file)!==saved.fingerprint)throw Error('The selected file contents changed. Choose the original file or discard its interrupted transfer.');upload=await api('/api/files/uploads/'+saved.id+'/resume',{method:'POST',body:JSON.stringify({resumeSecret:saved.resumeSecret})});if(!upload.ok)throw Error(upload.error||'Could not resume. Sign in to the same account and retry.');if(upload.name!==file.name||upload.size!==file.size)throw Error('The saved transfer belongs to a different file.');saved.received=upload.received;saved.expires=upload.expires;savePending();}
        else{
          if(pending.length>=8)throw Error('Resume or discard an interrupted transfer before starting another.');
          const identity=await fingerprint(file);upload=await api('/api/files/uploads',{method:'POST',body:JSON.stringify({name:file.name,relativePath,size:file.size})});if(!upload.ok)throw Error(upload.error||'Could not start the transfer.');
          if(job.epoch!==authEpoch)throw Error('Account changed. Transfer stopped.');saved={id:upload.id,resumeSecret:upload.resumeSecret,name:file.name,relativePath,size:file.size,modified:file.lastModified,fingerprint:identity,received:upload.received,expires:upload.expires};pending.unshift(saved);savePending();
        }
        if(job.epoch!==authEpoch)throw Error('Account changed. Transfer stopped.');fileCache.set(upload.id,file);job.id=upload.id;el('filesProgressBar').value=file.size?100*upload.received/file.size:100;job.percent=el('filesProgressBar').value;publishSummary();el('filesProgressLabel').textContent=size(upload.received)+' / '+size(file.size);
        let response=upload,offset=upload.received;
        while(offset<file.size&&!job.cancelled&&!job.paused){response=await chunk(upload,file,offset,Math.min(file.size,offset+upload.chunkBytes),job);if(job.epoch!==authEpoch)throw Error('Account changed. Transfer stopped.');offset=response.received;saved.received=offset;savePending(false);}
        if(job.cancelled)throw Error('Upload cancelled.');if(job.paused)throw Error('Upload paused. Resume the batch when ready.');if(!response.complete)throw Error('The PC did not finish this file. Use Resume / Retry to check it.');forgetPending(upload.id);job.id=null;job.receiptId=null;completed++;job.nextIndex=index+1;publishTransfer(job.index,{percent:100,state:'complete'},true);if(row){row.dataset.state='complete';row.querySelector('small').textContent='Sent';if(response.file?.name&&window.PCRAuth?.role==='owner'){const reveal=document.createElement('button');reveal.type='button';reveal.className='filesSmallButton';reveal.textContent='Show in PC folder';reveal.onclick=async()=>{reveal.disabled=true;try{const result=await api('/api/files/reveal',{method:'POST',body:JSON.stringify({name:response.file.name})});status(result.ok?'File selected on your PC.':result.error,!result.ok);}finally{reveal.disabled=false;}};row.append(reveal);}}resuming=null;
      }
      status(completed+' '+(completed===1?'file sent':'files sent')+' to your PC.');
      if(job.epoch===authEpoch&&completed===list.length)void finishedNotice(completed);
    }catch(e){if(job.epoch===authEpoch&&dialog.isConnected){if(!job.cancelled){const remaining=list.slice(job.nextIndex);pausedBatch={files:remaining,paths:new Map(remaining.map(file=>[file,paths.get(file)])),id:job.id||job.receiptId||null,percent:job.percent||0};}else for(const row of transferRows)if(row.state!=='complete')row.state='cancelled';publishTransfer(job.index,{state:job.cancelled?'cancelled':'paused'},true);status(e.message,!job.paused&&!job.cancelled);const active=batchList.querySelector('[data-state=active]');if(active){active.dataset.state='paused';active.querySelector('small').textContent=job.cancelled?'Cancelled':'Paused';}}}
    finally{if(job.epoch===authEpoch&&job.cancelled&&job.id){const deleted=await api('/api/files/uploads/'+job.id,{method:'DELETE'}).catch(()=>null);if(deleted?.ok||deleted?.status===404)forgetPending(job.id);}if(batch===job)batch=null;if(dialog.isConnected&&job.epoch===authEpoch){el('filesProgress').hidden=!pausedBatch;el('filesProgress').dataset.state=pausedBatch?'paused':'complete';pause.textContent=pausedBatch?'Resume batch':'Pause';if(pausedBatch)el('filesProgressName').textContent=pausedBatch.files.length+' '+(pausedBatch.files.length===1?'file paused':'files paused');el('filesInput').value='';folderInput.value='';renderPending();publishSummary();if(completed)await refresh();}}
  }
  el('filesChoose').addEventListener('click',()=>el('filesInput').click());el('filesInput').addEventListener('change',()=>{const selected=Array.from(el('filesInput').files);if(selected.length)void send(selected);});
  folderButton.addEventListener('click',()=>folderInput.click());folderInput.addEventListener('change',()=>{const selected=Array.from(folderInput.files);if(selected.length)void send(selected);});
  el('filesCancel').addEventListener('click',()=>{if(batch){batch.cancelled=true;batch.xhr?.abort();}else if(pausedBatch){const saved=pending.find(item=>item.id===pausedBatch.id);pausedBatch=null;for(const row of transferRows)if(row.state!=='complete')row.state='cancelled';el('filesProgress').hidden=true;renderPending();publishTransfer(-1,{},true);status('Paused batch cancelled.');if(saved)void discardUpload(saved);}});
  const pause=document.createElement('button');pause.type='button';pause.id='filesPause';pause.textContent='Pause';pause.addEventListener('click',()=>{if(batch){batch.paused=true;batch.xhr?.abort();}else if(pausedBatch){const saved=pausedBatch;pausedBatch=null;void send(saved.files,pending.find(item=>item.id===saved.id)||null,saved.paths);}});el('filesCancel').before(pause);
  async function droppedFiles(transfer){
    const entries=Array.from(transfer.items||[]).map(item=>item.webkitGetAsEntry?.()).filter(Boolean);if(!entries.length)return Array.from(transfer.files||[]);
    const result=[];let visited=0;
    async function walk(entry,parent='',depth=0){
      if(++visited>4000||depth>12)throw Error('Choose a smaller folder with at most twelve levels.');const relative=parent+entry.name;
      if(entry.isFile){const file=await new Promise((resolve,reject)=>entry.file(resolve,reject));if(result.length>=2000)throw Error('Choose up to 2,000 files per batch.');filePaths.set(file,relative);result.push(file);}
      else if(entry.isDirectory){const reader=entry.createReader();for(;;){const children=await new Promise((resolve,reject)=>reader.readEntries(resolve,reject));if(!children.length)break;for(const child of children)await walk(child,relative+'/',depth+1);}}
    }
    for(const entry of entries)await walk(entry);return result;
  }
  const drop=el('filesDrop');for(const event of ['dragenter','dragover'])drop.addEventListener(event,e=>{e.preventDefault();drop.classList.add('dragging');});drop.addEventListener('dragleave',()=>drop.classList.remove('dragging'));drop.addEventListener('drop',async e=>{e.preventDefault();drop.classList.remove('dragging');const epoch=authEpoch;try{const selected=await droppedFiles(e.dataTransfer);if(epoch!==authEpoch||!dialog.isConnected)return;if(selected.length)void send(selected);else status('This folder has no files to send.');}catch(error){if(epoch===authEpoch&&dialog.isConnected)status(error.message,true);}});
  el('filesSendText').addEventListener('click',()=>{const text=el('filesNote').value;if(!text){status('Add some text first.',true);return;}let name=el('filesNoteName').value.trim()||'Quick note.txt';if(!/\.txt$/i.test(name))name+='.txt';void send([new File([text],name,{type:'text/plain;charset=utf-8'})]);});
  el('clipboardSend').addEventListener('click',async()=>{
    const button=el('clipboardSend');button.disabled=true;
    const epoch=authEpoch,text=el('filesNote').value;try{const r=await api('/api/clipboard',{method:'POST',body:JSON.stringify({text})});if(epoch!==authEpoch)return;if(!r.ok)throw Error(r.error||'PC clipboard unavailable.');rememberText(text,'This device → PC');status('Copied to the PC clipboard. Use Ctrl+V on your PC to paste.');}catch(e){status(e.message,true);}finally{button.disabled=false;}
  });
  el('clipboardGet').addEventListener('click',async()=>{
    const button=el('clipboardGet');button.disabled=true;
    const epoch=authEpoch;try{const r=await api('/api/clipboard');if(epoch!==authEpoch)return;if(!r.ok)throw Error(r.error||'PC clipboard unavailable.');el('filesNote').value=r.text;rememberText(r.text,'PC → this device');status(r.text?'PC text received. Tap Copy to this device to paste it elsewhere.':'The PC clipboard has no text.');}catch(e){status(e.message,true);}finally{button.disabled=false;}
  });
  el('clipboardCopy').addEventListener('click',async()=>{
    const text=el('filesNote').value;
    try{if(!navigator.clipboard?.writeText)throw Error();await navigator.clipboard.writeText(text);rememberText(text,'Copied on this device');status('Copied. Paste it into any app on this device.');}
    catch{if(!dialog.open)return;el('filesNote').select();try{if(!document.execCommand('copy'))throw Error();rememberText(text,'Copied on this device');status('Copied to this device.');}catch{status('Text selected. Use Copy from your browser or phone menu.');}}
  });
  el('clipboardPaste').addEventListener('click',async()=>{const epoch=authEpoch;try{const text=await navigator.clipboard.readText();if(epoch!==authEpoch||!dialog.open)return;el('filesNote').value=text;status('Text pasted. Send it to the PC when ready.');}catch{if(epoch===authEpoch&&dialog.open)status('Long-press this text field and choose Paste, or press Ctrl+V.');}});
  let authEpoch=0,account='';
  function accountChanged(){const next=window.PCRAuth?.signedIn?(window.PCRAuth.role==='owner'?'owner':'guest:'+window.PCRAuth.guestId):'';if(next===account)return;account=next;authEpoch++;pausedBatch=null;el('filesProgress').hidden=true;transferRows=[];publishTransfer(-1,{},true);if(batch){batch.cancelled=true;batch.xhr?.abort();}history=[];pending=[];files=[];folders=[];batchList.replaceChildren();batchList.hidden=true;fileCache.clear();el('filesNote').value='';el('filesSearch').value='';el('clipboardSearch').value='';el('filesFolderPath').textContent='';el('filesStatus').textContent='';if(next==='owner'){loadHistory();loadPending();}historySection.hidden=next!=='owner';renderHistory();renderPending();render();close();window.PCRGuestAccess?.applyPermissions();}
  window.addEventListener('pcr:auth',accountChanged);accountChanged();
})();
