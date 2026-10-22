'use strict';
(() => {
  const MAX_BUFFER=64*1024;
  const POINTER_BUFFER=1024;
  let socket=null,wanted=false,retryTimer=null,openTimer=null,retryDelay=2000,nextId=1;
  const pending=new Map();
  let lastFrameAck=null;
  function ready(){return !!socket&&socket.readyState===WebSocket.OPEN;}
  function active(){return wanted&&rs.on&&!!rs.m&&!document.hidden;}
  function rejectPending(message){
    for(const request of pending.values()){request.cleanup();request.reject(Error(message));}
    pending.clear();
  }
  function scheduleReconnect(){
    clearTimeout(retryTimer);
    if(!active())return;
    retryTimer=setTimeout(connect,retryDelay);retryDelay=Math.min(30000,retryDelay*2);
  }
  function lost(ws,message){
    if(socket!==ws)return;
    const used=ws.pcrUsed;
    socket=null;clearTimeout(openTimer);rejectPending(message);
    // A sent edit might have reached Windows even if its reply was lost.
    if(used&&rs.on){rsPauseLive('Input connection changed. Check the PC field, then tap New field before typing.');}
    scheduleReconnect();flush();
  }
  function connect(){
    clearTimeout(retryTimer);retryTimer=null;
    if(!active()||socket)return;
    let ws;
    try{ws=new WebSocket((location.protocol==='https:'?'wss:':'ws:')+'//'+location.host+'/api/input-stream'+(rs.m?.streamId?'?screen='+encodeURIComponent(rs.m.streamId):''));}
    catch{scheduleReconnect();return;}
    socket=ws;ws.pcrUsed=false;
    openTimer=setTimeout(()=>{if(socket===ws&&ws.readyState===WebSocket.CONNECTING)ws.close();},3000);
    ws.addEventListener('open',()=>{
      if(socket!==ws||!active()){ws.close();return;}
      clearTimeout(openTimer);retryDelay=2000;if(lastFrameAck!==null)ackFrame(lastFrameAck);flush();
    });
    ws.addEventListener('message',event=>{
      if(socket!==ws)return;
      let response;
      try{response=JSON.parse(event.data);}catch{lost(ws,'Invalid input reply');ws.close();return;}
      const request=pending.get(response.id);
      if(request){pending.delete(response.id);request.cleanup();request.resolve(response);}
      else if(response.ok===false||response.status>=400){
        rsPauseLive(response.error||'PC input was rejected. Select the PC field, then tap New field.');
        msg(response.error||'PC input unavailable');
      }
    });
    ws.addEventListener('close',()=>lost(ws,'Input connection disconnected'));
    ws.addEventListener('error',()=>{if(socket===ws)ws.close();});
  }
  function start(){wanted=true;connect();}
  function stop(){
    wanted=false;lastFrameAck=null;clearTimeout(retryTimer);clearTimeout(openTimer);retryTimer=null;
    const previous=socket;socket=null;
    rejectPending('Input connection changed');
    if(previous)previous.close();
  }
  // Pointer updates use one ordered connection without an HTTP round-trip gate.
  // Backpressure keeps unsent actions in the controller's coalescing queue.
  function sendPointer(commands){
    if(!ready())return 'http';
    if(socket.bufferedAmount>=POINTER_BUFFER)return 'blocked';
    const ws=socket;
    try{ws.send(JSON.stringify({cmds:commands,wait:false}));ws.pcrUsed=true;return 'sent';}
    catch{lost(ws,'Could not send PC input');ws.close();return 'failed';}
  }
  async function sendInput(commands,{wait=true,signal}={}){
    if(!ready())return api('/api/input',{method:'POST',body:JSON.stringify({cmds:commands,wait}),signal});
    if(signal?.aborted)throw Error('Input request cancelled');
    const ws=socket;
    if(ws.bufferedAmount>=MAX_BUFFER)throw Error('Input connection is busy. Check the PC before resuming.');
    const id=nextId++;
    return new Promise((resolve,reject)=>{
      const abort=()=>{const request=pending.get(id);if(request){pending.delete(id);request.cleanup();reject(Error('PC input acknowledgement timed out'));}};
      const timer=setTimeout(abort,18000);
      const cleanup=()=>{clearTimeout(timer);signal?.removeEventListener('abort',abort);};
      pending.set(id,{resolve,reject,cleanup});signal?.addEventListener('abort',abort,{once:true});
      try{ws.send(JSON.stringify({id,cmds:commands,wait}));ws.pcrUsed=true;}
      catch(e){pending.delete(id);cleanup();reject(e);lost(ws,'Could not send PC input');ws.close();}
    });
  }
  function ackFrame(id){
    if(!Number.isSafeInteger(id))return;
    lastFrameAck=id;
    if(ready())try{socket.send(JSON.stringify({frameAck:id}));}catch{}
  }
  function refreshFrame(){if(!ready())return false;try{socket.send(JSON.stringify({refresh:true}));return true;}catch{return false;}}
  window.PCRInputTransport={start,stop,sendPointer,sendInput,ackFrame,refreshFrame,get isOpen(){return ready();},get bufferedAmount(){return socket?.bufferedAmount||0;},get mode(){return ready()?'stream':'http';}};
})();
