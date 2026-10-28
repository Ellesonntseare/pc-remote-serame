'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {InputQueue}=require('../public/phone-input');
test('live phone input preserves press/release and text order while replacing obsolete drag positions',()=>{
  let busy=true,ready=true;const sent=[],queue=new InputQueue({ready:()=>ready,busy:()=>busy,send:value=>{sent.push(value);busy=true;return true;}});
  queue.push({action:'touch-start',points:[{x:.1,y:.2}]});for(let i=0;i<100;i++)queue.push({action:'touch-move',points:[{x:i/100,y:.3}]});
  queue.push({action:'touch-end',points:[{x:1,y:.3}]});queue.push({action:'insert',text:'hello'});queue.push({action:'insert',text:' world'});
  assert.equal(queue.items.length,4);for(let i=0;i<4;i++){busy=false;queue.flush();}
  assert.deepEqual(sent.map(v=>v.action),['touch-start','touch-move','touch-end','insert']);assert.equal(sent[1].points[0].x,.99);assert.equal(sent[3].text,'hello world');
  ready=false;queue.push({action:'key',key:'Enter',modifiers:0});queue.clear();ready=true;busy=false;queue.flush();assert.equal(sent.length,4,'cleared input must never replay after reconnect');
});
test('phone input cancellation drops stale touches and queue overflow fails closed',()=>{
  let stopped=0;const queue=new InputQueue({ready:()=>true,busy:()=>true,send(){},overflow:()=>stopped++});
  queue.push({action:'touch-start'});queue.push({action:'touch-move'});queue.push({action:'touch-end'});queue.push({action:'touch-cancel'});assert.deepEqual(queue.items,[{action:'touch-cancel'}]);
  for(let i=0;i<129;i++)queue.push({action:'key',key:'Enter'});assert.equal(stopped,1);assert.ok(queue.items.length<128);
});
