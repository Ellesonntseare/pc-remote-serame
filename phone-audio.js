'use strict';
const {WebSocketServer,WebSocket}=require('ws');
function validPhoneFormat(value){return !!value&&value.type==='format'&&['s16le','opus'].includes(value.encoding)&&(value.encoding!=='opus'||value.sampleRate===48000)&&['microphone','playback'].includes(value.source)&&Number.isInteger(value.sampleRate)&&value.sampleRate>=8000&&value.sampleRate<=48000&&[1,2].includes(value.channels);}
function createPhoneAudio({auth,sessions,sessionExpiry,openOutput}){
  const wss=new WebSocketServer({noServer:true,maxPayload:65536,perMessageDeflate:false});let active=null;
  function upgrade(req,socket,head,token){
    wss.handleUpgrade(req,socket,head,ws=>{
      ws.on('error',()=>{});
      if(active){ws.send(JSON.stringify({type:'error',error:'The PC is already receiving audio. Stop that stream before starting another.'}));ws.close(1008,'Audio input is busy');return;}
      const entry=active={ws,token,output:null};let format=null,ready=false,closed=false,bytes=0,rateAt=Date.now(),messages=0,alive=true,heartbeat=null,expire=()=>{};
      const send=value=>{if(ws.readyState===WebSocket.OPEN)ws.send(JSON.stringify(value));};
      function stop(){if(closed)return;closed=true;clearTimeout(handshake);clearInterval(heartbeat);expire();entry.output?.stop();if(active===entry)active=null;}
      function fail(message){send({type:'error',error:message});stop();ws.close(1008,'Audio input stopped');}
      const handshake=setTimeout(()=>fail('Audio format did not arrive. Start streaming again.'),5000);handshake.unref();
      expire=sessionExpiry(()=>sessions.get(token)?.until||0,()=>fail('Your session expired. Sign in and reconnect audio.'));if(closed)return;
      heartbeat=setInterval(()=>{if(!alive||auth(req)!==token){stop();ws.terminate();return;}alive=false;ws.ping();},15000);heartbeat.unref();ws.on('pong',()=>{alive=true;});
      ws.on('error',()=>{});ws.on('close',stop);send({type:'ready'});
      ws.on('message',(data,binary)=>{
        if(closed)return;if(auth(req)!==token||sessions.get(token)?.role!=='owner'){fail('PC audio access ended.');return;}
        const now=Date.now();if(now-rateAt>1000){rateAt=now;bytes=0;messages=0;}if(++messages>140){fail('Audio arrived too quickly. Reconnect the stream.');return;}
        if(binary){if(!format||!ready||data.length<1||(format.encoding==='opus'?data.length>4096:data.length%(format.channels*2)!==0)){fail('Invalid audio samples.');return;}bytes+=data.length;if(bytes>format.sampleRate*format.channels*4){fail('Audio data exceeded the stream limit.');return;}try{if(format.encoding==='opus')entry.output.sendOpus(data);else entry.output.sendPcm(data);}catch{fail('The PC output disconnected.');}return;}
        let value;try{value=JSON.parse(data.toString());}catch{fail('Invalid audio message.');return;}
        if(value?.type==='stop'){stop();ws.close(1000,'Audio stopped');return;}
        if(value?.type==='volume'&&Number.isFinite(value.value)&&value.value>=0&&value.value<=1){entry.output?.setVolume(value.value);return;}
        if(format||!validPhoneFormat(value)){fail('Unsupported phone audio format.');return;}
        format=value;clearTimeout(handshake);
        try{entry.output=openOutput({sampleRate:value.sampleRate,channels:value.channels,encoding:value.encoding,volume:.6,onReady:()=>{if(!closed){ready=true;send({type:'started',source:value.source,encoding:value.encoding});}},onError:()=>fail('PC speakers or headphones could not start. Check the Windows output device.'),onClose:()=>{if(!closed)fail('PC audio output stopped.');}});}catch{fail('PC audio output is unavailable. Restart the updated Windows host.');}
      });
    });
  }
  function revoke(token){if(active&&(!token||active.token===token)){const entry=active,ws=entry.ws;entry.output?.stop();ws.close(1001,'Audio access ended');setTimeout(()=>ws.terminate(),300).unref();}}
  return {upgrade,revoke,close(){revoke();wss.close();}};
}
module.exports={createPhoneAudio,validPhoneFormat};
