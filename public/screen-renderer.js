'use strict';
// Keep the newest keyframe and newest cumulative patch. A slow decoder never
// builds an unbounded queue, and dropping a patch cannot lose screen changes.
class ScreenRenderer {
  constructor({canvas,decode,isCurrent,onFrame,onAck,onRefresh}){
    Object.assign(this,{canvas,decode,isCurrent,onFrame,onAck,onRefresh});
    this.source=null;this.base=null;this.keyframe=null;this.patch=null;this.busy=false;this.refreshPending=false;
  }
  reset(source){this.source=source;this.base=null;this.keyframe=null;this.patch=null;this.refreshPending=false;}
  refresh(){if(!this.refreshPending){this.refreshPending=true;this.onRefresh();}}
  push(type,bytes,id,source){
    if(source!==this.source||!this.isCurrent(source))return;
    let frame={bytes,id,source,keyframe:true,base:null,x:0,y:0,w:0,h:0};
    if(type===5){
      if(bytes.length<=21||bytes[0]>1){this.refresh();this.onAck(id);return;}
      const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
      Object.assign(frame,{keyframe:bytes[0]===1,base:view.getUint32(1),w:view.getUint32(5),h:view.getUint32(9),x:view.getUint32(13),y:view.getUint32(17),bytes:bytes.subarray(21)});
      if(!frame.base||!frame.w||!frame.h||frame.w>32768||frame.h>32768||frame.w*frame.h>33554432||frame.x>=frame.w||frame.y>=frame.h||(frame.keyframe&&(frame.x||frame.y))){this.refresh();this.onAck(id);return;}
    }else if(type!==0)return;
    if(frame.keyframe){this.keyframe=frame;this.patch=null;}
    else this.patch=frame;
    void this.pump();
  }
  async pump(){
    if(this.busy)return;this.busy=true;
    try{
      while(this.keyframe||this.patch){
        const frame=this.keyframe||this.patch;
        if(this.keyframe)this.keyframe=null;else this.patch=null;
        if(frame.source!==this.source||!this.isCurrent(frame.source))continue;
        let image;
        try{
          if(!frame.keyframe&&this.base!==frame.base){this.refresh();continue;}
          image=await this.decode(frame.bytes);
          if(frame.source!==this.source||!this.isCurrent(frame.source))continue;
          const w=frame.w||image.width,h=frame.h||image.height;
          if((frame.keyframe&&(image.width!==w||image.height!==h))||frame.x+image.width>w||frame.y+image.height>h)throw Error('Invalid screen region');
          const c=this.canvas;
          if(frame.keyframe){if(c.width!==w||c.height!==h){c.width=w;c.height=h;}this.base=frame.base;this.refreshPending=false;}
          else if(c.width!==w||c.height!==h)throw Error('Screen size changed');
          c.getContext('2d',{alpha:false,desynchronized:true}).drawImage(image,frame.x,frame.y);
          this.onFrame();
        }catch{this.base=null;this.refresh();}
        finally{image?.close();if(frame.source===this.source&&this.isCurrent(frame.source))this.onAck(frame.id);}
      }
    }finally{this.busy=false;}
  }
}
if(typeof module!=='undefined'&&module.exports)module.exports=ScreenRenderer;
else window.PCRScreenRenderer=ScreenRenderer;
