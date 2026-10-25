'use strict';
const crypto=require('node:crypto');
function problem(status,message){return Object.assign(Error(message),{status});}
function webLink(value){
  if(typeof value!=='string'||!value.trim()||value.length>4096||/[\x00-\x20\x7f]/.test(value.trim()))throw problem(400,'Enter one complete http or https link.');
  const raw=value.trim();let url;try{url=new URL(/^[a-z][a-z\d+.-]*:/i.test(raw)?raw:'https://'+raw);}catch{throw problem(400,'Enter a valid web link.');}
  if(!['https:','http:'].includes(url.protocol)||url.username||url.password||!url.hostname)throw problem(400,'Only http and https links without embedded sign-in details are supported.');
  return url.href;
}
function createDeviceLinks({openLink=async()=>{throw Error('PC link opening is unavailable. Restart the Windows host.');},readClipboard=async()=>{throw Error('PC clipboard is unavailable.');},now=Date.now}={}){
  const items=new Map(),expiry=60*60*1000;
  const digest=value=>crypto.createHash('sha256').update(value).digest('hex');
  function prune(){for(const [id,item]of items)if(item.until<=now())items.delete(id);}
  async function handle(req,res,{pathname,token,role='owner',guestId='',accountContext='',canClipboard=false,readJson,respond}){
    if(pathname!=='/api/links'&&!pathname.startsWith('/api/links/'))return false;
    try{
      if(!token)throw problem(401,'Sign in to share links.');
      if(!canClipboard)throw problem(403,'Clipboard and link sharing was not approved.');
      if(req.headers['x-pcr']!=='1')throw problem(403,'Request header missing.');
      prune();const scope=digest(accountContext||'owner'),author=digest(token),guest=role==='guest',identity=guest?'guest:'+String(guestId||author):'owner';
      const accessible=item=>item.scope===scope&&(!guest||item.identity===identity);
      const publicItem=item=>({id:item.id,url:item.url,target:item.target,from:item.identity==='owner'?'Your devices':'Guest device',created:item.created,until:item.until});
      if(req.method==='GET'&&pathname==='/api/links'){respond(res,200,{ok:true,links:[...items.values()].filter(accessible).sort((a,b)=>b.created-a.created).map(publicItem)});return true;}
      if(req.method==='GET'&&pathname==='/api/links/clipboard'){
        const url=webLink(await readClipboard());respond(res,200,{ok:true,url});return true;
      }
      if(req.method==='POST'&&pathname==='/api/links/open'){
        if(guest)throw problem(403,'Send the link to your host to open it on the PC.');
        const body=await readJson(req,8192),url=webLink(body.url);await openLink(url);respond(res,200,{ok:true,url});return true;
      }
      if(req.method==='POST'&&pathname==='/api/links'){
        const body=await readJson(req,8192),url=webLink(body.url),target=body.target||'device';
        if(!['device','pc'].includes(target))throw problem(400,'Choose a device or PC link destination.');
        const existing=[...items.values()].find(item=>item.scope===scope&&item.identity===identity&&item.url===url&&item.target===target);
        if(existing){existing.created=now();existing.until=now()+expiry;respond(res,200,{ok:true,link:publicItem(existing)});return true;}
        const own=[...items.values()].filter(item=>item.scope===scope&&item.identity===identity).sort((a,b)=>a.created-b.created);
        if(own.length>=50)items.delete(own[0].id);
        while(items.size>=500)items.delete(items.keys().next().value);
        const item={id:crypto.randomBytes(12).toString('hex'),scope,identity,author,url,target,created:now(),until:now()+expiry};items.set(item.id,item);respond(res,200,{ok:true,link:publicItem(item)});return true;
      }
      const match=/^\/api\/links\/([a-f0-9]{24})$/.exec(pathname);
      if(req.method==='DELETE'&&match){const item=items.get(match[1]);if(!item||!accessible(item))throw problem(404,'This link is no longer available.');items.delete(item.id);respond(res,200,{ok:true});return true;}
      throw problem(404,'Link action not found.');
    }catch(error){respond(res,error.status||503,{error:error.message||'Link sharing is unavailable.'});return true;}
  }
  function revoke(token){const author=crypto.createHash('sha256').update(String(token)).digest('hex');for(const [id,item]of items)if(item.author===author&&item.identity!=='owner')items.delete(id);}
  return {handle,revoke,close:()=>items.clear()};
}
module.exports={createDeviceLinks,webLink};
