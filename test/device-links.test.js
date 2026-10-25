'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createDeviceLinks,webLink}=require('../device-links');
function fixture(){let now=100000,clipboard='https://example.com/from-pc';const opened=[],links=createDeviceLinks({now:()=>now,openLink:async url=>opened.push(url),readClipboard:async()=>clipboard});
  async function call(pathname,{method='GET',body={},token='owner-a',role='owner',guestId='',accountContext='account-A',canClipboard=true,header='1'}={}){let response;await links.handle({method,headers:{'x-pcr':header}},{},{pathname,token,role,guestId,accountContext,canClipboard,readJson:async()=>body,respond:(res,status,data)=>{response={status,...data};}});return response;}
  return {links,opened,call,advance:milliseconds=>now+=milliseconds,setClipboard:value=>clipboard=value};
}
test('web links allow only bounded http and https URLs without credentials or control characters',()=>{
  assert.equal(webLink('example.com/page'),'https://example.com/page');assert.equal(webLink(' https://example.com/path?q=1 '),'https://example.com/path?q=1');
  for(const value of ['',null,'javascript:alert(1)','file:///C:/secret','data:text/html,hello','ftp://example.com/file','https://user:secret@example.com','https://example.com/\nsecret','https://example.com/ tab','x'.repeat(4097)])assert.throws(()=>webLink(value),{status:400});
});
test('owner devices share an expiring inbox while guests only see their own submitted links',async()=>{
  const f=fixture();const owner=await f.call('/api/links',{method:'POST',body:{url:'example.com/owner',target:'device'}});assert.equal(owner.status,200);
  const guestA={token:'guest-a',role:'guest',guestId:'guest-A'},guestB={token:'guest-b',role:'guest',guestId:'guest-B'};
  const submitted=await f.call('/api/links',{...guestA,method:'POST',body:{url:'example.com/guest',target:'pc'}});assert.equal(submitted.status,200);
  assert.equal((await f.call('/api/links',{token:'owner-b'})).links.length,2);assert.deepEqual((await f.call('/api/links',guestA)).links.map(link=>link.id),[submitted.link.id]);assert.equal((await f.call('/api/links',guestB)).links.length,0);
  assert.equal((await f.call('/api/links',{accountContext:'other-account'})).links.length,0);
  assert.equal((await f.call('/api/links/'+owner.link.id,{...guestA,method:'DELETE'})).status,404);
  f.links.revoke('guest-a');assert.equal((await f.call('/api/links')).links.length,1);f.advance(3600001);assert.equal((await f.call('/api/links')).links.length,0);f.links.close();
});
test('PC opening requires an explicit owner request and validates links before native execution',async()=>{
  const f=fixture();await f.call('/api/links',{method:'POST',body:{url:'example.com',target:'pc'}});assert.deepEqual(f.opened,[],'sending a link never opens it automatically');
  assert.equal((await f.call('/api/links/open',{method:'POST',body:{url:'https://example.com'},role:'guest',token:'guest',guestId:'g'})).status,403);assert.deepEqual(f.opened,[]);
  assert.equal((await f.call('/api/links/open',{method:'POST',body:{url:'file:///C:/secret'}})).status,400);assert.deepEqual(f.opened,[]);
  assert.equal((await f.call('/api/links/open',{method:'POST',body:{url:'example.com/open'}})).status,200);assert.deepEqual(f.opened,['https://example.com/open']);
  assert.equal((await f.call('/api/links/clipboard')).url,'https://example.com/from-pc');f.setClipboard('Some text that is not a link');assert.equal((await f.call('/api/links/clipboard')).status,400);
});
test('link actions enforce authentication, clipboard approval, request headers and inbox bounds',async()=>{
  const f=fixture();for(const options of [{token:''},{canClipboard:false},{header:'0'}])assert.equal((await f.call('/api/links',options)).status,options.token===''?401:403);
  for(let index=0;index<60;index++)await f.call('/api/links',{method:'POST',body:{url:'https://example.com/'+index}});assert.equal((await f.call('/api/links')).links.length,50);
  await f.call('/api/links',{method:'POST',body:{url:'https://example.com/59'}});assert.equal((await f.call('/api/links')).links.length,50);f.links.close();assert.equal((await f.call('/api/links')).links.length,0);
});
