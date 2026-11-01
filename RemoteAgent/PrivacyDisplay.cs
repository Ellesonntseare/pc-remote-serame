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
    private static readonly string CaptureSignal = @"Local\EllesonConnect.PrivacyCapture." + System.Diagnostics.Process.GetCurrentProcess().SessionId;
    public static bool CaptureRequested { get { if(!Mutex.TryOpenExisting(CaptureSignal,out var signal))return false;using(signal)return true; } }
    [DllImport("user32.dll")] private static extern bool ShowWindow(IntPtr window, int command);
    [DllImport("dwmapi.dll")] private static extern int DwmFlush();
    private sealed class Probe : Form
    {
        public Probe(Rectangle bounds){StartPosition=FormStartPosition.Manual;FormBorderStyle=FormBorderStyle.None;ShowInTaskbar=false;TopMost=true;BackColor=Color.Magenta;Bounds=new Rectangle(bounds.Left+bounds.Width/2-48,bounds.Top+bounds.Height/2-48,96,96);}
        protected override bool ShowWithoutActivation => true;
        protected override CreateParams CreateParams {get{var value=base.CreateParams;value.ExStyle|=0x08000000|0x80;return value;}}
    }
    private sealed class Cover : Form
    {
        public Cover(Rectangle bounds) { StartPosition=FormStartPosition.Manual; FormBorderStyle=FormBorderStyle.None; BackColor=Color.Black; ShowInTaskbar=false; TopMost=true; Bounds=bounds; }
        protected override bool ShowWithoutActivation => true;
        protected override CreateParams CreateParams { get { var value=base.CreateParams;value.ExStyle|=0x08000000|0x20|0x80|0x80000;return value;} }
        protected override void WndProc(ref Message message) { if(message.Msg==0x312)Application.ExitThread();base.WndProc(ref message); }
        protected override void OnPaint(PaintEventArgs e) { base.OnPaint(e);TextRenderer.DrawText(e.Graphics,"Elleson Connect · Privacy mode\nRestore displays: Ctrl + Alt + Shift + P",SystemFonts.MessageBoxFont,new Rectangle(20,20,Width-40,75),Color.FromArgb(70,80,90),TextFormatFlags.HorizontalCenter); }
    }
    public static void Run()
    {
        if(!OperatingSystem.IsWindowsVersionAtLeast(10,0,19041)) { Console.WriteLine("{\"ok\":false,\"error\":\"Privacy mode requires Windows 10 version 2004 or newer.\"}");return; }
        var covers=new List<Cover>();Mutex? captureSignal=null;Probe? probe=null;long last=Environment.TickCount64;bool closing=false;
        try
        {
            Application.SetHighDpiMode(HighDpiMode.SystemAware);
            var bounds=Screen.PrimaryScreen?.Bounds??throw new InvalidOperationException("No physical display is available.");
            // A known patch avoids rejecting dark desktops or changing video content.
            // Explicit show also handles hosts launched with a hidden startup window.
            probe=new Probe(bounds);probe.Show();ShowWindow(probe.Handle,4);probe.Refresh();DwmFlush();
            captureSignal=new Mutex(false,CaptureSignal);
            foreach(var display in Screen.AllScreens)
            {
                var cover=new Cover(display.Bounds);covers.Add(cover);cover.Show();ShowWindow(cover.Handle,4);
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
                    bool Verified(Color expected)
                    {
                        int matched=0;
                        for(int y=-24;y<=24;y+=24)for(int x=-24;x<=24;x+=24){var pixel=after.GetPixel(bounds.Width/2+x,bounds.Height/2+y);if(Math.Abs(pixel.R-expected.R)+Math.Abs(pixel.G-expected.G)+Math.Abs(pixel.B-expected.B)<90)matched++;}
                        return matched>=8;
                    }
                    async Task Verify(Color expected)
                    {
                        for(int attempt=0;attempt<40;attempt++){if(capture.Capture(after,true,out _)&&Verified(expected))return;await Task.Delay(50);}
                        throw new InvalidOperationException("Windows could not capture the desktop behind the privacy cover. Displays restored.");
                    }
                    await Verify(Color.Magenta);
                    // A second color proves frames are live, rather than a stale pre-cover image.
                    first.Invoke((Action)(()=>{probe.BackColor=Color.Lime;probe.Refresh();}));
                    await Verify(Color.Lime);
                    first.Invoke((Action)(()=>{probe.Close();probe=null;}));
                    Console.WriteLine("{\"ok\":true,\"active\":true}");Console.Out.Flush();
                }
                catch(Exception error){Console.WriteLine(JsonSerializer.Serialize(new {ok=false,error=error.Message}));try{first.BeginInvoke((Action)Stop);}catch{}}
            });
            Application.Run();UnregisterHotKey(restoreHandle,1);
        }
        catch(Exception error){Console.WriteLine(JsonSerializer.Serialize(new {ok=false,error=error.Message}));}
        finally{foreach(var cover in covers)cover.Dispose();probe?.Dispose();captureSignal?.Dispose();Console.WriteLine("{\"active\":false}");Console.Out.Flush();}
    }
}
