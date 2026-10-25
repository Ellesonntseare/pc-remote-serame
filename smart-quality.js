'use strict';

// Scale affects encoded frames only. Pointer commands keep their original PC
// coordinates; the transport and renderer continue to map against native size.
const NATIVE=Object.freeze({scale:1,fps:24,quality:85});
const MOTION=Object.freeze({scale:0.8,fps:24,quality:76});
const PRESSURE=Object.freeze([
  NATIVE,
  Object.freeze({scale:0.65,fps:20,quality:70}),
  Object.freeze({scale:0.5,fps:16,quality:62}),
  Object.freeze({scale:0.4,fps:10,quality:54})
]);
const SCALE_COOLDOWN=1200,MOTION_IDLE=700;

function createSmartQuality({now=Date.now}={}){
  const clock=typeof now==='function'?now:Date.now;
  let current,emitted,tier,lastScaleChange,lastTierChange,latestTime,maxScale=1;
  let slowSamples,fastSamples,motionSamples,motionUntil,lastAbsolute;

  function reset(){
    current={...NATIVE};emitted=false;tier=0;maxScale=1;
    lastScaleChange=-Infinity;lastTierChange=-Infinity;latestTime=-Infinity;
    slowSamples=[];fastSamples=[];motionSamples=[];motionUntil=-Infinity;lastAbsolute=null;
    return snapshot();
  }
  function time(value){
    const candidate=Number.isFinite(value)?value:clock();
    // A clock adjustment must not reverse a cooldown or revive an old gesture.
    if(Number.isFinite(candidate))latestTime=Math.max(latestTime,candidate);
    else if(!Number.isFinite(latestTime))latestTime=0;
    return latestTime;
  }
  function record(samples,at,window){
    while(samples.length&&at-samples[0]>window)samples.shift();
    if(samples.at(-1)!==at)samples.push(at);
  }
  function input(commands){
    const list=Array.isArray(commands)?commands:typeof commands==='string'?[commands]:[];
    let moved=false;
    for(const command of list){
      if(typeof command!=='string')continue;
      const [kind,a,b,...extra]=command.trim().split(/\s+/),x=Number(a),y=Number(b);
      if(extra.length)continue;
      if(kind==='mv'&&Number.isFinite(x)&&Number.isFinite(y))moved=moved||x!==0||y!==0;
      else if(kind==='abs'&&Number.isFinite(x)&&Number.isFinite(y)){
        if(lastAbsolute&&(lastAbsolute.x!==x||lastAbsolute.y!==y))moved=true;
        lastAbsolute={x,y};
      }else if((kind==='wheel'||kind==='hwheel')&&b===undefined&&Number.isFinite(x)&&x!==0)moved=true;
    }
    if(!moved)return;
    const at=time();record(motionSamples,at,300);
    const sustained=motionSamples.length>=3&&at-motionSamples[0]>=100;
    if(at<motionUntil||sustained)motionUntil=at+MOTION_IDLE;
  }
  function sample(value={}){
    if(!value||typeof value!=='object')return;
    const delivery=Number.isFinite(value.deliveryMs)&&value.deliveryMs>=0?value.deliveryMs:null;
    const decode=Number.isFinite(value.decodeMs)&&value.decodeMs>=0?value.decodeMs:null;
    if(delivery===null&&decode===null)return;
    const at=time(value.now),latency=Math.max(delivery??0,decode??0);
    if(latency>300){
      fastSamples=[];record(slowSamples,at,2000);
      if(tier<PRESSURE.length-1&&slowSamples.length>=3&&at-slowSamples[0]>=400&&at-lastTierChange>=SCALE_COOLDOWN){
        tier++;lastTierChange=at;slowSamples=[];fastSamples=[];
      }
    }else if(latency<140){
      slowSamples=[];record(fastSamples,at,4000);
      if(tier>0&&fastSamples.length>=5&&at-fastSamples[0]>=1000&&at-lastTierChange>=SCALE_COOLDOWN){
        tier--;lastTierChange=at;slowSamples=[];fastSamples=[];
      }
    }else{
      // A separate recovery threshold keeps a borderline link from repeatedly
      // changing dimensions as individual frames get a little faster or slower.
      slowSamples=[];fastSamples=[];
    }
  }
  function tick(){
    const at=time();
    // Evidence collected during the cooldown can take effect at its end, but
    // never carry an old connection stall into a later healthy period.
    slowSamples=slowSamples.filter(t=>at-t<=2000);fastSamples=fastSamples.filter(t=>at-t<=4000);
    if(at-lastTierChange>=SCALE_COOLDOWN){
      if(tier<PRESSURE.length-1&&slowSamples.length>=3&&slowSamples.at(-1)-slowSamples[0]>=400){tier++;lastTierChange=at;slowSamples=[];fastSamples=[];}
      else if(tier>0&&fastSamples.length>=5&&fastSamples.at(-1)-fastSamples[0]>=1000){tier--;lastTierChange=at;slowSamples=[];fastSamples=[];}
    }
    const profile=tier?PRESSURE[tier]:at<motionUntil?MOTION:NATIVE;
    const desired={...profile,scale:Math.max(.25,Math.round(profile.scale*maxScale*100)/100)};
    if(current.scale!==desired.scale&&at-lastScaleChange<SCALE_COOLDOWN)return null;
    if(emitted&&current.scale===desired.scale&&current.fps===desired.fps&&current.quality===desired.quality)return null;
    if(current.scale!==desired.scale)lastScaleChange=at;
    current={...desired};emitted=true;return snapshot();
  }
  function snapshot(){return {...current};}
  function limitScale(value){if(Number.isFinite(value))maxScale=Math.max(.25,Math.min(1,value));}
  reset();
  return {reset,input,sample,tick,snapshot,limitScale};
}

module.exports={createSmartQuality};
