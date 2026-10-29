using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;
using System.Text.Json;
using System.Windows.Forms;

internal static class PrivacyDisplay
{
    [DllImport("user32.dll", SetLastError = true)] private static extern bool SetWindowDisplayAffinity(IntPtr window, uint affinity);
    [DllImport("user32.dll")] private static extern bool RegisterHotKey(IntPtr window, int id, uint modifiers, uint key);
    [DllImport("user32.dll")] private static extern bool UnregisterHotKey(IntPtr window, int id);
    [DllImport("user32.dll")] private static extern bool SetLayeredWindowAttributes(IntPtr window, uint color, byte alpha, uint flags);
    [DllImport("user32.dll")] private static extern IntPtr WindowFromPoint(Point point);
    private sealed class Cover : Form
    {
        public Cover(Rectangle bounds) { Bounds=bounds; StartPosition=FormStartPosition.Manual; FormBorderStyle=FormBorderStyle.None; BackColor=Color.Black; ShowInTaskbar=false; TopMost=true; }
        protected override bool ShowWithoutActivation => true;
        protected override CreateParams CreateParams { get { var value=base.CreateParams;value.ExStyle|=0x08000000|0x20|0x80|0x80000;return value;} }
        protected override void WndProc(ref Message message) { if(message.Msg==0x312)Application.ExitThread();base.WndProc(ref message); }
        protected override void OnPaint(PaintEventArgs e) { base.OnPaint(e);TextRenderer.DrawText(e.Graphics,"Elleson Connect · Privacy mode\nRestore displays: Ctrl + Alt + Shift + P",SystemFonts.MessageBoxFont,new Rectangle(20,20,Width-40,75),Color.FromArgb(70,80,90),TextFormatFlags.HorizontalCenter); }
    }
    public static void Run()
    {
        if(!OperatingSystem.IsWindowsVersionAtLeast(10,0,19041)) { Console.WriteLine("{\"ok\":false,\"error\":\"Privacy mode requires Windows 10 version 2004 or newer.\"}");return; }
        var covers=new List<Cover>();long last=Environment.TickCount64;bool closing=false;
        try
        {
            Application.SetHighDpiMode(HighDpiMode.SystemAware);
            var bounds=Screen.PrimaryScreen?.Bounds??throw new InvalidOperationException("No physical display is available.");
            using var before=new Bitmap(bounds.Width,bounds.Height,PixelFormat.Format32bppArgb);
            using(var capture=new DesktopCapture(bounds)) { if(!capture.Capture(before,true,out _))throw new InvalidOperationException("The PC screen is unavailable."); }
            foreach(var display in Screen.AllScreens)
            {
                var cover=new Cover(display.Bounds);covers.Add(cover);cover.Show();
                if(!SetLayeredWindowAttributes(cover.Handle,0,255,2))throw new InvalidOperationException("The privacy cover could not pass through PC input.");
                if(!SetWindowDisplayAffinity(cover.Handle,0x11))throw new InvalidOperationException("Windows could not exclude the privacy cover from screen capture.");
            }
            var handles=covers.Select(cover=>cover.Handle).ToHashSet();var first=covers[0];var restoreHandle=first.Handle;if(!RegisterHotKey(restoreHandle,1,0x4000|1|2|4,0x50))throw new InvalidOperationException("The display restore shortcut is unavailable.");
            void Stop(){if(closing)return;closing=true;Application.ExitThread();}
            using var watchdog=new System.Windows.Forms.Timer { Interval=1000 };watchdog.Tick+=(_,_)=>{if(Environment.TickCount64-Interlocked.Read(ref last)>45000)Stop();};watchdog.Start();
            _=Task.Run(()=>{try{string? line;while((line=Console.ReadLine())!=null){if(line=="stop")break;if(line=="keepalive")Interlocked.Exchange(ref last,Environment.TickCount64);}}finally{try{first.BeginInvoke((Action)Stop);}catch{}}});
            _=Task.Run(async()=>
            {
                try
                {
                    await Task.Delay(250);if(handles.Contains(WindowFromPoint(new Point(bounds.Left+bounds.Width/2,bounds.Top+bounds.Height/2))))throw new InvalidOperationException("The privacy cover would block PC input. Displays restored.");using var after=new Bitmap(bounds.Width,bounds.Height,PixelFormat.Format32bppArgb);using var capture=new DesktopCapture(bounds);
                    bool pixels=false;for(int attempt=0;attempt<8&&!pixels;attempt++){pixels=capture.Capture(after,true,out _);if(!pixels)await Task.Delay(50);}
                    int tested=0,matched=0;
                    for(int y=1;y<12;y++)for(int x=1;x<16;x++){var a=before.GetPixel(x*bounds.Width/16,y*bounds.Height/12);if(a.R+a.G+a.B<75)continue;tested++;var b=after.GetPixel(x*bounds.Width/16,y*bounds.Height/12);if(Math.Abs(a.R-b.R)+Math.Abs(a.G-b.G)+Math.Abs(a.B-b.B)<100)matched++;}
                    if(!pixels||tested<5||matched<tested*.55)throw new InvalidOperationException("This capture engine cannot keep the PC view visible in Privacy mode. Displays restored.");
                    Console.WriteLine("{\"ok\":true,\"active\":true}");Console.Out.Flush();
                }
                catch(Exception error){Console.WriteLine(JsonSerializer.Serialize(new {ok=false,error=error.Message}));try{first.BeginInvoke((Action)Stop);}catch{}}
            });
            Application.Run();UnregisterHotKey(restoreHandle,1);
        }
        catch(Exception error){Console.WriteLine(JsonSerializer.Serialize(new {ok=false,error=error.Message}));}
        finally{foreach(var cover in covers)cover.Dispose();Console.WriteLine("{\"active\":false}");Console.Out.Flush();}
    }
}
