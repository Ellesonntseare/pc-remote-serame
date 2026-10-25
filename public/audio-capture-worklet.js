// Audio-only sender. Twenty-millisecond PCM blocks keep latency and memory bounded.
class PhoneAudioCapture extends AudioWorkletProcessor{
  constructor(){super();this.data=new Int16Array(Math.round(sampleRate*.02));this.at=0;this.energy=0;this.credit=true;this.port.onmessage=event=>{if(event.data?.type==='credit')this.credit=true;};}
  process(inputs){const channels=inputs[0];if(!channels?.length)return true;for(let i=0;i<channels[0].length;i++){let value=0;for(const channel of channels)value+=channel[i]||0;value=Math.max(-1,Math.min(1,value/channels.length));this.energy+=value*value;this.data[this.at++]=Math.round(value<0?value*32768:value*32767);if(this.at===this.data.length){if(this.credit){this.credit=false;const buffer=this.data.buffer;this.port.postMessage({buffer,level:Math.sqrt(this.energy/this.at)},[buffer]);this.data=new Int16Array(Math.round(sampleRate*.02));}this.at=0;this.energy=0;}}return true;}
}
registerProcessor('phone-audio-capture',PhoneAudioCapture);
