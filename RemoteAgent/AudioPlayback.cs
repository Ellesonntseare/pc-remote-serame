using NAudio.CoreAudioApi;
using NAudio.Wave;
using System.Buffers.Binary;
using System.Text;
using System.Text.Json;

// Bounded phone audio goes to speakers or an explicitly selected, installed
// VB-CABLE input. The companion CABLE Output is a Windows recording device.
internal static class AudioPlayback
{
    static MMDevice? VirtualInput(MMDeviceEnumerator devices)=>devices.EnumerateAudioEndPoints(DataFlow.Render,DeviceState.Active).FirstOrDefault(device=>device.FriendlyName.Contains("CABLE Input",StringComparison.OrdinalIgnoreCase));
    public static void Devices()
    {
        try{using var devices=new MMDeviceEnumerator();using var input=VirtualInput(devices);bool capture=devices.EnumerateAudioEndPoints(DataFlow.Capture,DeviceState.Active).Any(device=>device.FriendlyName.Contains("CABLE Output",StringComparison.OrdinalIgnoreCase));Console.Write(JsonSerializer.Serialize(new {ok=true,virtualMic=new {available=input!=null&&capture,name="CABLE Output",setupUrl="https://vb-audio.com/Cable/"}}));}
        catch{Console.Write("{\"ok\":true,\"virtualMic\":{\"available\":false,\"name\":\"CABLE Output\",\"setupUrl\":\"https://vb-audio.com/Cable/\"}}");}
    }
    static bool ReadPacket(Stream input, byte[] bytes)
    {
        int offset=0;
        while(offset<bytes.Length){int read=input.Read(bytes,offset,bytes.Length-offset);if(read==0){if(offset!=0)throw new EndOfStreamException();return false;}offset+=read;}
        return true;
    }
    public static void Run()
    {
        try
        {
            using var input=Console.OpenStandardInput();
            var line=new List<byte>();
            while(true){int next=input.ReadByte();if(next<0)return;if(next==10)break;if(line.Count>=1024)throw new InvalidDataException();line.Add((byte)next);}
            using var metadata=JsonDocument.Parse(line.ToArray());var config=metadata.RootElement;
            int rate=config.GetProperty("sampleRate").GetInt32(),channels=config.GetProperty("channels").GetInt32();
            if(rate<8000||rate>48000||channels<1||channels>2)throw new InvalidDataException();
            bool opus=config.TryGetProperty("encoding",out var encoding)&&encoding.GetString()=="opus";
            if(opus&&rate!=48000)throw new InvalidDataException();
            using var decoder=opus?Concentus.OpusCodecFactory.CreateDecoder(rate,channels):null;
            var decoded=new short[5760*channels];
            float volume=config.TryGetProperty("volume",out var initial)?initial.GetSingle():.6f;
            if(!float.IsFinite(volume)||volume<0||volume>1)throw new InvalidDataException();
            var format=new WaveFormat(rate,16,channels);
            var queue=new BufferedWaveProvider(format){BufferDuration=TimeSpan.FromMilliseconds(250),DiscardOnBufferOverflow=true,ReadFully=true};
            bool virtualMic=config.TryGetProperty("output",out var selectedOutput)&&selectedOutput.GetString()=="virtual-mic";
            using var devices=new MMDeviceEnumerator();using var device=virtualMic?VirtualInput(devices)??throw new InvalidOperationException("Install VB-CABLE first."):devices.GetDefaultAudioEndpoint(DataFlow.Render,Role.Multimedia);
            using var output=new WasapiOut(device,AudioClientShareMode.Shared,true,60);
            output.Init(queue);output.Volume=volume;output.Play();
            Console.WriteLine(JsonSerializer.Serialize(new {type="started",sampleRate=rate,channels}));Console.Out.Flush();
            var header=new byte[5];
            while(ReadPacket(input,header))
            {
                int length=BinaryPrimitives.ReadInt32BigEndian(header.AsSpan(1));
                if(length<0||length>65536)throw new InvalidDataException();
                var bytes=new byte[length];if(length>0&&!ReadPacket(input,bytes))throw new EndOfStreamException();
                if(header[0]==2&&length==0)break;
                if(header[0]==1){using var value=JsonDocument.Parse(bytes);float selected=value.RootElement.GetProperty("volume").GetSingle();if(!float.IsFinite(selected)||selected<0||selected>1)throw new InvalidDataException();output.Volume=selected;continue;}
                if(opus){
                    if(header[0]!=3||length<1||length>4096)throw new InvalidDataException();
                    int samples=decoder!.Decode(bytes.AsSpan(),decoded.AsSpan(),5760);
                    if(samples<1||samples>5760)throw new InvalidDataException();
                    bytes=new byte[samples*channels*2];Buffer.BlockCopy(decoded,0,bytes,0,bytes.Length);length=bytes.Length;
                }else if(header[0]!=0||length<1||length%format.BlockAlign!=0)throw new InvalidDataException();
                // Keep the newest sound after a scheduling pause instead of
                // playing a growing backlog of old microphone/music samples.
                if(queue.BufferedBytes>format.AverageBytesPerSecond*.16)queue.ClearBuffer();
                queue.AddSamples(bytes,0,length);
            }
            output.Stop();
        }
        catch(Exception)
        {
            Console.WriteLine(JsonSerializer.Serialize(new {type="error",error="PC audio output is unavailable. Check the Windows speakers or headphones, then reconnect."}));Console.Out.Flush();Environment.ExitCode=1;
        }
    }
}
