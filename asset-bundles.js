'use strict';
const crypto=require('node:crypto'),{gzip}=require('node:zlib'),{promisify}=require('node:util');
const {acceptsGzip}=require('./asset-cache');const compress=promisify(gzip);
const types=new Map([['/client.js','text/javascript; charset=utf-8'],['/client-core.css','text/css; charset=utf-8'],['/client-ui.css','text/css; charset=utf-8']]);
function planPage(html,allowed){
  const headEnd=html.indexOf('</head>'),styleStart=html.indexOf('<style>'),groups=new Map([...types.keys()].map(key=>[key,[]])),seen=new Set();
  const page=html.replace(/<script\b[^>]*\bsrc="([^"]+)"[^>]*>\s*<\/script>|<link\b[^>]*>/gi,(tag,scriptUrl,offset)=>{
    if(offset>headEnd)return tag;const stylesheet=!scriptUrl&&/\brel="stylesheet"/i.test(tag),url=scriptUrl||stylesheet&&/\bhref="([^"]+)"/i.exec(tag)?.[1];
    if(!url||!allowed.has(url))return tag;const type=allowed.get(url)[1];if(scriptUrl&&!/^text\/javascript/.test(type)||stylesheet&&!/^text\/css/.test(type))return tag;
    const route=scriptUrl?'/client.js':offset<styleStart?'/client-core.css':'/client-ui.css';groups.get(route).push(url);if(seen.has(route))return '';seen.add(route);
    return scriptUrl?'<script src="'+route+'" defer></script>':'<link rel="stylesheet" href="'+route+'">';
  });
  return {page,groups};
}
function createAssetBundles({allowed,read}){
  let planned=null;const entries=new Map();
  const entry=body=>({body,etag:'"'+crypto.createHash('sha256').update(body).digest('base64url')+'"',compressed:null});
  async function plan(){const source=await read('/index.html');if(planned?.version===source.etag)return planned;planned={version:source.etag,...planPage(source.body.toString('utf8'),allowed),pageEntry:null};return planned;}
  async function encoded(value,encoding){if(!acceptsGzip(encoding))return {body:value.body,etag:value.etag};if(!value.compressed)value.compressed=compress(value.body,{level:6}).catch(error=>{value.compressed=null;throw error;});return {body:await value.compressed,etag:value.etag.slice(0,-1)+'-gzip"',encoding:'gzip'};}
  return {
    has:route=>types.has(route),type:route=>types.get(route),
    async page(encoding){const current=await plan();if(!current.pageEntry)current.pageEntry=entry(Buffer.from(current.page));return encoded(current.pageEntry,encoding);},
    async get(route,encoding){
      if(!types.has(route))throw Error('Unknown client bundle');const current=await plan(),urls=current.groups.get(route),sources=await Promise.all(urls.map(read)),version=current.version+'|'+sources.map(source=>source.etag).join('|');let value=entries.get(route);
      if(value?.version!==version){const chunks=[];for(let index=0;index<sources.length;index++){chunks.push(Buffer.from((route.endsWith('.js')?'\n;\n':'\n')+'/* '+urls[index]+' */\n'),sources[index].body);}value={version,...entry(Buffer.concat(chunks))};entries.set(route,value);}return encoded(value,encoding);
    },
    clear(){planned=null;entries.clear();}
  };
}
module.exports={planPage,createAssetBundles};
