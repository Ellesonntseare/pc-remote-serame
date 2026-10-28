'use strict';
(()=>{
  async function request(url,options={}){
    const response=await fetch(url,{...options,headers:{'X-PCR':'1',...options.headers}});let data;try{data=await response.json();}catch{throw Error('The transfer connection returned an invalid response.');}
    if(!response.ok||data.ok===false)throw Object.assign(Error(data.error||'File transfer failed.'),{status:response.status});return data;
  }
  const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  async function send(files,target,{status=()=>{},active=()=>true}={}){
    if(!/^[A-Za-z0-9-]{12,80}$/.test(target))throw Error('Open the latest APK on your own phone before dropping files.');
    if(!files.length||files.length>100)throw Error('Drop between one and 100 files.');
    const group=crypto.randomUUID(),names=[];let completed=0;
    for(const [index,file]of files.entries()){
      if(!active())throw Error('Sign-in changed. File sending stopped.');
      const relativePath='Phone drops/'+group+'/'+index+'/'+file.name;
      let upload=await request('/api/files/uploads',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:file.name,relativePath,size:file.size})});
      let offset=upload.received,last=upload;
      while(!last.complete){
        if(!active())throw Error('Sign-in changed. File sending stopped.');
        const end=Math.min(file.size,offset+upload.chunkBytes);let attempt=0;
        for(;;)try{last=await request('/api/files/uploads/'+upload.id+'?offset='+offset,{method:'PUT',headers:{'Content-Type':'application/octet-stream'},body:file.slice(offset,end)});break;}
        catch(error){if([400,401,403,404,409,413].includes(error.status)||attempt++>=5)throw error;status('Connection interrupted · resuming '+file.name);await delay(Math.min(8000,250*2**attempt));if(!active())throw Error('Sign-in changed. File sending stopped.');last=await request('/api/files/uploads/'+upload.id+'/resume',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({resumeSecret:upload.resumeSecret})});offset=last.received;if(last.complete||offset>=end)break;}
        offset=last.received;status('Sending '+(index+1)+' / '+files.length+' · '+file.name+' · '+Math.round(100*offset/Math.max(1,file.size))+'%');
      }
      names.push(last.file?.name||relativePath);completed++;
    }
    if(!active())throw Error('Sign-in changed. File sending stopped.');
    const result=await request('/api/phone/files',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({target,names,group})});
    status(completed+' '+(completed===1?'file':'files')+' sent to your phone.');return result;
  }
  window.PCRPhoneDrop={send};
})();
