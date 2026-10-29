'use strict';
const {spawn}=require('node:child_process'),path=require('node:path'),fs=require('node:fs'),{WebSocketServer,WebSocket}=require('ws');
// FFmpeg emits Annex B access units with AUD boundaries. Keep at most one bounded
// unfinished unit; pipe chunk boundaries are unrelated to encoded frame boundaries.
class AccessUnits{
  constructor(emit){this.emit=emit;this.buffer=Buffer.alloc(0);this.start=-1;this.scan=0;}
  push(bytes){this.buffer=Buffer.concat([this.buffer,bytes]);if(this.buffer.length>8*1024*1024)throw Error('Video frame exceeded its limit');let i=this.scan;while(i+4<this.buffer.length){const n=this.buffer[i]===0&&this.buffer[i+1]===0?(this.buffer[i+2]===1?3:this.buffer[i+2]===0&&this.buffer[i+3]===1?4:0):0;if(!n){i++;continue;}const type=this.buffer[i+n]&31;if(type===9){if(this.start>=0&&i>this.start){this.emit(this.buffer.subarray(this.start,i));this.buffer=this.buffer.subarray(i);i=0;this.start=0;}else this.start=i;}i+=n+1;}this.scan=i;}
}
function describe(frame){let key=false,codec=null;for(let i=0;i+5<frame.length;i++){if(frame[i]||frame[i+1])continue;const n=frame[i+2]===1?3:frame[i+2]===0&&frame[i+3]===1?4:0;if(!n)continue;const type=frame[i+n]&31;if(type===5)key=true;if(type===7&&i+n+3<frame.length)codec='avc1.'+frame.subarray(i+n+1,i+n+4).toString('hex');}return {key,codec};}
const PROFILES={low:{width:854,fps:12,bitrate:800},med:{width:1280,fps:20,bitrate:2000},high:{width:1600,fps:24,bitrate:4000},hd:{width:1920,fps:30,bitrate:6000},auto:{width:1280,fps:24,bitrate:3000},smooth:{width:1280,fps:30,bitrate:3200},fluid:{width:1280,fps:60,bitrate:5000}};
function createNativeVideo({root,auth,sessions,sessionExpiry,enabled=true,spawnImpl=spawn,platform=process.platform,ffmpegPath,capturePath}={}){
  const {createEncoderSelector,encodingArgs,mp4EncodingArgs,LABELS}=require('./video-encoders'),selector=createEncoderSelector({spawnImpl});
  const wss=new WebSocketServer({noServer:true,maxPayload:1024,perMessageDeflate:false}),peers=new Set();let closed=false;
  function upgrade(req,socket,head,token,preset='auto',windowSource=null,mse=false){
    wss.handleUpgrade(req,socket,head,async ws=>{
      if(closed||!enabled||platform!=='win32'||!Object.hasOwn(PROFILES,preset)){ws.close(1013,'Native video unavailable');return;}
      if(windowSource)for(const previous of [...peers])if(previous.token===token)previous.stop();
      if(peers.size>=2){ws.close(1013,'Native video unavailable');return;}
      const peer={ws,token,children:[],stopped:false};peers.add(peer);const profile=PROFILES[preset];let generation=0,expiry=()=>{},startTimer=null,ping=null;
      function killChildren(){for(const child of peer.children.splice(0)){child.stdin?.destroy();child.stdout?.destroy();try{child.kill();}catch{}}}
      const stop=()=>{if(peer.stopped)return;peer.stopped=true;generation++;peers.delete(peer);clearTimeout(startTimer);clearInterval(ping);expiry();killChildren();if(ws.readyState===WebSocket.OPEN)ws.close(1000,'Video stopped');};
      peer.stop=stop;const fail=message=>{if(ws.readyState===WebSocket.OPEN)ws.send(JSON.stringify({type:'error',message}));stop();};
      expiry=sessionExpiry(()=>sessions.get(token)?.until||0,stop);if(peer.stopped)return;
      startTimer=setTimeout(()=>fail('Native video did not start. Compatibility screen active.'),16000);startTimer.unref();let alive=true;
      ping=setInterval(()=>{if(!alive||auth(req)!==token)return stop();alive=false;ws.ping();},15000);ping.unref();ws.on('pong',()=>alive=true);ws.on('close',stop);ws.on('error',stop);ws.on('message',()=>fail('Unexpected video input'));
      try{
        const binary=ffmpegPath||require('ffmpeg-static'),exe=capturePath||path.join(root,'RemoteAgent/bin/RemoteAgent.exe');if(!binary||!fs.existsSync(binary)||!fs.existsSync(exe))throw Error('Update the Windows host for native video.');
        function launch(codec){
          if(peer.stopped)return;const serial=++generation;killChildren();let metadata=null,header=Buffer.alloc(0),encoder=null,avc=null,sequence=0,waitingKey=true,mp4Initial=Buffer.alloc(0),mp4Ready=false;
          const current=()=>!peer.stopped&&generation===serial;
          const failed=message=>{if(!current())return;if(codec!=='libx264'){selector.reject(codec);launch('libx264');}else fail(message);};
          const packets=new AccessUnits(frame=>{
            if(!current())return;const info=describe(frame);avc=info.codec||avc;if(!avc)return;
            if(ws.bufferedAmount>512*1024){waitingKey=true;return;}if(waitingKey&&!info.key)return;
            if(info.key){waitingKey=false;ws.send(JSON.stringify({type:'format',encoding:'h264',codec:avc,...metadata,engine:LABELS[codec],hardware:codec!=='libx264'}));}
            clearTimeout(startTimer);const envelope=Buffer.alloc(13);envelope[0]=info.key?1:0;envelope.writeDoubleBE(Math.round(sequence++*1000000/profile.fps),1);envelope.writeUInt32BE(frame.length,9);ws.send(Buffer.concat([envelope,frame]));
          });
          const capture=spawnImpl(exe,['--video-frames'],{cwd:root,windowsHide:true,stdio:['pipe','pipe','pipe']});peer.children.push(capture);
          capture.stdin.on('error',()=>{});capture.stderr.resume();capture.on('error',()=>{if(current())fail('Windows screen capture could not start.');});capture.on('close',()=>{if(current())fail(windowSource?'The selected display or window stopped. Reconnect it and try again.':'Windows screen capture ended.');});capture.stdin.write(JSON.stringify({width:profile.width,fps:profile.fps,...windowSource&&(windowSource.monitor?{monitor:windowSource.monitor}:{window:windowSource})})+'\n');
          capture.stdout.on('data',bytes=>{
            if(!current())return;try{
              if(!metadata){
                header=Buffer.concat([header,bytes]);if(header.length<12)return;const width=header.readInt32BE(0),height=header.readInt32BE(4),fps=header.readInt32BE(8);if(width<2||width>1920||height<2||height>1920||width*height>2073600||width%2||height%2||fps!==profile.fps)throw Error('Invalid native video dimensions');metadata={width,height,fps};
                const args=mse?mp4EncodingArgs(codec,profile):encodingArgs(codec,profile);
                encoder=spawnImpl(binary,['-hide_banner','-loglevel','error','-f','rawvideo','-pixel_format','bgra','-video_size',width+'x'+height,'-framerate',String(fps),'-i','pipe:0','-an',...args],{windowsHide:true,stdio:['pipe','pipe','pipe']});peer.children.push(encoder);
                encoder.stdin.on('error',()=>failed('Video encoding stopped.'));encoder.stderr.resume();encoder.on('error',()=>failed('H.264 encoding could not start.'));encoder.on('close',()=>failed('H.264 encoding ended.'));encoder.stdout.on('data',chunk=>{if(!current())return;try{if(!mse){packets.push(chunk);return;}if(ws.bufferedAmount>512*1024)return fail('Connection fell behind. Reconnect with a lower frame rate.');if(!mp4Ready){mp4Initial=Buffer.concat([mp4Initial,chunk]);if(mp4Initial.length>512*1024)throw Error();const at=mp4Initial.indexOf('avcC');if(at<4||mp4Initial.length<at+8)return;const codecName='avc1.'+mp4Initial.subarray(at+5,at+8).toString('hex');ws.send(JSON.stringify({type:'format',encoding:'mp4',codec:codecName,mime:'video/mp4; codecs="'+codecName+'"',...metadata,engine:LABELS[codec],hardware:codec!=='libx264'}));mp4Ready=true;clearTimeout(startTimer);ws.send(mp4Initial);mp4Initial=Buffer.alloc(0);}else ws.send(chunk);}catch{failed('Video encoding failed.');}});encoder.stdin.on('drain',()=>{if(current())capture.stdout.resume();});bytes=header.subarray(12);header=Buffer.alloc(0);
              }
              if(bytes.length&&!encoder.stdin.write(bytes))capture.stdout.pause();
            }catch{failed('Native video could not initialize.');}
          });
        }
        const codec=await selector.select(binary);if(!peer.stopped)launch(codec);
      }catch(error){fail(error.message);}
    });
  }
  function revoke(token){for(const peer of [...peers])if(!token||peer.token===token)peer.stop();}
  return {upgrade,revoke,close(){closed=true;revoke();wss.close();}};
}
module.exports={createNativeVideo,AccessUnits,describe,PROFILES};
