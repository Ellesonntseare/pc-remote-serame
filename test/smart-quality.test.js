'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createSmartQuality}=require('../smart-quality');

const native={scale:1,fps:24,quality:85};
const moving={scale:.8,fps:24,quality:76};
const constrained={scale:.65,fps:20,quality:70};
const weak={scale:.5,fps:16,quality:62};
const bad={scale:.4,fps:10,quality:54};

function harness(){
  let time=10000;
  const smart=createSmartQuality({now:()=>time});
  return {smart,advance(ms){time+=ms;},sample(deliveryMs,decodeMs){smart.sample({deliveryMs,decodeMs});return smart.tick();},
    input(commands){smart.input(commands);return smart.tick();}};
}

function begin(c){assert.deepEqual(c.smart.tick(),native);assert.equal(c.smart.tick(),null);}
function slowTier(c,expected,interval=400){
  const transitions=[];
  for(let i=0;i<3;i++){c.advance(interval);const config=c.sample(450);if(config)transitions.push(config);}
  assert.deepEqual(transitions,[expected]);
}
function fastTier(c,expected){
  const transitions=[];
  for(let i=0;i<5;i++){c.advance(260);const config=c.sample(80,100);if(config)transitions.push(config);}
  assert.deepEqual(transitions,[expected]);
}

test('native quality starts immediately and tick emits only changed settings',()=>{
  const c=harness();begin(c);
  for(let i=0;i<6;i++){c.advance(250);assert.equal(c.sample(80,100),null);}
});

test('snapshots and emitted settings are independent copies of the applied configuration',()=>{
  const c=harness();const initial=c.smart.snapshot();assert.deepEqual(initial,native);initial.scale=.1;
  assert.deepEqual(c.smart.snapshot(),native);begin(c);
  c.smart.sample({deliveryMs:500});c.advance(200);c.smart.sample({deliveryMs:500});c.advance(200);c.smart.sample({deliveryMs:500});
  assert.deepEqual(c.smart.snapshot(),native,'pending evidence does not change the applied settings');
  const changed=c.smart.tick();assert.deepEqual(changed,constrained);changed.fps=1;
  assert.deepEqual(c.smart.snapshot(),constrained,'consumers cannot mutate the active settings through a returned config');
});

test('one delivery spike and alternating spikes never reduce screen quality',()=>{
  const c=harness();begin(c);
  assert.equal(c.sample(900),null);c.advance(1000);assert.equal(c.smart.tick(),null);
  for(let i=0;i<12;i++){c.advance(250);assert.equal(c.sample(i%3===0?700:90),null);}
});

test('sustained slow delivery lowers quality in bounded tiers and fast delivery recovers one tier at a time',()=>{
  const c=harness();begin(c);
  slowTier(c,constrained);slowTier(c,weak);slowTier(c,bad);
  c.advance(1400);assert.equal(c.sample(700),null,'bad is the lowest supported tier');
  fastTier(c,weak);fastTier(c,constrained);fastTier(c,native);
  c.advance(1400);assert.equal(c.sample(80),null,'healthy samples cannot increase quality beyond native');
});

test('slow frame decoding can trigger pressure even when network delivery is fast',()=>{
  const c=harness();begin(c);
  assert.equal(c.sample(70,500),null);c.advance(200);assert.equal(c.sample(80,550),null);
  c.advance(200);assert.deepEqual(c.sample(60,450),constrained);
  assert.equal(c.smart.tick(),null);
});

test('slow samples must span enough time and scale changes respect the cooldown',()=>{
  const c=harness();begin(c);
  assert.equal(c.sample(500),null);c.advance(50);assert.equal(c.sample(500),null);c.advance(50);assert.equal(c.sample(500),null);
  c.advance(300);assert.deepEqual(c.sample(500),constrained,'initial native config does not impose an artificial cooldown');
  c.advance(200);assert.equal(c.sample(500),null);c.advance(200);assert.equal(c.sample(500),null);c.advance(200);assert.equal(c.sample(500),null);
  c.advance(599);assert.equal(c.smart.tick(),null);
  c.advance(1);assert.deepEqual(c.smart.tick(),weak,'ongoing pressure applies once the minimum interval has elapsed');
});

test('duplicate timestamps, stale evidence and neutral samples cannot produce a pressure change',()=>{
  const c=harness();begin(c);
  for(let i=0;i<3;i++)assert.equal(c.sample(500),null);
  c.advance(2100);assert.equal(c.sample(500),null);c.advance(200);assert.equal(c.sample(500),null);
  c.advance(200);assert.equal(c.sample(200),null,'a neutral sample clears accumulated slow evidence');
  c.advance(200);assert.equal(c.sample(500),null);c.advance(200);assert.equal(c.sample(500),null);
  c.advance(200);assert.deepEqual(c.sample(500),constrained);
  for(let i=0;i<4;i++){c.advance(300);assert.equal(c.sample(100),null);}
  c.advance(300);assert.equal(c.sample(200),null,'a neutral sample also clears partial recovery evidence');
  c.advance(300);assert.equal(c.sample(100),null);
});

test('three movement calls across 100 ms enable motion quality and idle restores native after the scale cooldown',()=>{
  const c=harness();begin(c);
  assert.equal(c.input(['mv 12 -3']),null);c.advance(50);assert.equal(c.input(['mv 8 4']),null);
  c.advance(50);assert.deepEqual(c.input(['mv -2 8']),moving);
  c.advance(699);assert.equal(c.smart.tick(),null);
  c.advance(1);assert.equal(c.smart.tick(),null,'idle cannot change scale again before 1200 ms');
  c.advance(500);assert.deepEqual(c.smart.tick(),native);
  assert.equal(c.smart.tick(),null);
});

test('continued movement extends motion mode until 700 ms after the final input',()=>{
  const c=harness();begin(c);c.input(['mv 1 0']);c.advance(50);c.input(['mv 1 0']);c.advance(50);assert.deepEqual(c.input(['mv 1 0']),moving);
  for(let i=0;i<10;i++){c.advance(200);assert.equal(c.input(['mv 1 0']),null);}
  c.advance(699);assert.equal(c.smart.tick(),null);c.advance(1);assert.deepEqual(c.smart.tick(),native);
});

test('single batches, stationary absolute coordinates and nonmovement commands do not count as sustained motion',()=>{
  const c=harness();begin(c);
  assert.equal(c.input(['mv 10 0','mv 0 10','wheel 120']),null,'one input call is a single activity observation');
  c.advance(400);
  for(const commands of [['abs 500 600'],['abs 500 600'],['abs 500 600'],['mv 0 0','wheel 0'],['click l','key 13','abs NaN 6']]){
    c.advance(100);assert.equal(c.input(commands),null);
  }
  c.advance(2000);assert.equal(c.smart.tick(),null);
});

test('changing absolute positions and wheel scrolling count as movement without modifying commands',()=>{
  const c=harness();begin(c);
  const initial=Object.freeze(['abs 10 20']);assert.doesNotThrow(()=>c.smart.input(initial));
  const first=Object.freeze(['abs 11 20']);assert.equal(c.input(first),null);
  c.advance(50);const second=Object.freeze(['wheel -120']);assert.equal(c.input(second),null);
  c.advance(50);const third=Object.freeze(['abs 12 20']);assert.deepEqual(c.input(third),moving);
  assert.deepEqual(initial,['abs 10 20']);assert.deepEqual(first,['abs 11 20']);assert.deepEqual(second,['wheel -120']);assert.deepEqual(third,['abs 12 20']);
});

test('network pressure caps motion quality without producing extra setting changes',()=>{
  const c=harness();begin(c);slowTier(c,constrained);
  c.advance(50);assert.equal(c.input(['mv 5 0']),null);c.advance(50);assert.equal(c.input(['mv 8 0']),null);
  c.advance(50);assert.equal(c.input(['mv 6 0']),null);
  c.advance(1400);assert.equal(c.smart.tick(),null,'idle keeps the network cap while pressure has not recovered');
});

test('reset clears both connection pressure and movement history for a fresh native stream',()=>{
  const c=harness();begin(c);slowTier(c,constrained);slowTier(c,weak);
  c.input(['abs 10 20']);c.advance(50);c.input(['abs 20 20']);c.advance(50);c.input(['mv 3 0']);
  c.smart.reset();assert.deepEqual(c.smart.tick(),native);assert.equal(c.smart.tick(),null);
  c.advance(100);assert.equal(c.input(['mv 5 0']),null,'pre-reset movement cannot complete a new motion burst');
  assert.equal(c.sample(700),null,'pre-reset slow samples cannot carry pressure into the next stream');
});
