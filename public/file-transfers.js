'use strict';
(() => {
  const dialog=document.createElement('dialog');dialog.id='filesDialog';dialog.setAttribute('aria-labelledby','filesTitle');
  dialog.innerHTML='<div class="filesHeader"><div><span class="filesEyebrow">YOUR PERSONAL DROP</span><h2 id="filesTitle">Files & text<span>↗</span></h2><p>From this device to your PC. And back.</p></div><button class="filesIconButton" id="filesClose" aria-label="Close file transfers">✕</button></div><div class="filesTabs" role="tablist" aria-label="Transfer type"><button role="tab" aria-selected="true" aria-controls="filesPane" id="filesTab">Files</button><button role="tab" aria-selected="false" aria-controls="textPane" id="textTab">Text</button></div><section id="filesPane" role="tabpanel" aria-labelledby="filesTab"><div id="filesDrop" class="filesDrop"><div class="filesUploadIcon">↥</div><strong>Drop it here.</strong><span>Any file type. No converting.</span><button type="button" class="filesPrimary" id="filesChoose">Choose files</button><input type="file" id="filesInput" multiple hidden></div><div class="filesListHeader"><div><h3>On your PC</h3><span id="filesCount">Loading files…</span></div><div><button type="button" class="filesSmallButton" id="filesFolder">Open PC folder</button><button type="button" class="filesIconButton" id="filesRefresh" aria-label="Refresh files">↻</button></div></div><label class="filesSearch"><span aria-hidden="true">⌕</span><input type="search" id="filesSearch" placeholder="Find a file" aria-label="Search shared files"></label><div id="filesList" class="filesList"></div><p class="filesFolderPath" id="filesFolderPath"></p></section><section id="textPane" role="tabpanel" aria-labelledby="textTab" hidden><div class="filesTextIntro"><span>✎</span><h3>A thought. A link. A whole page.</h3><p>Send your text to the PC as a .txt file.</p></div><label for="filesNoteName">File name</label><input id="filesNoteName" class="filesField" placeholder="Quick note.txt" maxlength="160"><label for="filesNote">Your text</label><textarea id="filesNote" class="filesField" rows="7" placeholder="Type or paste anything here…"></textarea><button type="button" class="filesPrimary filesSendText" id="filesSendText">Send text to PC <span>↗</span></button></section><div id="filesProgress" class="filesProgress" hidden><div><span id="filesProgressName"></span><button id="filesCancel" type="button">Cancel</button></div><progress id="filesProgressBar" max="100" value="0"></progress><span id="filesProgressLabel"></span></div><p id="filesStatus" class="filesStatus" role="status" aria-live="polite"></p>';
  document.body.append(dialog);const el=id=>document.getElementById(id);
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
  let files=[],maxBytes=2*1024*1024*1024,batch=null,previousFocus=null;
  const TRANSFER_KEY='pcr_pending_uploads_v1',fileCache=new Map();let pending=[];
  function loadPending(){try{const saved=JSON.parse(localStorage.getItem(TRANSFER_KEY)||'[]');if(Array.isArray(saved))pending=saved.filter(u=>u&&/^[a-f0-9]{32}$/.test(u.id)&&/^[a-f0-9]{64}$/.test(u.resumeSecret)&&typeof u.name==='string'&&u.name.length<=180&&Number.isSafeInteger(u.size)&&u.size>=0&&Number.isFinite(u.modified)&&Number.isFinite(u.expires)&&u.expires>Date.now()&&Number.isSafeInteger(u.received)&&u.received>=0&&u.received<=u.size&&typeof u.fingerprint==='string'&&u.fingerprint.length<=100).slice(0,8);}catch{}}
  const recovery=document.createElement('section');recovery.className='filesRecovery';recovery.innerHTML='<h3>Interrupted transfers</h3><p>Resume from the last saved chunk. After reopening this page, choose the original file to continue. Kept for 7 days.</p><div id="filesPending"></div><input type="file" id="filesResumeInput" hidden>';el('filesDrop').after(recovery);let reselectId=null;
  function savePending(){if(window.PCRAuth?.signedIn&&window.PCRAuth.role==='owner')try{localStorage.setItem(TRANSFER_KEY,JSON.stringify(pending));}catch{status('Device storage is full. Keep this page open to resume this transfer.',true);}renderPending();}
  function forgetPending(id){pending=pending.filter(u=>u.id!==id);fileCache.delete(id);savePending();}
  function renderPending(){
    recovery.hidden=!pending.length;const list=el('filesPending');list.replaceChildren();
    for(const u of pending){const row=document.createElement('div');row.className='filesPendingRow';const info=document.createElement('div'),title=document.createElement('strong'),detail=document.createElement('span');title.textContent=u.name;detail.textContent=size(u.received)+' of '+size(u.size)+' saved';info.append(title,detail);const resume=document.createElement('button');resume.type='button';resume.className='filesSmallButton';resume.textContent=fileCache.has(u.id)?'Resume / Retry':'Choose file to resume';resume.disabled=!!batch;resume.addEventListener('click',()=>{if(fileCache.has(u.id))void send([fileCache.get(u.id)],u);else{reselectId=u.id;el('filesResumeInput').value='';el('filesResumeInput').click();}});const remove=document.createElement('button');remove.type='button';remove.className='filesSmallButton';remove.textContent='Discard';remove.disabled=!!batch;remove.addEventListener('click',async()=>{if(batch)return;try{const r=await api('/api/files/uploads/'+u.id+'/resume',{method:'POST',body:JSON.stringify({resumeSecret:u.resumeSecret})});if(!r.ok){if(r.status===404){forgetPending(u.id);status('Removed from this device. Any remaining PC partial expires after 7 days.');return;}throw Error(r.error||'Sign in to the same account to discard this upload.');}const deleted=await api('/api/files/uploads/'+u.id,{method:'DELETE'});if(!deleted.ok)throw Error(deleted.error||'Could not discard the upload.');forgetPending(u.id);status('Interrupted transfer discarded.');}catch(e){status(e.message||'Connect to the PC to discard this transfer.',true);}});row.append(info,resume,remove);list.append(row);}
  }
  async function fingerprint(file){
    if(!globalThis.crypto?.subtle)return 'metadata-only';
    const sample=await new Blob([file.slice(0,65536),file.slice(Math.max(0,file.size-65536))]).arrayBuffer();const hash=await crypto.subtle.digest('SHA-256',sample);return Array.from(new Uint8Array(hash),b=>b.toString(16).padStart(2,'0')).join('');
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
  function size(bytes){if(bytes<1024)return bytes+' B';const units=['KB','MB','GB'];let value=bytes/1024,i=0;while(value>=1024&&i<2){value/=1024;i++;}return value.toFixed(value>=100?0:1)+' '+units[i];}
  function status(message,error=false){el('filesStatus').textContent=message;el('filesStatus').dataset.error=String(error);}
  function kind(name){const ext=name.split('.').pop().toLowerCase();if(['mp3','wav','flac','aac','m4a','ogg'].includes(ext))return ['♫','audio'];if(ext==='pdf')return ['PDF','document'];if(['png','jpg','jpeg','webp','gif','heic','svg'].includes(ext))return ['▧','image'];if(['mp4','mkv','mov','avi','webm'].includes(ext))return ['▷','video'];if(['txt','md','csv','log','json'].includes(ext))return ['≡','text'];if(['zip','7z','rar','gz'].includes(ext))return ['▤','archive'];return ['↳','file'];}
  function render(){
    const list=el('filesList'),query=el('filesSearch').value.trim().toLowerCase();list.replaceChildren();
    const visible=files.filter(file=>file.name.toLowerCase().includes(query));
    if(!visible.length){const empty=document.createElement('div');empty.className='filesEmpty';empty.textContent=query?'No matching files.':'A clear space for your next file. Upload one, or add files to the PC folder.';list.append(empty);return;}
    for(const file of visible){
      const row=document.createElement('div');row.className='filesRow';const [symbol,type]=kind(file.name),icon=document.createElement('span');icon.className='filesType '+type;icon.textContent=symbol;
      const info=document.createElement('div');info.className='filesInfo';const name=document.createElement('strong');name.textContent=file.name;name.title=file.name;const detail=document.createElement('span');detail.textContent=size(file.size)+' · '+new Date(file.modified).toLocaleDateString(undefined,{month:'short',day:'numeric'});info.append(name,detail);
      row.append(icon,info);if(file.preview){const view=document.createElement('button');view.type='button';view.className='filesSmallButton';view.textContent='Preview';view.setAttribute('aria-label','Preview '+file.name);view.addEventListener('click',()=>openPreview(file));row.append(view);}const download=document.createElement('a');download.className='filesDownload';download.href='/api/files/download?name='+encodeURIComponent(file.name);download.download=file.name;download.textContent='↓';download.title='Download '+file.name;download.setAttribute('aria-label','Download '+file.name);row.append(download);list.append(row);
    }
  }
  async function refresh(){
    const epoch=authEpoch;if(!window.PCRCanAccess?.('download')){files=[];render();return;}
    try{const data=await api('/api/files');if(epoch!==authEpoch)return;if(!data.ok)throw Error(data.error||'Sign in again to see your files.');files=data.files;maxBytes=data.maxBytes;el('filesCount').textContent=data.total+' '+(data.total===1?'file':'files');el('filesFolderPath').textContent=window.PCRAuth?.role==='guest'?'Shared transfer folder':data.folder;render();}
    catch(e){status(e.message,true);el('filesCount').textContent='Files unavailable';}
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
      xhr.upload.addEventListener('progress',e=>{if(e.lengthComputable){const loaded=Math.min(file.size,start+e.loaded);el('filesProgressBar').value=file.size?100*loaded/file.size:100;el('filesProgressLabel').textContent=size(loaded)+' / '+size(file.size);}});
      xhr.onload=()=>{job.xhr=null;let data;try{data=JSON.parse(xhr.responseText);}catch{return reject(Error('The host did not accept this upload. Sign in again and retry.'));}if(xhr.status>=200&&xhr.status<300&&data.ok)resolve(data);else reject(Error(data.error||'Upload failed.'));};
      xhr.onerror=()=>reject(Error('Connection interrupted. Use Resume / Retry to continue from the last saved chunk.'));xhr.ontimeout=()=>reject(Error('Upload timed out. Use Resume / Retry when the connection improves.'));xhr.onabort=()=>reject(Error(job.cancelled?'Upload cancelled.':'Upload paused. Use Resume / Retry to continue.'));xhr.send(file.slice(start,end));
    });
  }
  async function send(list,resuming=null){
    if(!window.PCRCanAccess?.('upload')){status('Sending files was not approved.',true);return;}
    if(batch){status('Finish or cancel the current transfer first.',true);return;}
    const job=batch={cancelled:false,paused:false,id:null,xhr:null,epoch:authEpoch};el('filesProgress').hidden=false;renderPending();let completed=0;
    try{
      for(const file of list){
        if(job.cancelled)break;if(file.size>maxBytes)throw Error(file.name+' is larger than '+size(maxBytes)+'.');
        el('filesProgressName').textContent=file.name;el('filesProgressBar').value=0;status('Sending '+(completed+1)+' of '+list.length+'…');
        // Selecting the same file again recovers its saved transfer instead of silently starting over.
        let saved=resuming||pending.find(u=>u.name===file.name&&u.size===file.size&&u.modified===file.lastModified),upload;
        if(saved){if(saved.fingerprint!=='metadata-only'&&await fingerprint(file)!==saved.fingerprint)throw Error('The selected file contents changed. Choose the original file or discard its interrupted transfer.');upload=await api('/api/files/uploads/'+saved.id+'/resume',{method:'POST',body:JSON.stringify({resumeSecret:saved.resumeSecret})});if(!upload.ok)throw Error(upload.error||'Could not resume. Sign in to the same account and retry.');if(upload.name!==file.name||upload.size!==file.size)throw Error('The saved transfer belongs to a different file.');saved.received=upload.received;saved.expires=upload.expires;savePending();}
        else{
          if(pending.length>=8)throw Error('Resume or discard an interrupted transfer before starting another.');
          const identity=await fingerprint(file);upload=await api('/api/files/uploads',{method:'POST',body:JSON.stringify({name:file.name,size:file.size})});if(!upload.ok)throw Error(upload.error||'Could not start the transfer.');
          if(job.epoch!==authEpoch)throw Error('Account changed. Transfer stopped.');saved={id:upload.id,resumeSecret:upload.resumeSecret,name:file.name,size:file.size,modified:file.lastModified,fingerprint:identity,received:upload.received,expires:upload.expires};pending.unshift(saved);savePending();
        }
        if(job.epoch!==authEpoch)throw Error('Account changed. Transfer stopped.');fileCache.set(upload.id,file);job.id=upload.id;el('filesProgressBar').value=file.size?100*upload.received/file.size:100;el('filesProgressLabel').textContent=size(upload.received)+' / '+size(file.size);
        let response=upload,offset=upload.received;
        while(offset<file.size&&!job.cancelled&&!job.paused){response=await chunk(upload,file,offset,Math.min(file.size,offset+upload.chunkBytes),job);if(job.epoch!==authEpoch)throw Error('Account changed. Transfer stopped.');offset=response.received;saved.received=offset;savePending();}
        if(job.cancelled)throw Error('Upload cancelled.');if(job.paused)throw Error('Upload paused. Use Resume / Retry to continue.');if(!response.complete)throw Error('The PC did not finish this file. Use Resume / Retry to check it.');forgetPending(upload.id);job.id=null;completed++;await refresh();resuming=null;
      }
      status(completed+' '+(completed===1?'file sent':'files sent')+' to your PC.');
    }catch(e){status(e.message,true);}
    finally{if(job.epoch===authEpoch&&job.cancelled&&job.id){await api('/api/files/uploads/'+job.id,{method:'DELETE'}).catch(()=>{});forgetPending(job.id);}batch=null;el('filesProgress').hidden=true;el('filesInput').value='';renderPending();}
  }
  el('filesChoose').addEventListener('click',()=>el('filesInput').click());el('filesInput').addEventListener('change',()=>{const selected=Array.from(el('filesInput').files);if(selected.length)void send(selected);});
  el('filesCancel').addEventListener('click',()=>{if(batch){batch.cancelled=true;batch.xhr?.abort();}});
  const pause=document.createElement('button');pause.type='button';pause.textContent='Pause';pause.addEventListener('click',()=>{if(batch){batch.paused=true;batch.xhr?.abort();}});el('filesCancel').before(pause);
  const drop=el('filesDrop');for(const event of ['dragenter','dragover'])drop.addEventListener(event,e=>{e.preventDefault();drop.classList.add('dragging');});drop.addEventListener('dragleave',()=>drop.classList.remove('dragging'));drop.addEventListener('drop',e=>{e.preventDefault();drop.classList.remove('dragging');const selected=Array.from(e.dataTransfer.files);if(selected.length)void send(selected);});
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
  function accountChanged(){const next=window.PCRAuth?.signedIn?(window.PCRAuth.role==='owner'?'owner':'guest:'+window.PCRAuth.guestId):'';if(next===account)return;account=next;authEpoch++;if(batch){batch.cancelled=true;batch.xhr?.abort();}history=[];pending=[];files=[];fileCache.clear();el('filesNote').value='';el('filesSearch').value='';el('clipboardSearch').value='';el('filesFolderPath').textContent='';el('filesStatus').textContent='';if(next==='owner'){loadHistory();loadPending();}historySection.hidden=next!=='owner';renderHistory();renderPending();render();close();window.PCRGuestAccess?.applyPermissions();}
  window.addEventListener('pcr:auth',accountChanged);accountChanged();
})();
