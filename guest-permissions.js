'use strict';
const KEYS=Object.freeze(['screen','control','clipboard','upload','download','apps','audio','status','power','media','voice','whiteboard']);
function guestPermissions(value){
  const source=value===undefined?{screen:true}:value;
  if(!source||Array.isArray(source)||typeof source!=='object'||Object.keys(source).some(key=>!KEYS.includes(key))||Object.values(source).some(value=>typeof value!=='boolean'))throw Error('Choose valid guest permissions.');
  const permissions=Object.fromEntries(KEYS.map(key=>[key,source[key]===true]));
  if(permissions.control)permissions.screen=true;
  if(permissions.apps){permissions.control=true;permissions.screen=true;}
  return permissions;
}
function can(session,key){return !!session&&(session.role!=='guest'||session.permissions?.[key]===true);}
module.exports={KEYS,guestPermissions,can};
