'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');

/** Durable account data. History is retained; list responses contain text previews only. */
function createAccountWorkspace({file=':memory:',now=Date.now}={}){
  const {DatabaseSync}=require('node:sqlite');
  if(file!==':memory:')fs.mkdirSync(path.dirname(file),{recursive:true});
  const db=new DatabaseSync(file);let closed=false;const listeners=new Set();
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=3000;
    CREATE TABLE IF NOT EXISTS workspace_accounts(account TEXT PRIMARY KEY,revision INTEGER NOT NULL DEFAULT 0,event_count INTEGER NOT NULL DEFAULT 0,last_event INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS workspace_values(account TEXT NOT NULL,key TEXT NOT NULL,value TEXT NOT NULL,revision INTEGER NOT NULL,PRIMARY KEY(account,key));
    CREATE TABLE IF NOT EXISTS workspace_events(seq INTEGER PRIMARY KEY AUTOINCREMENT,account TEXT NOT NULL,id TEXT NOT NULL,time INTEGER NOT NULL,type TEXT NOT NULL,action TEXT NOT NULL,label TEXT NOT NULL,device TEXT NOT NULL,payload TEXT NOT NULL,text TEXT NOT NULL,UNIQUE(account,id));
    CREATE INDEX IF NOT EXISTS workspace_event_account ON workspace_events(account,seq DESC);
    CREATE INDEX IF NOT EXISTS workspace_event_type ON workspace_events(account,type,seq DESC);
    CREATE VIRTUAL TABLE IF NOT EXISTS workspace_event_search USING fts5(label,text,content='workspace_events',content_rowid='seq');
    CREATE TRIGGER IF NOT EXISTS workspace_event_insert AFTER INSERT ON workspace_events BEGIN INSERT INTO workspace_event_search(rowid,label,text) VALUES(new.seq,new.label,new.text); END;
    PRAGMA user_version=1;`);
  const prepare=sql=>db.prepare(sql);
  const ensure=prepare('INSERT OR IGNORE INTO workspace_accounts(account) VALUES(?)');
  const info=prepare('SELECT revision,event_count AS eventCount,last_event AS historyRevision FROM workspace_accounts WHERE account=?');
  const add=prepare('INSERT OR IGNORE INTO workspace_events(account,id,time,type,action,label,device,payload,text) VALUES(?,?,?,?,?,?,?,?,?)');
  const eventById=prepare('SELECT seq,id,time,type,action,label,device,payload,text FROM workspace_events WHERE account=? AND id=?');
  const bumpEvent=prepare('UPDATE workspace_accounts SET event_count=event_count+1,last_event=? WHERE account=?');
  const bump=prepare('UPDATE workspace_accounts SET revision=revision+1 WHERE account=?');
  const set=prepare('INSERT INTO workspace_values(account,key,value,revision) VALUES(?,?,?,?) ON CONFLICT(account,key) DO UPDATE SET value=excluded.value,revision=excluded.revision');
  const values=prepare('SELECT key,value,revision FROM workspace_values WHERE account=? AND revision>? ORDER BY revision,key');
  const current=prepare('SELECT value,revision FROM workspace_values WHERE account=? AND key=?');
  function account(value){if(closed)throw Error('Account storage is closed.');if(typeof value!=='string'||!/^[a-zA-Z0-9:_-]{1,160}$/.test(value))throw Error('Invalid account.');return value;}
  function transaction(work){db.exec('BEGIN IMMEDIATE');try{const result=work();db.exec('COMMIT');return result;}catch(error){db.exec('ROLLBACK');throw error;}}
  function metadata(scope){return info.get(account(scope))||{revision:0,eventCount:0,historyRevision:0};}
  function normalise(scope,event){
    account(scope);if(!event||typeof event!=='object')throw Error('Invalid activity.');
    const id=event.id||crypto.randomUUID(),type=event.type||'activity',action=event.action||'activity.recorded',label=event.label||action,device=event.device||'Elleson Connect',text=event.text||'',payload=JSON.stringify(event.payload||{});
    if(typeof id!=='string'||id.length>180||!id||typeof type!=='string'||!/^[a-z0-9-]{1,40}$/.test(type)||typeof action!=='string'||!/^[a-z0-9.-]{1,80}$/.test(action)||typeof label!=='string'||label.length>500||typeof device!=='string'||device.length>160||typeof text!=='string'||text.length>250000||Buffer.byteLength(payload)>32768)throw Error('Invalid activity data.');
    const time=Number.isSafeInteger(event.time)&&event.time>=0&&event.time<=now()+300000?event.time:now();return{id,type,action,label,device,text,payload,time};
  }
  function notify(scope){for(const listener of listeners)try{listener(scope,metadata(scope));}catch{}}
  function recordMany(scope,events){account(scope);if(!Array.isArray(events)||events.length>100)throw Error('Invalid activity batch.');const entries=events.map(event=>normalise(scope,event));const result=transaction(()=>{ensure.run(scope);return entries.map(({id,type,action,label,device,payload,text,time})=>{const result=add.run(scope,id,time,type,action,label,device,payload,text);if(result.changes)bumpEvent.run(Number(result.lastInsertRowid),scope);return{...decode(eventById.get(scope,id),true),duplicate:!result.changes};});});if(result.some(event=>!event.duplicate))notify(scope);return result;}
  function record(scope,event){return recordMany(scope,[event])[0];}
  function decode(row,full=false){if(!row)return null;return{id:row.id,sequence:row.seq,time:row.time,type:row.type,action:row.action,label:row.label,device:row.device,payload:JSON.parse(row.payload),...(full?{text:row.text}:{preview:row.preview,textLength:row.textLength})};}
  function list(scope,{before,type,device,query='',limit=50}={}){
    account(scope);const count=Number.isSafeInteger(limit)?Math.max(1,Math.min(100,limit)):50,parameters=[scope],where=['e.account=?'];
    if(Number.isSafeInteger(before)&&before>0){where.push('e.seq<?');parameters.push(before);}
    if(typeof type==='string'&&type){where.push('e.type=?');parameters.push(type);}
    if(typeof device==='string'&&device){where.push('e.device=?');parameters.push(device);}
    if(typeof query!=='string'||query.length>300)throw Error('Use a shorter history search.');
    const words=(query.match(/[\p{L}\p{N}_]+/gu)||[]).slice(0,12);if(query.trim()&&!words.length)return{...metadata(scope),events:[],next:null};
    if(words.length){where.push('e.seq IN (SELECT rowid FROM workspace_event_search WHERE workspace_event_search MATCH ?)');parameters.push(words.map(word=>'"'+word.replaceAll('"','""')+'"*').join(' AND '));}
    const rows=prepare('SELECT e.seq,e.id,e.time,e.type,e.action,e.label,e.device,e.payload,substr(e.text,1,240) AS preview,length(e.text) AS textLength FROM workspace_events e WHERE '+where.join(' AND ')+' ORDER BY e.seq DESC LIMIT ?').all(...parameters,count+1);const hasMore=rows.length>count;rows.length=Math.min(rows.length,count);
    return{...metadata(scope),events:rows.map(row=>decode(row)),next:hasMore?rows.at(-1).seq:null};
  }
  function read(scope,{after=0}={}){account(scope);const meta=metadata(scope),result={};for(const row of values.all(scope,Number.isSafeInteger(after)&&after>=0?after:0))result[row.key]={value:JSON.parse(row.value),revision:row.revision};return{...meta,values:result};}
  function patch(scope,changes,{expected}={}){
    account(scope);if(!changes||typeof changes!=='object'||Array.isArray(changes)||Object.keys(changes).length>60)throw Error('Invalid workspace changes.');
    const entries=[];for(const [key,value]of Object.entries(changes)){if(['__proto__','constructor','prototype'].includes(key)||!/^[a-zA-Z0-9_.:-]{1,100}$/.test(key))throw Error('Invalid workspace key.');const encoded=JSON.stringify(value);if(typeof encoded!=='string'||Buffer.byteLength(encoded)>256*1024)throw Error('Workspace item is too large.');entries.push([key,encoded]);}
    const before=metadata(scope);const result=transaction(()=>{ensure.run(scope);const changed=entries.filter(([key,value])=>current.get(scope,key)?.value!==value);const conflicts={};for(const [key]of changed){const row=current.get(scope,key);if(expected&&Object.hasOwn(expected,key)&&expected[key]!==Number(row?.revision||0))conflicts[key]=row?{value:JSON.parse(row.value),revision:row.revision}:{value:null,revision:0};}if(Object.keys(conflicts).length)throw Object.assign(Error('Workspace changed on another device.'),{status:409,conflicts});if(changed.length){bump.run(scope);const revision=metadata(scope).revision;for(const [key,value]of changed)set.run(scope,key,value,revision);}return metadata(scope);});if(result.revision!==before.revision)notify(scope);return result;
  }
  return{record,recordMany,list,read,patch,metadata,subscribe(listener){listeners.add(listener);return()=>listeners.delete(listener);},readKey:(scope,key)=>{const row=current.get(account(scope),key);return row?{value:JSON.parse(row.value),revision:row.revision}:{value:null,revision:0};},get:(scope,id)=>decode(eventById.get(account(scope),id),true),getValue:(scope,key)=>{const row=current.get(account(scope),key);return row?JSON.parse(row.value):undefined;},close(){if(closed)return;closed=true;listeners.clear();db.close();}};
}
module.exports={createAccountWorkspace};
