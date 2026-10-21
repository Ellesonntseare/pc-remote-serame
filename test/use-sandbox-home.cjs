'use strict';
// Server fixtures must never initialize the user's real Downloads folder.
const os=require('node:os'),fs=require('node:fs'),path=require('node:path');
const parent=path.resolve(__dirname,'.test-runtime'),root=path.join(parent,String(process.pid));
os.homedir=()=>root;
process.on('exit',()=>{if(path.dirname(root)===parent&&/^\d+$/.test(path.basename(root)))fs.rmSync(root,{recursive:true,force:true});try{fs.rmdirSync(parent);}catch{}});
