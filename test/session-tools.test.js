'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {packet,wake}=require('../wake-on-lan'),{createHandoffs}=require('../handoffs'),{createGuestRequests}=require('../guest-requests');
const {sessionExpiry}=require('../server');

test('live connection deadlines follow owner extensions and still expire or cancel at the final deadline',()=>{
  let now=0,until=100,expired=0,pending;const timers={now:()=>now,setTimer:(callback,delay)=>{pending={callback,delay};return pending;},clearTimer:timer=>{timer.cancelled=true;}};const stop=sessionExpiry(()=>until,()=>expired++,timers);assert.equal(pending.delay,100);until=300;now=100;pending.callback();assert.equal(expired,0);assert.equal(pending.delay,200);now=300;pending.callback();assert.equal(expired,1);stop();
  until=500;const cancel=sessionExpiry(()=>until,()=>expired++,timers);const timer=pending;cancel();now=500;timer.callback();assert.equal(timer.cancelled,true);assert.equal(expired,1);
});
test('wake packet repeats the adapter address sixteen times and cannot target arbitrary networks',async()=>{
  const data=packet('02:12:34:56:78:9A');assert.equal(data.length,102);assert.deepEqual(data.subarray(0,6),Buffer.alloc(6,255));for(let i=0;i<16;i++)assert.equal(data.subarray(6+i*6,12+i*6).toString('hex'),'02123456789a');
  for(const mac of ['anything','00:00:00:00:00:00','FF:FF:FF:FF:FF:FF'])assert.throws(()=>packet(mac));
  await assert.rejects(wake('02:12:34:56:78:9A','8.8.8.8',async()=>{}));let sent=false;await wake('02:12:34:56:78:9A','255.255.255.255',async(bytes,address,port)=>{sent=true;assert.equal(port,9);assert.equal(bytes.length,102);});assert.equal(sent,true);
});
test('handoff codes expire, can be used only once and never transfer authentication',()=>{
  let time=0;const transfers=createHandoffs({now:()=>time}),created=transfers.create('owner1');assert.match(created.code,/^[A-F0-9]{12}$/);assert.equal(transfers.claim(created.code,'owner1'),null);assert.equal(transfers.status(created.code,'other'),null);
  assert.deepEqual(transfers.claim(created.code,'owner2'),{mode:'remote-screen'});assert.equal(transfers.claim(created.code,'owner3'),null);assert.equal(transfers.status(created.code,'owner1').claimed,true);time=120001;assert.equal(transfers.status(created.code,'owner1'),null);
});
test('guest duration is validated before approval and stays bound to the owner decision',()=>{
  const requests=createGuestRequests(),pending=requests.begin({ip:'local',device:'Phone'});assert.throws(()=>requests.decide(pending.id,true,{screen:true},999));assert.equal(requests.find(pending.secret,'local').state,'pending');assert.equal(requests.decide(pending.id,true,{screen:true},15),true);assert.equal(requests.consume(pending.secret,'local').durationMinutes,15);
});
