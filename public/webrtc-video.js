(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else{root.PCRVideo=api;if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',api.mount);else api.mount();}})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  function preferH264(codecs){return [...codecs.filter(c=>/^video\/h264$/i.test(c.mimeType)),...codecs.filter(c=>!/^video\/h264$/i.test(c.mimeType))];}
  function statsSummary(reports,publish){
    const values=Array.from(reports.values()),video=values.find(s=>s.type===(publish?'outbound-rtp':'inbound-rtp')&&(s.kind==='video'||s.mediaType==='video')&&!s.isRemote),codec=video&&reports.get(video.codecId),pair=values.find(s=>s.type==='candidate-pair'&&s.state==='succeeded'&&(s.nominated||s.selected));
    return {codec:codec?.mimeType?.replace(/^video\//i,'')||'Negotiating',fps:Number.isFinite(video?.framesPerSecond)?Math.round(video.framesPerSecond):null,rtt:Number.isFinite(pair?.currentRoundTripTime)?Math.round(pair.currentRoundTripTime*1000):null,implementation:typeof video?.encoderImplementation==='string'?video.encoderImplementation:null,powerEfficient:typeof video?.powerEfficientEncoder==='boolean'?video.powerEfficientEncoder:null};
  }
  class VideoSession {
    constructor(options={}){this.Peer=options.Peer||globalThis.RTCPeerConnection;this.Socket=options.Socket||globalThis.WebSocket;this.location=options.location||globalThis.location;this.capabilities=options.capabilities||(()=>globalThis.RTCRtpReceiver?.getCapabilities('video'));this.getConfig=options.getConfig||(()=>api('/api/webrtc/config'));this.onStatus=options.onStatus||(()=>{});this.onStream=options.onStream||(()=>{});this.onStats=options.onStats||(()=>{});this.peers=new Map();this.socket=null;this.stream=null;this.epoch=0;this.timer=null;this.statsBusy=false;}
    async start({publish=false,stream=null}={}){
      this.stop();const epoch=this.epoch;this.publish=publish;this.stream=stream;
      try{
        if(!this.Peer||!this.Socket)throw Error('Video preview is unavailable in this browser.');
        const config=await this.getConfig();if(epoch!==this.epoch)return;if(!config.ok)throw Error(config.error||'Screen viewing was not approved.');this.config={iceServers:config.iceServers||[]};
        const ws=this.socket=new this.Socket((this.location.protocol==='https:'?'wss:':'ws:')+'//'+this.location.host+'/api/webrtc-video?role='+(publish?'publish':'watch'));
        ws.onopen=()=>{if(epoch===this.epoch)this.onStatus(publish?'PC video is ready. Connect from your phone.':'Waiting for the PC video source…');};
        ws.onmessage=event=>{if(epoch!==this.epoch)return;let value;try{value=JSON.parse(event.data);}catch{return;}void this.receive(value,epoch).catch(error=>{if(epoch===this.epoch){this.stop();this.onStatus(error.message||'Video connection failed. Use Remote screen to continue.');}});};
        ws.onclose=()=>{if(epoch===this.epoch){this.stop();this.onStatus('Video connection ended. Use Remote screen or connect again.');}};ws.onerror=()=>{if(epoch===this.epoch)ws.close();};
        this.timer=setInterval(()=>{void this.readStats(epoch);},1500);
      }catch(error){if(epoch===this.epoch){this.stop();this.onStatus(error.message||'Could not start video.');}}
    }
    send(value){if(this.socket?.readyState===1&&this.socket.bufferedAmount<262144)this.socket.send(JSON.stringify(value));}
    peer(id,epoch){
      if(this.peers.has(id))return this.peers.get(id);const pc=new this.Peer(this.config),entry={pc,id,queue:Promise.resolve(),ice:[]};this.peers.set(id,entry);
      const track=this.stream?.getVideoTracks()[0];let transceiver;
      if(this.publish){if(!track)throw Error('No screen video was selected.');const sender=pc.addTrack(track,this.stream);transceiver=pc.getTransceivers().find(t=>t.sender===sender);}
      else transceiver=pc.addTransceiver('video',{direction:'recvonly'});
      const codecs=preferH264(this.capabilities()?.codecs||[]);if(codecs.length&&transceiver?.setCodecPreferences)try{transceiver.setCodecPreferences(codecs);}catch{}
      pc.onicecandidate=event=>{if(epoch===this.epoch)this.send({type:'candidate',id:this.publish?id:undefined,candidate:event.candidate?.toJSON?.()??event.candidate??null});};
      pc.ontrack=event=>{if(epoch===this.epoch&&!this.publish&&event.streams?.[0]){this.onStream(event.streams[0]);this.onStatus('Live video · microphone is off');}};
      pc.onconnectionstatechange=()=>{if(epoch!==this.epoch)return;if(pc.connectionState==='connected')this.onStatus(this.publish?'PC video connected.':'Live video');else if(pc.connectionState==='failed'){if(!this.publish)this.stop();else{pc.close();this.peers.delete(id);}this.onStatus('Video could not connect. Use Remote screen; connections across different networks may need a relay.');}};
      return entry;
    }
    async receive(value,epoch){
      if(!value||epoch!==this.epoch)return;
      if(!this.publish&&(value.type==='source-ready'||value.type==='ready'&&value.available)){this.send({type:'watch'});return;}
      if(value.type==='source-stopped'){for(const p of this.peers.values())p.pc.close();this.peers.clear();this.onStream(null);this.onStatus('The PC stopped video sharing. Waiting for it to restart.');return;}
      if(value.type==='leave'&&this.publish){const p=this.peers.get(value.id);p?.pc.close();this.peers.delete(value.id);return;}
      if(value.type==='join'&&this.publish){const entry=this.peer(value.id,epoch);entry.queue=entry.queue.then(async()=>{const offer=await entry.pc.createOffer();if(epoch!==this.epoch)return;await entry.pc.setLocalDescription(offer);if(epoch!==this.epoch)return;this.send({type:'description',id:value.id,description:entry.pc.localDescription});});await entry.queue;return;}
      if(!['description','candidate'].includes(value.type))return;const id=this.publish?value.id:'source',entry=this.peer(id,epoch);
      entry.queue=entry.queue.then(async()=>{
        if(epoch!==this.epoch)return;
        if(value.type==='candidate'){if(!entry.pc.remoteDescription)entry.ice.push(value.candidate);else await entry.pc.addIceCandidate(value.candidate);return;}
        await entry.pc.setRemoteDescription(value.description);if(epoch!==this.epoch)return;for(const candidate of entry.ice.splice(0))await entry.pc.addIceCandidate(candidate);
        if(!this.publish){const answer=await entry.pc.createAnswer();if(epoch!==this.epoch)return;await entry.pc.setLocalDescription(answer);if(epoch!==this.epoch)return;this.send({type:'description',description:entry.pc.localDescription});}
        else{
          const sender=entry.pc.getSenders().find(s=>s.track?.kind==='video');if(sender){const parameters=sender.getParameters();if(parameters.encodings?.length){for(const encoding of parameters.encodings){encoding.maxBitrate=4000000;encoding.maxFramerate=30;}try{await sender.setParameters(parameters);}catch{}}}
        }
      });await entry.queue;
    }
    async readStats(epoch){if(this.statsBusy||epoch!==this.epoch)return;const first=this.peers.values().next().value;if(!first)return;this.statsBusy=true;try{const reports=await first.pc.getStats();if(epoch===this.epoch)this.onStats(statsSummary(reports,this.publish));}catch{}finally{this.statsBusy=false;}}
    stop(){this.epoch++;clearInterval(this.timer);this.timer=null;const socket=this.socket;this.socket=null;for(const p of this.peers.values())p.pc.close();this.peers.clear();for(const track of this.stream?.getTracks()||[])track.stop();this.stream=null;socket?.close();this.onStream(null);}
  }
  function mount(){
    const home=document.createElement('button');home.type='button';home.id='webrtcVideoHome';home.className='quick wide';home.hidden=true;home.innerHTML='Video preview<span>Try the new live-video connection</span>';document.querySelector('.heroactions')?.append(home);
    const dialog=document.createElement('dialog');dialog.id='webrtcVideoDialog';dialog.innerHTML='<header><div><span>EXPERIMENTAL VIDEO</span><h2>Video preview</h2></div><button type="button" data-close aria-label="Close video preview">✕</button></header><p class="rtcHint"></p><video muted autoplay playsinline></video><div class="rtcActions"><button type="button" data-publish>Share from this PC</button><button type="button" data-watch>Watch PC</button><button type="button" data-stop>Stop</button><button type="button" data-fallback>Use Remote screen</button></div><p class="rtcStatus" role="status" aria-live="polite">Video is off.</p><p class="rtcStats"></p>';document.body.append(dialog);dialog.setAttribute('aria-label','Video streaming preview');
    const q=s=>dialog.querySelector(s),video=q('video'),status=q('.rtcStatus'),stats=q('.rtcStats');let owner=false,starting=false,epoch=0;
    const session=new VideoSession({onStatus:text=>{status.textContent=text;},onStream:stream=>{video.srcObject=stream;if(stream)void video.play().catch(()=>{status.textContent='Tap the video to start playback.';});},onStats:value=>{stats.textContent=[value.codec,value.fps===null?null:value.fps+' fps',value.rtt===null?null:value.rtt+' ms round trip',value.implementation?'Encoder: '+value.implementation:null,value.powerEfficient===true?'Power-efficient encoding confirmed':null].filter(Boolean).join(' · ');}});
    function stop(){epoch++;starting=false;session.stop();q('[data-publish]').disabled=false;q('[data-watch]').disabled=false;status.textContent='Video is off.';stats.textContent='';}
    home.addEventListener('click',()=>dialog.showModal());q('[data-close]').addEventListener('click',()=>dialog.close());dialog.addEventListener('close',stop);q('[data-stop]').addEventListener('click',stop);
    q('[data-watch]').addEventListener('click',()=>{if(starting)return;void session.start();});
    q('[data-publish]').addEventListener('click',async()=>{if(starting||!owner)return;starting=true;const version=++epoch;q('[data-publish]').disabled=true;let stream;
      try{stream=await navigator.mediaDevices.getDisplayMedia({video:{width:{max:1920},height:{max:1080},frameRate:{ideal:30,max:30}},audio:false});if(version!==epoch){for(const track of stream.getTracks())track.stop();return;}for(const track of stream.getVideoTracks()){track.contentHint='detail';track.addEventListener('ended',()=>{if(version===epoch)stop();},{once:true});}await session.start({publish:true,stream});}
      catch(error){for(const track of stream?.getTracks()||[])track.stop();if(version===epoch)status.textContent=error.name==='NotAllowedError'?'Screen selection was cancelled.':error.message||'Could not start PC video.';}
      finally{if(version===epoch){starting=false;q('[data-publish]').disabled=false;}}
    });
    q('[data-fallback]').addEventListener('click',()=>{dialog.close();if(window.PCRCanAccess?.('screen'))rsOpen();});video.addEventListener('click',()=>{if(video.srcObject)void video.play().catch(()=>{});});
    function authChanged(){stop();dialog.close();owner=window.PCRAuth?.role==='owner';home.hidden=!window.PCRCanAccess?.('screen');q('[data-publish]').hidden=!owner||!navigator.mediaDevices?.getDisplayMedia;q('.rtcHint').textContent=owner?'On your PC, share a display here. On your phone, choose Watch PC. Use Remote screen for mouse and keyboard.':'Watch the display Serame explicitly shares. Use Remote screen for approved PC controls.';}
    window.addEventListener('pcr:auth',authChanged);window.addEventListener('pagehide',stop);authChanged();
  }
  return {preferH264,statsSummary,VideoSession,mount};
});
