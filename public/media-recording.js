(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else{root.PCRRecording=api;if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',api.mount,{once:true});else api.mount();}})(globalThis,function(){
  'use strict';
  class BoundedRecorder{
    constructor({Recorder=globalThis.MediaRecorder,limit=128*1024*1024,onState=()=>{},onResult=()=>{}}={}){Object.assign(this,{Recorder,limit,onState,onResult});this.recorder=null;this.timer=null;this.parts=[];this.bytes=0;this.discard=false;}
    start(stream){
      if(this.recorder)throw Error('Stop the current recording first.');
      if(!this.Recorder||!stream?.getTracks().some(t=>t.readyState==='live'))throw Error('Connect a live stream before recording.');
      const video=stream.getVideoTracks().length>0,types=video?['video/webm;codecs=vp8,opus','video/webm','video/mp4']:['audio/webm;codecs=opus','audio/webm','audio/mp4'];
      const mimeType=types.find(type=>this.Recorder.isTypeSupported(type));if(!mimeType)throw Error('Recording is unavailable in this browser.');
      this.parts=[];this.bytes=0;this.discard=false;const recorder=new this.Recorder(stream,{mimeType,videoBitsPerSecond:2500000,audioBitsPerSecond:128000});this.recorder=recorder;
      recorder.ondataavailable=event=>{if(!event.data?.size||this.discard)return;this.parts.push(event.data);this.bytes+=event.data.size;this.onState({recording:true,bytes:this.bytes});if(this.bytes>=this.limit)this.stop();};
      recorder.onerror=()=>{this.stop(true);this.onState({recording:false,error:'Recording failed. The live stream is still available.'});};
      recorder.onstop=()=>{clearTimeout(this.timer);this.timer=null;this.recorder=null;const parts=this.parts;this.parts=[];const bytes=this.bytes,discard=this.discard;this.bytes=0;this.onState({recording:false,bytes});if(!discard&&bytes)this.onResult(new Blob(parts,{type:recorder.mimeType||mimeType}));};
      try{recorder.start(1000);}catch(error){this.recorder=null;throw error;}this.onState({recording:true,bytes:0});this.timer=setTimeout(()=>this.stop(),30*60*1000);
    }
    stop(discard=false){if(discard)this.discard=true;clearTimeout(this.timer);this.timer=null;if(this.recorder?.state!=='inactive')this.recorder?.stop();}
  }
  function save(blob){
    const extension=blob.type.includes('mp4')?'mp4':'webm',name='PC-Remote-'+new Date().toISOString().replace(/[:.]/g,'-')+'.'+extension;
    if(globalThis.PCRAndroid){if(blob.size>32*1024*1024){msg('This recording is too large to save in the Android app. Use the browser for longer recordings.');return;}const reader=new FileReader();reader.onload=()=>globalThis.PCRAndroid.postMessage(JSON.stringify({type:'save-recording',data:String(reader.result).split(',')[1],mime:blob.type.includes('mp4')?'video/mp4':'video/webm'}));reader.readAsDataURL(blob);}
    else{const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),30000);}
  }
  function mount(){
    if(!globalThis.MediaRecorder)return;
    for(const id of ['webrtcVideoDialog','cameraSharing']){
      const dialog=document.getElementById(id),video=dialog?.querySelector('video');if(!video)continue;
      const controls=document.createElement('div');controls.className='mediaRecordingControls';controls.innerHTML='<button type="button" data-record><i></i><span>Record</span></button><span role="status">Save a recording on this device.</span>';dialog.append(controls);
      const button=controls.querySelector('button'),label=controls.querySelector('[role=status]');let recording=false;
      const recorder=new BoundedRecorder({limit:(globalThis.PCRAndroid?24:128)*1024*1024,onState:value=>{recording=value.recording;button.classList.toggle('isRecording',recording);button.querySelector('span').textContent=recording?'Stop & save':'Record';label.textContent=value.error|| (recording?'Recording · '+(value.bytes/1048576).toFixed(1)+' MB':'Recording stopped.');},onResult:blob=>{save(blob);label.textContent='Recording ready · '+(blob.size/1048576).toFixed(1)+' MB';}});
      button.onclick=()=>{if(recording){recorder.stop();return;}try{recorder.start(video.srcObject);}catch(error){label.textContent=error.message;}};
      dialog.addEventListener('close',()=>recorder.stop());window.addEventListener('pcr:auth',()=>recorder.stop(true));window.addEventListener('pagehide',()=>recorder.stop(true));
    }
  }
  return {BoundedRecorder,mount};
});
