'use strict';
const crypto=require('node:crypto');
function accountScope(session,isMainOwner=()=>false){
  if(!session||session.role==='guest')return null;
  if(session.identity?.provider==='google'&&typeof session.identity.subject==='string'){
    if(isMainOwner(session.identity))return'owner';
    return'google:'+crypto.createHash('sha256').update(session.identity.subject).digest('hex');
  }
  return(session.role||'owner')==='owner'?'owner':null;
}
module.exports={accountScope};
