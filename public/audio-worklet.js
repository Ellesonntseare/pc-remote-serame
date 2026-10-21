/* Shared bounded PCM queue: usable in an AudioWorklet, the HTTP fallback and tests. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.PCRAudioBuffer=api;})(globalThis,function(){
  'use strict';
  class PcmPlaybackBuffer{
    constructor({sampleRate=48000,channels=2,outputRate=48000,maxSeconds=.35,prebufferSeconds=.06}={}){
      if(!Number.isInteger(sampleRate)||sampleRate<8000||sampleRate>192000||![1,2].includes(channels)||!Number.isFinite(outputRate)||outputRate<8000||outputRate>192000)throw Error('Invalid audio format');
      this.sampleRate=sampleRate;this.channels=channels;this.outputRate=outputRate;
      this.capacity=Math.ceil(sampleRate*Math.min(.5,Math.max(.08,maxSeconds)));
      this.prebuffer=Math.min(this.capacity-2,Math.ceil(sampleRate*Math.max(.01,prebufferSeconds)));
      this.data=new Float32Array(this.capacity*channels);this.read=0;this.frames=0;this.position=0;this.ready=false;this.droppedFrames=0;
    }
    clear(){this.read=0;this.frames=0;this.position=0;this.ready=false;this.data.fill(0);}
    push(buffer){
      const samples=buffer instanceof Float32Array?buffer:new Float32Array(buffer);
      if(samples.length%this.channels||samples.length>this.sampleRate*this.channels)throw Error('Invalid audio block');
      let offset=0,incoming=samples.length/this.channels;
      if(incoming>=this.capacity){offset=(incoming-this.capacity)*this.channels;incoming=this.capacity;this.droppedFrames+=this.frames+offset/this.channels;this.frames=0;this.position=0;}
      const overflow=Math.max(0,this.frames+incoming-this.capacity);
      if(overflow){this.read=(this.read+overflow)%this.capacity;this.frames-=overflow;this.position=0;this.droppedFrames+=overflow;}
      for(let frame=0;frame<incoming;frame++)for(let ch=0;ch<this.channels;ch++){
        const value=samples[offset+frame*this.channels+ch];
        this.data[((this.read+this.frames+frame)%this.capacity)*this.channels+ch]=Number.isFinite(value)?Math.max(-1,Math.min(1,value)):0;
      }
      this.frames+=incoming;
    }
    render(outputs){
      for(const channel of outputs)channel.fill(0);
      if(!outputs.length)return;
      if(!this.ready){if(this.frames<this.prebuffer)return;this.ready=true;}
      const ratio=this.sampleRate/this.outputRate;
      for(let i=0;i<outputs[0].length;i++){
        if(this.frames<2){this.ready=false;this.position=0;return;}
        const first=this.read*this.channels,second=((this.read+1)%this.capacity)*this.channels;
        for(let ch=0;ch<outputs.length;ch++){
          const source=Math.min(ch,this.channels-1);
          outputs[ch][i]=this.data[first+source]*(1-this.position)+this.data[second+source]*this.position;
        }
        this.position+=ratio;const consume=Math.min(this.frames,Math.floor(this.position));
        this.read=(this.read+consume)%this.capacity;this.frames-=consume;this.position-=consume;
      }
    }
  }
  if(typeof AudioWorkletProcessor!=='undefined'&&typeof registerProcessor==='function'){
    class RemotePcmProcessor extends AudioWorkletProcessor{
      constructor(options){super();this.queue=new PcmPlaybackBuffer({...options.processorOptions,outputRate:sampleRate});this.port.onmessage=event=>{if(event.data?.type==='clear')this.queue.clear();else if(event.data instanceof ArrayBuffer)try{this.queue.push(event.data);}catch{this.queue.clear();}};}
      process(_inputs,outputs){if(outputs[0])this.queue.render(outputs[0]);return true;}
    }
    registerProcessor('pc-remote-pcm',RemotePcmProcessor);
  }
  return {PcmPlaybackBuffer};
});
