'use strict';
const crypto=require('node:crypto');
const TTL=5*60*1000,random=()=>crypto.randomBytes(32).toString('base64url'),hash=value=>crypto.createHash('sha256').update(value).digest('base64url');
const fault=(message,status=400)=>Object.assign(Error(message),{status});

function createGoogleSignIn(config={},dependencies={}){
  let origin='';try{const url=new URL(config.origin);if(url.protocol==='https:'&&!url.username&&!url.password&&url.pathname==='/'&&!url.search&&!url.hash)origin=url.origin;}catch{}
  const emails=new Set((Array.isArray(config.ownerEmails||config.allowedEmails)?config.ownerEmails||config.allowedEmails:[]).filter(v=>typeof v==='string'&&v.includes('@')).map(v=>v.trim().toLowerCase()));
  const enabled=!!(origin&&config.clientId&&config.clientSecret),transactions=new Map(),now=dependencies.now||Date.now;
  const redirectUri=origin+'/api/auth/google/callback';
  async function verify(code,verifier){
    if(dependencies.verify)return dependencies.verify(code,verifier);
    // Load Google's maintained verifier only when somebody actually signs in.
    const {OAuth2Client}=require('google-auth-library'),client=new OAuth2Client({clientId:config.clientId,clientSecret:config.clientSecret,redirectUri,transporterOptions:{timeout:10000}});
    const result=await client.getToken({code,codeVerifier:verifier,redirect_uri:redirectUri});
    if(!result.tokens.id_token)throw fault('Google did not return a sign-in token.');
    return (await client.verifyIdToken({idToken:result.tokens.id_token,audience:config.clientId})).getPayload();
  }
  function clean(){for(const [key,value]of transactions)if(value.until<=now())transactions.delete(key);}
  function get(id){clean();const entry=transactions.get(id);if(!entry)throw fault('This sign-in has expired. Start again.',410);return entry;}
  function available(){if(!enabled)throw fault('Google sign-in is not enabled for this PC yet. Use your password for now.',503);}
  function googleUrl(id,entry){const url=new URL('https://accounts.google.com/o/oauth2/v2/auth');url.search=new URLSearchParams({client_id:config.clientId,redirect_uri:redirectUri,response_type:'code',scope:'openid email',state:id,nonce:entry.nonce,code_challenge:hash(entry.verifier),code_challenge_method:'S256',prompt:'select_account'});return url.href;}
  return {
    enabled,origin,isAllowed:identity=>enabled&&identity?.provider==='google'&&typeof identity.email==='string'&&typeof identity.subject==='string'&&!!identity.subject,
    isOwner:identity=>enabled&&identity?.provider==='google'&&emails.has(identity.email),
    start({remember=false,device=false,ip}){
      available();clean();if(transactions.size>=128)throw fault('Too many sign-ins are pending. Try again shortly.',429);
      const id=random(),secret=random(),entry={until:now()+TTL,verifier:random(),nonce:random(),cookie:random(),remember,device,ip,started:false,status:'pending',secretHash:hash(secret)};transactions.set(id,entry);
      return {id,secret:device?secret:undefined,url:origin+'/api/auth/google/browser?ticket='+id,expires:entry.until};
    },
    browser(id){available();const entry=get(id);if(entry.started)throw fault('This sign-in link was already opened. Start again.',410);entry.started=true;return {url:googleUrl(id,entry),cookie:entry.cookie};},
    async callback({id,code,cookie,error}){
      available();const entry=get(id);if(!entry.started||entry.processing||entry.status!=='pending'||typeof cookie!=='string'||hash(cookie)!==hash(entry.cookie))throw fault('Sign-in could not be verified. Start again.',403);
      entry.processing=true;
      try{
        if(error)throw fault('Google sign-in was cancelled.');
        if(typeof code!=='string'||!code||code.length>4096)throw fault('Google did not return a valid sign-in code.');
        const claims=await verify(code,entry.verifier);
        if(entry.until<=now()||!claims||claims.nonce!==entry.nonce||claims.aud!==config.clientId||!Number.isFinite(claims.exp)||claims.exp*1000<=now()||!['accounts.google.com','https://accounts.google.com'].includes(claims.iss)||typeof claims.sub!=='string'||!claims.sub||claims.sub.length>256||claims.email_verified!==true||typeof claims.email!=='string'||claims.email.length>320||!claims.email.includes('@'))throw fault('Google could not verify this account.',403);
        entry.identity={provider:'google',subject:claims.sub,email:claims.email.toLowerCase()};entry.status='approved';
        if(entry.device)return {device:true};transactions.delete(id);return {identity:entry.identity,remember:entry.remember};
      }catch(error){entry.status='denied';throw fault(error.status?error.message:'Google could not verify this sign-in. Please try again.',error.status||502);}
      finally{entry.processing=false;}
    },
    poll({id,secret,ip}){available();const entry=get(id);if(!entry.device||entry.ip!==ip||typeof secret!=='string'||secret.length>128||hash(secret)!==entry.secretHash)throw fault('Invalid app sign-in request.',403);if(entry.status==='denied'){transactions.delete(id);throw fault('Google sign-in was cancelled or the account was not approved.',403);}if(entry.status!=='approved')return {pending:true};transactions.delete(id);return {identity:entry.identity,remember:entry.remember};},
    clear(){transactions.clear();}
  };
}
module.exports={createGoogleSignIn};
