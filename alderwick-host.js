'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),http=require('node:http'),crypto=require('node:crypto');
const {spawn}=require('node:child_process');
const root=process.env.ALDERWICK_ROOT||path.join(os.homedir(),'Desktop','Builts','Medieval-Town');
const pairing=path.join(root,'tools','phone-pairing.json');
let child;
function key(){try{return JSON.parse(fs.readFileSync(pairing,'utf8')).token;}catch{return null;}}
function available(){return fs.existsSync(path.join(root,'tools','phone_bridge.py'));}
function start(){if(child&&child.exitCode===null)return;
 child=spawn(path.join(root,'tools','speech','python','python.exe'),[path.join(root,'tools','phone_bridge.py')],{cwd:root,windowsHide:true,stdio:'ignore'});
 child.on('error',()=>{child=null;});
}
async function page(req,res,session,origin){
 if(session?.role!=='owner'){res.writeHead(403);return res.end('PC owner sign-in required.');}
 if(!available()){res.writeHead(503);return res.end('Alderwick is not installed on this PC.');}
 if(!key())start();
 for(let i=0;i<30&&!key();i++)await new Promise(resolve=>setTimeout(resolve,100));
 const token=key();res.writeHead(token?200:503,{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store','Referrer-Policy':'no-referrer'});
 res.end(token?'Alderwick conversations and voices\n\nCopy this private address into Connect to PC AI in Alderwick:\n\n'+origin+'/alderwick/token/'+token:'Could not start the Alderwick bridge.');
}
async function relay(req,res,pathname){
 const match=pathname.match(/^\/alderwick\/token\/([A-Za-z0-9_-]+)\/(ai|speech)\/(health|history|chat|social|speak|transcribe)$/);
 const token=key();
 if(!match||!token||match[1].length!==token.length||!crypto.timingSafeEqual(Buffer.from(match[1]),Buffer.from(token))){res.writeHead(403);return res.end();}
 const upstreamPath=req.url.slice('/alderwick'.length);
 const proxy=()=>new Promise(resolve=>{
 const upstream=http.request({host:'127.0.0.1',port:34322,path:upstreamPath,method:req.method,headers:{'content-type':req.headers['content-type']||'application/json','content-length':req.headers['content-length']||0},timeout:180000},reply=>{res.writeHead(reply.statusCode,{'Content-Type':reply.headers['content-type']||'application/json','Cache-Control':'no-store'});reply.pipe(res);resolve(true);});
 upstream.on('timeout',()=>upstream.destroy());upstream.on('error',()=>resolve(false));req.pipe(upstream);
 });
 // Start the bridge before forwarding a POST, so a cold start never consumes its body.
 const alive=()=>new Promise(resolve=>{const s=require('node:net').connect(34322,'127.0.0.1');s.once('connect',()=>{s.destroy();resolve(true);});s.once('error',()=>resolve(false));});
 if(!(await alive())){start();for(let i=0;i<30&&!(await alive());i++)await new Promise(r=>setTimeout(r,100));}
 if(!(await proxy())){if(!res.headersSent)res.writeHead(503);res.end();}
}
module.exports={available,page,relay};
