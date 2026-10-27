'use strict';
const {spawn}=require('node:child_process');
const LABELS={h264_qsv:'Intel Quick Sync',h264_nvenc:'NVIDIA NVENC',h264_amf:'AMD AMF',libx264:'Software H.264'};
function encodingArgs(codec,{fps,bitrate}){
  const common=['-c:v',codec,'-profile:v','baseline','-pix_fmt',codec==='h264_qsv'?'nv12':'yuv420p','-b:v',bitrate+'k','-maxrate',bitrate+'k','-bufsize',bitrate+'k','-g',String(fps),'-bf','0'];
  if(codec==='h264_qsv')common.push('-preset','veryfast','-look_ahead','0','-async_depth','1');
  else if(codec==='h264_nvenc')common.push('-preset','p1','-tune','ull','-zerolatency','1','-rc-lookahead','0');
  else if(codec==='h264_amf')common.push('-usage','ultralowlatency','-quality','speed','-rc','cbr');
  else common.push('-preset','ultrafast','-tune','zerolatency','-threads','2','-x264-params','aud=1:repeat-headers=1:scenecut=0');
  return [...common,'-bsf:v','h264_metadata=aud=insert,dump_extra','-f','h264','pipe:1'];
}
function createEncoderSelector({spawnImpl=spawn,timeout=3000}={}){
  let pending=null,selected=null;const failed=new Set();
  async function probe(binary,codec){return new Promise(resolve=>{let child,done=false,bytes=0,output=[];const finish=value=>{if(done)return;done=true;clearTimeout(timer);try{child?.kill();}catch{}resolve(value);};const timer=setTimeout(()=>finish(false),timeout);timer.unref?.();try{child=spawnImpl(binary,['-hide_banner','-loglevel','error','-f','lavfi','-i','color=size=1280x720:rate=24','-frames:v','3','-an',...encodingArgs(codec,{fps:24,bitrate:3000})],{windowsHide:true,stdio:['ignore','pipe','pipe']});child.stderr.resume();child.stdout.on('data',chunk=>{bytes+=chunk.length;if(bytes>1024*1024)return finish(false);output.push(chunk);});child.on('error',()=>finish(false));child.on('close',code=>{const data=Buffer.concat(output);finish(code===0&&data.length>64&&data.includes(Buffer.from([0,0,0,1])));});}catch{finish(false);}});}
  async function select(binary){if(selected&&!failed.has(selected))return selected;if(pending)return pending;pending=(async()=>{for(const codec of ['h264_qsv','h264_nvenc','h264_amf'])if(!failed.has(codec)&&await probe(binary,codec))return selected=codec;return selected='libx264';})().finally(()=>pending=null);return pending;}
  return {select,reject(codec){failed.add(codec);if(selected===codec)selected=null;}};
}
module.exports={createEncoderSelector,encodingArgs,LABELS};
