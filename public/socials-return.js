'use strict';
// Provider redirect arrives without Strict cookies. Perform the authenticated
// exchange in a same-origin fetch after this public return document is loaded.
(() => {
 const providers=new Set(['facebook','instagram','youtube','google','linkedin','tiktok','pinterest','x','threads']);
 const provider=location.pathname.split('/').pop(),query=new URLSearchParams(location.search),status=document.getElementById('connectionStatus');
 const params=new URLSearchParams();for(const key of ['code','state','error'])if(query.has(key))params.set(key,query.get(key));
 history.replaceState(null,'',location.pathname);
 if(!providers.has(provider)){status.textContent='This account type is unavailable.';return;}
 fetch('/socials/api/social/'+provider+'/callback?'+params,{credentials:'same-origin',redirect:'follow',headers:{'X-PCR':'1'}}).then(async response=>{
  if(response.ok&&response.redirected){location.replace('/socials/#channels');return;}
  let message='The account could not be connected. Open Accounts and try again.';try{message=(await response.json()).error||message;}catch{}
  status.textContent=message;
 }).catch(()=>{status.textContent='The server could not be reached. Open Accounts and try again.';});
})();
