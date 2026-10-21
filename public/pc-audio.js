(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else{root.PCRAudio=api;if(typeof document!=='undefined'){if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>api.mount());else api.mount();}}})(globalThis,function(){
  'use strict';
  function validFormat(value){return value&&value.type==='format'&&value.encoding==='f32le'&&value.source==='system-output'&&Number.isInteger(value.sampleRate)&&value.sampleRate>=8000&&value.sampleRate<=192000&&[1,2].includes(value.channels);}
  class PcAudioPlayer{
    constructor({AudioContextImpl=globalThis.AudioContext||globalThis.webkitAudioContext,WebSocketImpl=globalThis.WebSocket,onState=()=>{},location=globalThis.location}={}){this.AudioContextImpl=AudioContextImpl;this.WebSocketImpl=WebSocketImpl;this.onState=onState;this.location=location;this.epoch=0;this.volume=.8;this.muted=false;this.state='stopped';}
    status(state,message){this.state=state;this.onState({state,message,muted:this.muted,volume:this.volume});}
    async start(){
      this.stop();const epoch=++this.epoch;
      if(!this.AudioContextImpl||!this.WebSocketImpl){this.status('error','Audio playback is unavailable in this browser.');return;}
      let context;
      try{
        context=this.context=new this.AudioContextImpl({latencyHint:'interactive'});
        // Called directly by the Start click so mobile browsers accept playback.
        const resume=context.resume();this.status('connecting','Connecting to PC output…');await resume;
        if(epoch!==this.epoch){void context.close();return;}
        context.onstatechange=()=>{if(epoch===this.epoch&&context.state!=='running'){this.stop();this.status('stopped','Audio paused by this device. Tap Start to resume.');}};
        this.gain=context.createGain();this.setVolume(this.volume);this.gain.connect(context.destination);
        const socket=this.socket=new this.WebSocketImpl((this.location.protocol==='https:'?'wss:':'ws:')+'//'+this.location.host+'/api/audio');socket.binaryType='arraybuffer';
        let format=null,preparing=false,pending=[],pendingBytes=0;
        socket.onmessage=async event=>{
          if(epoch!==this.epoch)return;
          try{
            if(typeof event.data==='string'){
              const value=JSON.parse(event.data);
              if(value.type==='error')throw Error(value.error||'PC audio is unavailable.');
              if(format||!validFormat(value))throw Error('Unsupported PC audio format.');
              format=value;preparing=true;await this.prepare(format,epoch);if(epoch!==this.epoch)return;preparing=false;
              for(const block of pending)this.push(block);pending=[];pendingBytes=0;this.status('playing','Listening to PC output');
            }else{
              if(!format||!(event.data instanceof ArrayBuffer)||event.data.byteLength>192000||event.data.byteLength%(format.channels*4))throw Error('Invalid PC audio stream.');
              if(preparing){pending.push(event.data);pendingBytes+=event.data.byteLength;while(pendingBytes>format.sampleRate*format.channels*4*.35&&pending.length)pendingBytes-=pending.shift().byteLength;}
              else this.push(event.data);
            }
          }catch(error){if(epoch===this.epoch){this.stop();this.status('error',error.message||'PC audio stopped.');}}
        };
        socket.onerror=()=>{if(epoch===this.epoch){this.stop();this.status('error','PC audio could not connect. Check the connection, then tap Start.');}};
        socket.onclose=()=>{if(epoch===this.epoch){this.stop();this.status('stopped','PC audio disconnected. Tap Start to reconnect.');}};
        this.connectTimer=setTimeout(()=>{if(epoch===this.epoch&&this.state==='connecting'){this.stop();this.status('error','PC audio timed out. Check the PC output device.');}},12000);
      }catch(error){if(epoch===this.epoch){this.stop();this.status('error',error.message||'PC audio could not start.');}}
    }
    async prepare(format,epoch){
      const context=this.context;
      if(context.audioWorklet&&typeof globalThis.AudioWorkletNode==='function'){
        await context.audioWorklet.addModule('/audio-worklet.js');if(epoch!==this.epoch)return;
        this.node=new globalThis.AudioWorkletNode(context,'pc-remote-pcm',{numberOfInputs:0,numberOfOutputs:1,outputChannelCount:[format.channels],processorOptions:format});
      }else{
        if(!globalThis.PCRAudioBuffer?.PcmPlaybackBuffer)throw Error('Audio playback could not initialize. Reload this page.');
        this.queue=new globalThis.PCRAudioBuffer.PcmPlaybackBuffer({...format,outputRate:context.sampleRate});
        this.node=context.createScriptProcessor(1024,0,format.channels);
        this.node.onaudioprocess=event=>this.queue?.render(Array.from({length:event.outputBuffer.numberOfChannels},(_,i)=>event.outputBuffer.getChannelData(i)));
      }
      this.node.connect(this.gain);clearTimeout(this.connectTimer);
    }
    push(buffer){if(this.node?.port)this.node.port.postMessage(buffer,[buffer]);else this.queue?.push(buffer);}
    setVolume(value){this.volume=Math.min(1,Math.max(0,Number(value)||0));if(this.gain)this.gain.gain.value=this.muted?0:this.volume;}
    setMuted(value){this.muted=!!value;this.setVolume(this.volume);this.onState({state:this.state,muted:this.muted,volume:this.volume});}
    stop(){
      ++this.epoch;clearTimeout(this.connectTimer);
      if(this.socket){this.socket.onmessage=this.socket.onerror=this.socket.onclose=null;try{this.socket.close();}catch{}this.socket=null;}
      if(this.node){this.node.onaudioprocess=null;try{this.node.port?.postMessage({type:'clear'});this.node.disconnect();}catch{}this.node=null;}
      this.queue?.clear();this.queue=null;this.gain?.disconnect();this.gain=null;
      if(this.context){this.context.onstatechange=null;try{void this.context.close().catch(()=>{});}catch{}this.context=null;}
      this.status('stopped','PC audio is off');
    }
  }
  function mount(){
    const bar=document.querySelector('.rsbot');if(!bar||document.getElementById('pcAudioButton'))return;
    const button=document.createElement('button');button.id='pcAudioButton';button.type='button';button.textContent='Audio';button.setAttribute('aria-pressed','false');
    const home=document.createElement('button');home.id='pcAudioHome';home.type='button';home.className='quick wide';home.innerHTML='PC audio<span>Listen to the PC’s output on this device</span>';document.querySelector('.heroactions')?.append(home);
    const dialog=document.createElement('dialog');dialog.id='pcAudioDialog';dialog.className='nativeDialog';dialog.setAttribute('aria-labelledby','pcAudioTitle');
    dialog.innerHTML='<div class="nativeDialogHead"><div><span class="nativeEyebrow">PC OUTPUT</span><h2 id="pcAudioTitle">Listen here</h2></div><button type="button" data-close aria-label="Close audio controls">×</button></div><p class="nativeDialogHint">Play the PC’s sound on this device.</p><div class="nativeAudioStatus" role="status" aria-live="polite">PC audio is off</div><label class="nativeVolume">Volume <input type="range" min="0" max="100" value="80" aria-label="Playback volume"></label><div class="nativeAudioActions"><button type="button" data-start class="nativePrimary">Start PC audio</button><button type="button" data-mute disabled>Mute</button><button type="button" data-stop disabled>Stop</button></div>';
    document.body.append(dialog);bar.append(button);
    const select=name=>dialog.querySelector('[data-'+name+']'),status=dialog.querySelector('.nativeAudioStatus');
    const player=new PcAudioPlayer({onState:state=>{
      if(state.message)status.textContent=state.message;const active=state.state==='connecting'||state.state==='playing';
      button.textContent=active?'Audio on':'Audio';button.setAttribute('aria-pressed',String(active));select('start').disabled=active;select('start').textContent=state.state==='error'?'Try again':'Start PC audio';select('stop').disabled=!active;select('mute').disabled=!active;select('mute').textContent=state.muted?'Unmute':'Mute';select('mute').setAttribute('aria-pressed',String(state.muted));
    }});
    button.addEventListener('click',()=>dialog.showModal());select('close').addEventListener('click',()=>dialog.close());dialog.addEventListener('click',event=>{if(event.target===dialog)dialog.close();});
    home.addEventListener('click',()=>dialog.showModal());
    select('start').addEventListener('click',()=>{void player.start();});select('stop').addEventListener('click',()=>player.stop());select('mute').addEventListener('click',()=>player.setMuted(!player.muted));dialog.querySelector('input').addEventListener('input',event=>player.setVolume(event.target.value/100));
    const screen=document.getElementById('rs');if(screen)new MutationObserver(()=>{if(screen.classList.contains('hide')){player.stop();dialog.close();}}).observe(screen,{attributes:true,attributeFilter:['class']});
    const gate=document.getElementById('pairGate');if(gate)new MutationObserver(()=>{if(!gate.classList.contains('hide')){player.stop();dialog.close();}}).observe(gate,{attributes:true,attributeFilter:['class']});
    document.addEventListener('visibilitychange',()=>{if(document.hidden)player.stop();});window.addEventListener('pagehide',()=>player.stop());
    globalThis.PCRAudio.player=player;
  }
  return {PcAudioPlayer,validFormat,mount};
});
