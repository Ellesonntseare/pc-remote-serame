using System.Buffers.Binary;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;
using System.Text.Json;
using System.Windows.Forms;

internal static class VideoFrames
{
    public static void Run()
    {
        try
        {
            using var input=new StreamReader(Console.OpenStandardInput());
            string raw=input.ReadLine()??"";if(raw.Length>2048)throw new ArgumentException("Invalid video configuration");
            using var config=JsonDocument.Parse(raw);int maximum=config.RootElement.GetProperty("width").GetInt32(),fps=config.RootElement.GetProperty("fps").GetInt32();
            if(maximum is <640 or >1920||fps is <5 or >60)throw new ArgumentException("Invalid video configuration");
            SetProcessDPIAware();using var window=config.RootElement.TryGetProperty("window",out var selection)?new WindowCapture(AppWindows.PresentationWindow(selection)):null;
            var monitor=config.RootElement.TryGetProperty("monitor",out var monitorSelection)?Screen.AllScreens.FirstOrDefault(display=>!display.Primary&&display.DeviceName==monitorSelection.GetString()):null;
            if(config.RootElement.TryGetProperty("monitor",out _)&&monitor==null)throw new InvalidOperationException("The phone's virtual display is no longer connected.");
            var bounds=window!=null?new Rectangle(Point.Empty,window.Size):monitor?.Bounds??Screen.PrimaryScreen?.Bounds??throw new InvalidOperationException("No primary monitor");
            double scale=Math.Min(1,monitor!=null?maximum/(double)Math.Max(bounds.Width,bounds.Height):Math.Min((double)maximum/bounds.Width,1080.0/bounds.Height));int width=Math.Max(2,(int)(bounds.Width*scale)/2*2),height=Math.Max(2,(int)(bounds.Height*scale)/2*2);
            using var capture=window==null?new DesktopCapture(bounds):null;using var source=window==null?new Bitmap(bounds.Width,bounds.Height,PixelFormat.Format32bppArgb):null;using var target=new Bitmap(width,height,PixelFormat.Format32bppArgb);using var graphics=Graphics.FromImage(target);graphics.InterpolationMode=InterpolationMode.Bilinear;graphics.CompositingMode=CompositingMode.SourceCopy;
            using var output=Console.OpenStandardOutput();byte[] header=new byte[12];BinaryPrimitives.WriteInt32BigEndian(header.AsSpan(0,4),width);BinaryPrimitives.WriteInt32BigEndian(header.AsSpan(4,4),height);BinaryPrimitives.WriteInt32BigEndian(header.AsSpan(8,4),fps);output.Write(header);output.Flush();
            int running=1;_ = Task.Run(()=>{try{while(input.ReadLine() is string line)if(line=="stop")break;}catch{}Interlocked.Exchange(ref running,0);});
            byte[] pixels=new byte[width*height*4];long period=Stopwatch.Frequency/fps;
            while(Volatile.Read(ref running)==1)
            {
                long started=Stopwatch.GetTimestamp();if(window!=null){if(!window.Capture(target)){Thread.Sleep(8);continue;}}else{if(!capture!.Capture(source!,true,out _)){Thread.Sleep(20);continue;}graphics.DrawImage(source!,new Rectangle(0,0,width,height));}
                var bits=target.LockBits(new Rectangle(0,0,width,height),ImageLockMode.ReadOnly,PixelFormat.Format32bppArgb);
                try{for(int y=0;y<height;y++)Marshal.Copy(bits.Scan0+y*bits.Stride,pixels,y*width*4,width*4);}finally{target.UnlockBits(bits);}
                output.Write(pixels);output.Flush();long left=period-(Stopwatch.GetTimestamp()-started);if(left>0)Thread.Sleep((int)(left*1000/Stopwatch.Frequency));
            }
        }
        catch(Exception error){Console.Error.WriteLine("Desktop video stopped: "+error.Message);Environment.ExitCode=1;}
    }
    [DllImport("user32.dll")]private static extern bool SetProcessDPIAware();
}
