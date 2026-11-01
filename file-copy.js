'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),{constants}=require('node:fs');
// The caller resolves source/destination through its existing location guard.
// Preflight the entire batch before creating any output; never follow links or
// overwrite an existing PC item. Copies contain independent bytes, not hardlinks.
async function copyPlans(plans,{maxBytes,maxEntries=2000}={}){
 let count=0,bytes=0;const snapshots=[];
 async function scan(source,out,depth){
  if(depth>12||++count>maxEntries)throw Object.assign(Error('Copy up to 2,000 items and twelve folder levels at a time.'),{status:400});
  const stat=await fs.lstat(source);if(stat.isSymbolicLink()||!stat.isFile()&&!stat.isDirectory())throw Object.assign(Error('Folder links and special files cannot be copied.'),{status:400});
  bytes+=stat.isFile()?stat.size:0;if(bytes>maxBytes)throw Object.assign(Error('This copy exceeds the PC file size limit. Choose fewer items.'),{status:413});
  const item={source,out,stat,children:[]};if(stat.isDirectory())for(const name of await fs.readdir(source)){if(/^\.pcr-/i.test(name))continue;item.children.push(await scan(path.join(source,name),path.join(out,name),depth+1));}return item;
 }
 for(const plan of plans)snapshots.push(await scan(plan.source,plan.out,plan.next.split('/').length));
 async function write(item){
  const now=await fs.lstat(item.source);if(now.isSymbolicLink()||now.ino!==item.stat.ino||now.dev!==item.stat.dev||now.size!==item.stat.size||now.mtimeMs!==item.stat.mtimeMs)throw Error('The source changed during copying. Refresh the folder.');
  if(now.isDirectory()){await fs.mkdir(item.out);for(const child of item.children)await write(child);}
  else await fs.copyFile(item.source,item.out,constants.COPYFILE_EXCL);
 }
 const copied=[];for(let i=0;i<snapshots.length;i++){try{await write(snapshots[i]);copied.push(plans[i].next);}catch(error){throw Object.assign(Error('Copied '+copied.length+' item(s). '+(error.code==='EEXIST'?'An item already exists at the destination.':'Copy stopped; a new destination folder may contain a partial copy. The source files are unchanged.')),{status:error.code==='EEXIST'?409:400});}}
 return copied;
}
module.exports={copyPlans};
