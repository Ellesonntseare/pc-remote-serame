(function(){
  'use strict';
  function mount(){
    const form=document.getElementById('pairForm');if(!form||form.querySelector('[data-google-signin]'))return;
    const group=document.createElement('div');group.className='googleSignIn';group.innerHTML='<span>or continue with</span><button type="button" data-google-signin><svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M21.6 12.23c0-.71-.06-1.39-.18-2.05H12v3.88h5.38a4.6 4.6 0 0 1-2 3.02v2.51h3.24c1.89-1.74 2.98-4.3 2.98-7.36Z"/><path fill="#34A853" d="M12 22c2.7 0 4.96-.9 6.62-2.41l-3.24-2.51c-.9.6-2.04.96-3.38.96-2.6 0-4.8-1.76-5.59-4.12H3.07v2.59A10 10 0 0 0 12 22Z"/><path fill="#FBBC05" d="M6.41 13.92a6 6 0 0 1 0-3.84V7.49H3.07a10 10 0 0 0 0 9.02l3.34-2.59Z"/><path fill="#EA4335" d="M12 5.96c1.47 0 2.79.51 3.82 1.51l2.87-2.87A9.6 9.6 0 0 0 12 2a10 10 0 0 0-8.93 5.49l3.34 2.59A6 6 0 0 1 12 5.96Z"/></svg>Sign in with Google</button><p role="status" aria-live="polite"></p>';document.getElementById('pairSubmit').after(group);
    const style=document.createElement('style');style.textContent='.googleSignIn{margin:22px 0 8px;text-align:center}.googleSignIn>span{display:flex;align-items:center;gap:15px;color:#89abc4;font-size:11px;margin-bottom:17px}.googleSignIn>span:before,.googleSignIn>span:after{content:"";height:1px;background:#28485e;flex:1}.googleSignIn>button{display:flex;align-items:center;justify-content:center;gap:12px;width:100%;min-height:46px;padding:10px 16px;border:1px solid #747775;border-radius:7px;background:#fff;color:#1f1f1f;font:500 14px Arial,sans-serif;cursor:pointer}.googleSignIn>button:hover{background:#eaf0f9}.googleSignIn>button:focus-visible{outline:3px solid #52d5ff;outline-offset:3px}.googleSignIn>p{font-size:12px;line-height:1.6;color:#aacddd;margin:10px 0 0}.googleSignIn>p:empty{display:none}';document.head.append(style);
    const button=group.querySelector('button'),status=group.querySelector('p');let generation=0,timer=null;
    function reset(){generation++;clearTimeout(timer);button.disabled=false;}
    async function request(route,body){const response=await fetch('/api/auth/google/'+route,{method:'POST',headers:{'X-PCR':'1','Content-Type':'application/json'},body:JSON.stringify(body)}),data=await response.json();if(!response.ok)throw Error(data.error||'Google sign-in could not be completed.');return data;}
    async function poll(ticket,version){
      if(version!==generation)return;
      try{if(Date.now()>=ticket.expires)throw Error('Sign-in expired. Tap Google to try again.');const result=await request('poll',{id:ticket.id,secret:ticket.secret});if(version!==generation)return;if(result.pending){timer=setTimeout(()=>void poll(ticket,version),1500);return;}status.textContent='Signed in. Opening your workspace…';reset();window.init();}
      catch(error){if(version===generation){reset();status.textContent=error.message;}}
    }
    button.onclick=async()=>{
      reset();const version=generation;button.disabled=true;status.textContent='Opening Google sign-in…';
      try{const native=!!window.PCRAndroid?.postMessage,ticket=await request('start',{device:native,remember:!!document.getElementById('rememberMe')?.checked});if(version!==generation)return;
        if(native){window.PCRAndroid.postMessage(JSON.stringify({type:'open-link',url:ticket.url}));status.textContent='Finish signing in with Google in your browser, then return to this app.';void poll(ticket,version);}else location.assign(ticket.url);
      }catch(error){if(version===generation){reset();status.textContent=error.message;}}
    };
    window.addEventListener('pcr:auth',()=>{if(window.PCRAuth?.signedIn){reset();status.textContent='';}});window.addEventListener('pagehide',reset);
    const url=new URL(location.href);if(url.searchParams.get('google')==='failed'){status.textContent='Google sign-in was cancelled or the account was not approved for this PC.';url.searchParams.delete('google');history.replaceState(history.state,'',url.pathname+url.search+url.hash);}
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
})();
