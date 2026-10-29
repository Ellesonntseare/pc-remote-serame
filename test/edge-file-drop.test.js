'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{createPhoneControl}=require('../phone-control');
test('only trusted native drops from the approved desktop session can queue files for its phone',async()=>{
 const sent=[],queued=[],controller={owner:true,publisher:false,watching:'phone'},phone={id:'phone',publisher:true,sharing:true,advancedInput:true,capture:{width:1080,height:1920},frame:Buffer.from('fixture')};phone.control={controller,id:'approved'};let native;
 const control=createPhoneControl({send:(peer,value)=>sent.push({peer,value}),peers:new Set([controller,phone]),sharing:id=>id==='phone'?phone:null,openHandoff:options=>{native=options;return {stop(){},update(){}};},onDesktopFiles:async(pc,target,files)=>{queued.push({pc,target,files});return files.length;}});
 control.handle(controller,{type:'desktop-start',side:'right',sensitivity:1,files:true});
 assert.equal(control.handle(controller,{type:'files',paths:['C:\\not-a-native-drop.txt']}),false);assert.equal(queued.length,0);
 native.onEvent({kind:'files',paths:['C:\\Photos\\Original name.png']});await new Promise(resolve=>setImmediate(resolve));assert.equal(queued.length,1);assert.equal(queued[0].target,phone);assert.equal(queued[0].files[0],'C:\\Photos\\Original name.png');assert.equal(sent.some(entry=>entry.value.type==='desktop-input'&&entry.value.event?.paths),false,'filesystem paths never come back through a browser control command');
 control.end(phone);native.onEvent({kind:'files',paths:['C:\\after-revoke.txt']});await new Promise(resolve=>setImmediate(resolve));assert.equal(queued.length,1,'ending control disables the old native drop callback');
});
