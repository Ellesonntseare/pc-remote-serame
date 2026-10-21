'use strict';
// Assemble fragmented screen packets with one allocation and one copy per payload.
// Large JPEGs must not repeatedly copy the entire partial frame on every read.
class ScreenPacketReader {
  constructor(maxBytes=8*1024*1024){this.maxBytes=maxBytes;this.header=new Uint8Array(5);this.headerUsed=0;this.payload=null;this.used=0;}
  feed(chunk,receive){
    let offset=0;
    while(offset<chunk.length){
      if(this.headerUsed<5){
        const count=Math.min(5-this.headerUsed,chunk.length-offset);
        this.header.set(chunk.subarray(offset,offset+count),this.headerUsed);this.headerUsed+=count;offset+=count;
        if(this.headerUsed<5)return;
        const h=this.header,size=((h[1]<<24)|(h[2]<<16)|(h[3]<<8)|h[4])>>>0;
        if(size>this.maxBytes)throw Error('Invalid screen packet');
        this.payload=new Uint8Array(size);this.used=0;
      }
      const count=Math.min(this.payload.length-this.used,chunk.length-offset);
      this.payload.set(chunk.subarray(offset,offset+count),this.used);this.used+=count;offset+=count;
      if(this.used===this.payload.length){
        const type=this.header[0],payload=this.payload;this.headerUsed=0;this.payload=null;this.used=0;receive(type,payload);
      }
    }
  }
}
if(typeof module!=='undefined'&&module.exports)module.exports=ScreenPacketReader;
else window.PCRPacketReader=ScreenPacketReader;
