(function(){
  'use strict';let active=null,generation=0;
  const send=value=>window.PCRAndroid?.postMessage(JSON.stringify(value));
  function available(){return !!window.PCRNativeCapabilities?.localMedia&&!!window.PCRAndroid?.postMessage;}
  async function getUserMedia(options){
    active?.stop();const version=++generation;
    if(navigator.mediaDevices?.getUserMedia){
      try{
        const stream=await navigator.mediaDevices.getUserMedia(options);
        if(version!==generation){for(const track of stream.getTracks())track.stop();throw Error('Phone capture was stopped.');}
        const stop=()=>{for(const track of stream.getTracks())track.stop();if(active?.stop===stop)active=null;};active={stop};for(const track of stream.getTracks())track.addEventListener?.('ended',stop,{once:true});return stream;
      }catch(error){if(version!==generation||!available()||!['NotReadableError','AbortError'].includes(error.name))throw error;}
    }
    if(!available())return Promise.reject(Error('Camera and microphone need HTTPS in a browser. Use the updated Android app for local HTTP capture.'));
    active?.stop();const id=Date.now().toString(36)+'-'+Math.random().toString(36).slice(2),stream=new MediaStream(),canvas=document.createElement('canvas');canvas.width=640;canvas.height=480;let context=null,destination=null,nextAudio=0,closed=false,settled=false,timeout;
    if(options.video!==false){const picture=canvas.captureStream(12);for(const track of picture.getTracks())stream.addTrack(track);}
    if(options.audio!==false){const Audio=window.AudioContext||window.webkitAudioContext;context=new Audio({sampleRate:16000});void context.resume();destination=context.createMediaStreamDestination();for(const track of destination.stream.getTracks())stream.addTrack(track);}
    return new Promise((resolve,reject)=>{
      function stop(){if(closed)return;closed=true;clearTimeout(timeout);window.removeEventListener('pcr:native-media',event);send({type:'local-media-stop',id});for(const track of stream.getTracks())track.stop();void context?.close();if(active?.stop===stop)active=null;if(!settled){settled=true;reject(Error('Phone capture was stopped.'));}}
      function fail(text){if(!settled){settled=true;reject(Error(text));}stop();for(const track of stream.getTracks())track.dispatchEvent(new Event('ended'));}
      async function event(message){
        const value=message.detail;if(closed||value?.id!==id)return;
        if(value.kind==='started'){clearTimeout(timeout);if(!settled){settled=true;resolve(stream);}return;}
        if(value.kind==='error'){fail(value.message||'Could not open camera or microphone.');return;}
        if(value.kind==='stopped'){fail('Phone capture stopped.');return;}
        if(value.kind==='frame'){
          let bitmap;try{const bytes=Uint8Array.from(atob(value.data),c=>c.charCodeAt(0));bitmap=await createImageBitmap(new Blob([bytes],{type:'image/jpeg'}));if(closed)return;const rotated=value.rotation===90||value.rotation===270,width=rotated?bitmap.height:bitmap.width,height=rotated?bitmap.width:bitmap.height;if(canvas.width!==width||canvas.height!==height){canvas.width=width;canvas.height=height;}const drawing=canvas.getContext('2d');drawing.save();drawing.translate(width/2,height/2);drawing.rotate((value.rotation||0)*Math.PI/180);drawing.drawImage(bitmap,-bitmap.width/2,-bitmap.height/2);drawing.restore();}catch{}finally{bitmap?.close();if(!closed)send({type:'local-media-credit',kind:'frame',id});}return;
        }
        if(value.kind==='audio'){
          try{if(!context||!destination)return;const bytes=Uint8Array.from(atob(value.data),c=>c.charCodeAt(0)),input=new DataView(bytes.buffer),buffer=context.createBuffer(1,bytes.length/2,16000),samples=buffer.getChannelData(0);for(let i=0;i<samples.length;i++)samples[i]=input.getInt16(i*2,true)/32768;const source=context.createBufferSource();source.buffer=buffer;source.connect(destination);const now=context.currentTime;if(nextAudio<now||nextAudio>now+.4)nextAudio=now+.08;source.start(nextAudio);nextAudio+=buffer.duration;source.onended=()=>source.disconnect();}finally{if(!closed)send({type:'local-media-credit',kind:'audio',id});}
        }
      }
      active={stop};for(const track of stream.getTracks()){const original=track.stop.bind(track);track.stop=()=>{original();if(!closed)stop();};track.addEventListener('ended',stop,{once:true});}window.addEventListener('pcr:native-media',event);timeout=setTimeout(()=>fail('Phone capture did not start. Check Android camera and microphone permissions.'),30000);
      send({type:'local-media-start',id,video:options.video!==false,audio:options.audio!==false,front:options.video?.facingMode?.ideal==='user'});
    });
  }
  function stop(){generation++;active?.stop();}
  window.PCRMedia={available,getUserMedia,stop};window.addEventListener('pagehide',stop);
})();
