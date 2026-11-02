'use strict';
const fs=require('node:fs');
const path=require('node:path');
const {pathToFileURL}=require('node:url');

function createSocialsIntegration({directory,dataDirectory}={}){
 let instance,pending,closed=false;
 const root=directory?path.resolve(directory):null;
 const available=()=>!!root&&fs.existsSync(path.join(root,'server','node-host.mjs'));
 async function open(){
  if(closed)throw Error('The project server has stopped.');
  if(!available())throw Error('Elleson Socials is not installed on this server.');
  if(!pending)pending=import(pathToFileURL(path.join(root,'server','node-host.mjs')).href).then(module=>{
   if(closed)throw Error('The project server has stopped.');
   instance=module.createSocialsHost({root,dataDir:dataDirectory,mount:'/socials'});return instance;
  }).catch(error=>{pending=null;throw error;});
  return pending;
 }
 async function handle(req,res,{pathname,session,scope,origin,respond}={}){
  if(pathname!=='/api/projects'&&pathname!=='/socials'&&!pathname.startsWith('/socials/'))return false;
  if(!scope||session?.role==='guest'){respond(res,403,{error:'Sign in with your account to open projects.'});return true;}
  if(pathname==='/api/projects'){
   if(req.method!=='GET'){respond(res,405,{error:'Use GET for projects.'});return true;}
   respond(res,200,{projects:[{id:'socials',name:'Elleson Socials',description:'Manage social posts',path:'/socials/',available:available(),repository:'https://github.com/Ellesonntseare/Elleson-Socials'}]});return true;
  }
  if(!available()){respond(res,503,{error:'Elleson Socials is not installed on this server.'});return true;}
  try{
   const app=await open();
   return await app.handle(req,res,{principal:{id:'connect:'+scope,email:session.identity?.email||session.account?.email||'owner@elleson.local',admin:session.role==='owner'&&scope==='owner'},origin});
  }catch(error){console.error('Socials host failed',error?.name);respond(res,503,{error:'Elleson Socials could not start. Check the project installation.'});return true;}
 }
 return {handle,close(){closed=true;instance?.close();}};
}
module.exports={createSocialsIntegration};
