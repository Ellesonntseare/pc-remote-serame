using Concentus;
using Concentus.Enums;
using System.Buffers.Binary;
using System.Text.Json;
var results=new List<object>();
foreach(int channels in new[]{1,2}){
 using var encoder=OpusCodecFactory.CreateEncoder(48000,channels,OpusApplication.OPUS_APPLICATION_AUDIO);encoder.Bitrate=channels==1?32000:96000;
 using var decoder=OpusCodecFactory.CreateDecoder(48000,channels);var pcm=new short[960*channels];var decoded=new short[5760*channels];var packet=new byte[4096];long encoded=0;
 using var fixture=args.Length>0?File.Create(args[0]+"-"+channels+".bin"):null;
 for(int frame=0;frame<100;frame++){
  for(int i=0;i<960;i++)for(int c=0;c<channels;c++)pcm[i*channels+c]=(short)(Math.Sin((frame*960+i)*2*Math.PI*(440+c*220)/48000)*11000);
  int count=encoder.Encode(pcm.AsSpan(),960,packet.AsSpan(),packet.Length);if(count<1||count>4096)throw new Exception("Unbounded Opus output");int samples=decoder.Decode(packet.AsSpan(0,count),decoded.AsSpan(),5760);if(samples!=960)throw new Exception("Wrong decoded frame duration");encoded+=count;
  if(fixture!=null){var header=new byte[5];header[0]=3;BinaryPrimitives.WriteInt32BigEndian(header.AsSpan(1),count);fixture.Write(header);fixture.Write(packet,0,count);}
 }
 long raw=100*960*channels*2;if(encoded>=raw/4)throw new Exception("Expected substantial compression");results.Add(new{channels,frames=100,rawBytes=raw,opusBytes=encoded,reductionPercent=Math.Round(100*(1-(double)encoded/raw),1)});
}
Console.WriteLine(JsonSerializer.Serialize(results));
