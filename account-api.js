'use strict';
const {SETTINGS}=require('./sync-hub');
const allowedKey=key=>key.startsWith('setting:')?SETTINGS.has(key.slice(8)):/^(?:files\.(?:favourites|view|location|sorting|tabs|selection|columns)|workspace\.(?:recent|resume)|drafts\.compose|media\.preferences|controls\.shortcuts|history\.preferences)$/.test(key);
const clientActions=new Set(['screen.opened','screen.closed','typing.started','typing.closed','audio.started','audio.stopped','audio.paused','camera.started','camera.stopped','recording.started','recording.saved','recording.stopped','screenshot.saved','presentation.started','presentation.stopped','page.opened','transfer.paused','transfer.resumed','transfer.cancelled','transfer.saved','files.selected','shared.opened']);
function createAccountAPI({store}={}){
  async function handle(req,res,{pathname,scope,device='PC Remote',readJson,respond}){
    if(pathname!=='/api/workspace'&&pathname!=='/api/history'&&!pathname.startsWith('/api/history/'))return false;
    const reply=(code,body)=>{respond(res,code,body);return true;};if(!scope)return reply(403,{error:'Sign in to your account to view its workspace.'});if(req.headers['x-pcr']!=='1')return reply(403,{error:'Request header missing.'});
    try{
      const url=new URL(req.url,'http://localhost');
      if(pathname==='/api/workspace'&&req.method==='GET')return reply(200,{ok:true,account:scope,...store.read(scope,{after:Number(url.searchParams.get('after'))||0})});
      if(pathname==='/api/workspace'&&req.method==='POST'){
        const body=await readJson(req,1024*1024),changes=body.changes;if(!changes||typeof changes!=='object'||Array.isArray(changes)||Object.keys(changes).some(key=>!allowedKey(key)))return reply(400,{error:'Choose supported account workspace settings.'});const before=store.metadata(scope),meta=store.patch(scope,changes);if(meta.revision!==before.revision)store.record(scope,{type:'settings',action:'settings.changed',label:'Updated account preferences',device,payload:{keys:Object.keys(changes)}});return reply(200,{ok:true,...store.metadata(scope)});
      }
      if(pathname==='/api/history'&&req.method==='GET')return reply(200,{ok:true,...store.list(scope,{before:Number(url.searchParams.get('before'))||undefined,type:url.searchParams.get('type')||undefined,device:url.searchParams.get('device')||undefined,query:url.searchParams.get('q')||'',limit:Number(url.searchParams.get('limit'))||50})});
      if(pathname==='/api/history/events'&&req.method==='POST'){
        const body=await readJson(req,1024*1024);if(!Array.isArray(body.events)||body.events.length>30)return reply(400,{error:'Send up to 30 activity records.'});const events=[];
        for(const event of body.events){if(!event||typeof event.id!=='string'||!/^[-a-zA-Z0-9:.]{1,120}$/.test(event.id)||!clientActions.has(event.action)||typeof event.label!=='string'||event.label.length>500)return reply(400,{error:'Invalid activity record.'});const payload=event.payload||{};if(!payload||typeof payload!=='object'||Array.isArray(payload)||Buffer.byteLength(JSON.stringify(payload))>8192)return reply(400,{error:'Activity details are too large.'});events.push({id:'client:'+event.id,action:event.action,type:event.action.split('.')[0],label:event.label,device,payload});}
        const accepted=[];for(const event of events)accepted.push(store.record(scope,event).id);return reply(200,{ok:true,accepted,...store.metadata(scope)});
      }
      if(pathname.startsWith('/api/history/')&&req.method==='GET'){
        const id=decodeURIComponent(pathname.slice('/api/history/'.length));if(id.length>180)return reply(400,{error:'Invalid history entry.'});const event=store.get(scope,id);return event?reply(200,{ok:true,event}):reply(404,{error:'This activity entry is unavailable.'});
      }
      return reply(405,{error:'This account action is unavailable.'});
    }catch(error){return reply(error.status||(/Invalid|too large|shorter|URI/.test(error.message)?400:503),{error:['Invalid activity data.','Invalid workspace changes.','Workspace item is too large.','Use a shorter history search.'].includes(error.message)?error.message:'Account data could not be updated. Reconnect and try again.'});}
  }
  return{handle};
}
module.exports={createAccountAPI,allowedKey};
