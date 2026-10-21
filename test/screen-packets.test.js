'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),ScreenPacketReader=require('../public/screen-packets');
function packet(type,payload){const h=Buffer.alloc(5);h[0]=type;h.writeUInt32BE(payload.length,1);return Buffer.concat([h,payload]);}
test('screen parser preserves fragmented metadata, large frames and packet boundaries',()=>{
  const large=Buffer.alloc(4*1024*1024);for(let i=0;i<large.length;i++)large[i]=i%251;
  const meta=Buffer.from('{"w":1920,"h":1080}'),joined=Buffer.concat([packet(1,meta),packet(0,large),packet(3,Buffer.from('{"id":7}'))]);
  const reader=new ScreenPacketReader(),received=[];
  for(let offset=0;offset<joined.length;){const size=offset<12?1:4093;reader.feed(joined.subarray(offset,offset+size),(type,payload)=>received.push({type,payload}));offset+=size;}
  assert.deepEqual(received.map(p=>p.type),[1,0,3]);assert.deepEqual(Buffer.from(received[1].payload),large);assert.equal(Buffer.from(received[0].payload).toString(),meta.toString());assert.equal(Buffer.from(received[2].payload).toString(),'{"id":7}');
});
test('screen parser rejects oversized frames before allocating their payload',()=>{const reader=new ScreenPacketReader(16);assert.throws(()=>reader.feed(packet(0,Buffer.alloc(17)),()=>{}),/Invalid screen packet/);});
test('screen parser handles empty and multiple packets in a single chunk',()=>{const reader=new ScreenPacketReader(),received=[];reader.feed(Buffer.concat([packet(0,Buffer.alloc(0)),packet(1,Buffer.from('ok'))]),(type,data)=>received.push([type,Buffer.from(data).toString()]));assert.deepEqual(received,[[0,''],[1,'ok']]);});
