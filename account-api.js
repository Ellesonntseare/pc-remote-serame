'use strict';
const crypto=require('node:crypto');
const {SETTINGS}=require('./sync-hub');
const allowedKey=key=>key.startsWith('setting:')?SETTINGS.has(key.slice(8)):/^(?:files\.(?:favourites|view|location|sorting|tabs|selection|columns)|workspace\.(?:recent|resume)|drafts\.compose|media\.preferences|controls\.shortcuts|history\.preferences|(?:transfers|folders)\.device:[a-zA-Z0-9-]{12,80})$/.test(key);
const clientActions=new Set(['screen.opened','screen.closed','typing.started','typing.closed','audio.started','audio.stopped','audio.paused','camera.started','camera.stopped','recording.started','recording.saved','recording.stopped','screenshot.saved','presentation.started','presentation.stopped','page.opened','transfer.paused','transfer.resumed','transfer.cancelled','transfer.saved','files.selected','shared.opened','clipboard.local']);
function createAccountAPI({store}={}){
  const waiting=new Set();
  async function handle(req,res,{pathname,scope,device='PC Remote',valid=()=>true,readJson,respond}){
    if(pathname!=='/api/workspace'&&pathname!=='/api/history'&&!pathname.startsWith('/api/history/'))return false;
    const reply=(code,body)=>{respond(res,code,body);return true;};
    if(!scope)return reply(403,{error:'Sign in to your account to view its workspace.'});
    if(req.headers['x-pcr']!=='1')return reply(403,{error:'Request header missing.'});
    try{
      const url=new URL(req.url,'http://localhost');
      if(pathname==='/api/workspace'&&req.method==='GET'){
        const after=Number(url.searchParams.get('after'))||0,historyAfter=Number(url.searchParams.get('historyAfter'))||0,wait=Math.max(0,Math.min(25000,Number(url.searchParams.get('wait'))||0));
        const result=()=>({ok:true,account:scope,...store.read(scope,{after})});
        const meta=store.metadata(scope);
        if(!wait||meta.revision>after||meta.historyRevision>historyAfter)return reply(200,result());
        let timer,unsubscribe;
        const cleanup=()=>{clearTimeout(timer);unsubscribe?.();waiting.delete(finish);res.off('close',cleanup);};
        const finish=()=>{cleanup();if(!res.destroyed)valid()?reply(200,result()):reply(401,{error:'Your session has ended.'});};
        unsubscribe=store.subscribe(changed=>{if(changed===scope)finish();});waiting.add(finish);timer=setTimeout(finish,wait);timer.unref?.();res.once('close',cleanup);return true;
      }
      if(pathname==='/api/workspace'&&req.method==='POST'){
        const body=await readJson(req,1024*1024),changes=body.changes;
        if(!changes||typeof changes!=='object'||Array.isArray(changes)||Object.keys(changes).some(key=>!allowedKey(key)))return reply(400,{error:'Choose supported account workspace settings.'});
        if(body.expected&&(typeof body.expected!=='object'||Array.isArray(body.expected)||Object.values(body.expected).some(value=>!Number.isSafeInteger(value)||value<0)))return reply(400,{error:'Invalid workspace revisions.'});
        store.patch(scope,changes,{expected:body.expected});const versions={};for(const key of Object.keys(changes))versions[key]=store.readKey(scope,key);
        return reply(200,{ok:true,...store.metadata(scope),values:versions});
      }
      if(pathname==='/api/history'&&req.method==='GET')return reply(200,{ok:true,...store.list(scope,{before:Number(url.searchParams.get('before'))||undefined,type:url.searchParams.get('type')||undefined,device:url.searchParams.get('device')||undefined,query:url.searchParams.get('q')||'',limit:Number(url.searchParams.get('limit'))||50})});
      if(pathname==='/api/history/import'&&req.method==='POST'){
        const body=await readJson(req,1024*1024);if(!Array.isArray(body.items)||body.items.length>40)return reply(400,{error:'Send up to 40 saved snippets.'});const events=[];
        for(const item of body.items){
          if(!item||typeof item.text!=='string'||!item.text||item.text.length>250000||!Number.isSafeInteger(item.time)||item.time<0||item.time>Date.now()+300000)return reply(400,{error:'Invalid saved text.'});
          const id='import:'+crypto.createHash('sha256').update(item.time+'\n'+item.text).digest('hex');events.push({id,type:'clipboard',action:'clipboard.imported',label:'Saved text from '+String(item.source||'this device').slice(0,80),text:item.text,device,time:item.time});
        }
        const accepted=store.recordMany(scope,events);return reply(200,{ok:true,accepted:accepted.map(event=>({id:event.id})),...store.metadata(scope)});
      }
      if(pathname==='/api/history/events'&&req.method==='POST'){
        const body=await readJson(req,1024*1024);if(!Array.isArray(body.events)||body.events.length>30)return reply(400,{error:'Send up to 30 activity records.'});const events=[];
        for(const event of body.events){
          if(!event||typeof event.id!=='string'||!/^[-a-zA-Z0-9:.]{1,120}$/.test(event.id)||!clientActions.has(event.action)||typeof event.label!=='string'||event.label.length>500)return reply(400,{error:'Invalid activity record.'});
          const payload=event.payload||{};if(!payload||typeof payload!=='object'||Array.isArray(payload)||Buffer.byteLength(JSON.stringify(payload))>8192||event.text!==undefined&&(typeof event.text!=='string'||event.text.length>250000||event.action!=='clipboard.local'))return reply(400,{error:'Activity details are too large.'});
          events.push({id:'client:'+event.id,action:event.action,type:event.action.split('.')[0],label:event.label,device,payload,text:event.text||'',time:event.time});
        }
        const accepted=store.recordMany(scope,events).map(event=>event.id);return reply(200,{ok:true,accepted,...store.metadata(scope)});
      }
      if(pathname.startsWith('/api/history/')&&req.method==='GET'){
        const id=decodeURIComponent(pathname.slice('/api/history/'.length));if(id.length>180)return reply(400,{error:'Invalid history entry.'});const event=store.get(scope,id);return event?reply(200,{ok:true,event}):reply(404,{error:'This activity entry is unavailable.'});
      }
      return reply(405,{error:'This account action is unavailable.'});
    }catch(error){return reply(error.status||(/Invalid|too large|shorter|URI/.test(error.message)?400:503),{error:error.status===409?'This workspace changed on another device.':['Invalid activity data.','Invalid workspace changes.','Workspace item is too large.','Use a shorter history search.'].includes(error.message)?error.message:'Account data could not be updated. Reconnect and try again.',...(error.conflicts&&{conflicts:error.conflicts})});}
  }
  return{handle,close(){for(const finish of [...waiting])finish();}};
}
module.exports={createAccountAPI,allowedKey};
