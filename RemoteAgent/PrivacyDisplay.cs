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
    [DllImport("user32.dll")] private static extern IntPtr MonitorFromPoint(Point point, uint flags);
    [DllImport("user32.dll")] private static extern bool IsWindowVisible(IntPtr window);
    [DllImport("user32.dll")] private static extern IntPtr GetWindow(IntPtr window, uint command);
    [DllImport("user32.dll",SetLastError=true)] private static extern bool SetWindowPos(IntPtr window,IntPtr after,int x,int y,int width,int height,uint flags);
    private static readonly IntPtr Topmost = new(-1);
    private const uint KeepGeometry = 0x1 | 0x2 | 0x10;

    private static bool IsBehind(IntPtr window, IntPtr cover)
    {
        // GW_HWNDPREV walks toward the top of the Z order.
        for (var above = GetWindow(window, 3); above != IntPtr.Zero; above = GetWindow(above, 3))
            if (above == cover) return true;
        return false;
    }
    private sealed class Probe : Form
    {
        public Probe(Rectangle bounds){AutoScaleMode=AutoScaleMode.None;StartPosition=FormStartPosition.Manual;FormBorderStyle=FormBorderStyle.None;ShowInTaskbar=false;TopMost=true;BackColor=Color.Black;Bounds=new Rectangle(bounds.Left+bounds.Width/2-48,bounds.Top+bounds.Height/2-48,96,96);}
        protected override bool ShowWithoutActivation => true;
        protected override CreateParams CreateParams {get{var value=base.CreateParams;value.ExStyle|=0x08000000|0x80;return value;}}
    }
    private sealed class Cover : Form
    {
        public Cover(Rectangle bounds) { AutoScaleMode=AutoScaleMode.None;StartPosition=FormStartPosition.Manual;FormBorderStyle=FormBorderStyle.None;BackColor=Color.Black;ShowInTaskbar=false;TopMost=true;Bounds=bounds;SetStyle(ControlStyles.UserPaint|ControlStyles.AllPaintingInWmPaint|ControlStyles.OptimizedDoubleBuffer|ControlStyles.Opaque,true); }
        protected override bool ShowWithoutActivation => true;
        protected override CreateParams CreateParams { get { var value=base.CreateParams;value.ExStyle|=0x08000000|0x20|0x80|0x80000;return value;} }
        protected override void WndProc(ref Message message) { if(message.Msg==0x312)Application.ExitThread();base.WndProc(ref message); }
        protected override void OnPaintBackground(PaintEventArgs e) => e.Graphics.Clear(Color.Black);
        protected override void OnPaint(PaintEventArgs e) => e.Graphics.Clear(Color.Black);
    }
    public static void Run()
    {
        if(!OperatingSystem.IsWindowsVersionAtLeast(10,0,19041)) { Console.WriteLine("{\"ok\":false,\"error\":\"Privacy mode requires Windows 10 version 2004 or newer.\"}");return; }
        var covers=new List<Cover>();Mutex? captureSignal=null;Probe? probe=null;WindowCapture? capture=null;using var localCursor=new PrivacyCursor();long last=Environment.TickCount64;bool closing=false;
        string stage="initialization";object? failure=null;
        try
        {
            Application.SetHighDpiMode(HighDpiMode.PerMonitorV2);
            var bounds=Screen.PrimaryScreen?.Bounds??throw new InvalidOperationException("No physical display is available.");
            // Warm the compositor capture while the desktop is still visible.
            // Starting WGC after an opaque cover is shown can leave the underlying
            // windows occlusion-throttled before the first captured frame.
            var monitor=MonitorFromPoint(new Point(bounds.Left+bounds.Width/2,bounds.Top+bounds.Height/2),2);
            // This verifier must ignore the cursor: an enlarged pointer over the
            // test patch is not a failure of display exclusion. Stream captures
            // continue to include the cursor.
            capture=new WindowCapture(monitor,monitor:true,captureCursor:false);
            using var after=new Bitmap(capture.Size.Width,capture.Size.Height,PixelFormat.Format32bppArgb);
            // Show a black patch after capture starts so an idle desktop also
            // gets a compositor update. Its colour is verified under the cover.
            probe=new Probe(bounds);probe.Show();ShowWindow(probe.Handle,4);
            SetWindowPos(probe.Handle,Topmost,0,0,0,0,KeepGeometry|0x40);probe.Refresh();DwmFlush();
            int Matched(Color expected)
            {
                var patch=probe!.RectangleToScreen(probe.ClientRectangle);
                int cx=patch.Left+patch.Width/2-bounds.Left,cy=patch.Top+patch.Height/2-bounds.Top,matched=0;
                for(int y=-24;y<=24;y+=24)for(int x=-24;x<=24;x+=24)
                {
                    int px=cx+x,py=cy+y;if(px<0||py<0||px>=after.Width||py>=after.Height)continue;
                    var pixel=after.GetPixel(px,py);
                    if(Math.Abs(pixel.R-expected.R)+Math.Abs(pixel.G-expected.G)+Math.Abs(pixel.B-expected.B)<90)matched++;
                }
                return matched;
            }
            // Run warmup inside the normal Windows message loop. The first WGC
            // frame may predate the marker's paint; covering it at that point can
            // leave it occluded before DWM has ever composited the marker.
            stage="capture-warmup";
            foreach(var display in Screen.AllScreens)covers.Add(new Cover(display.Bounds));
            var primaryCover = covers.Single(cover => cover.Bounds == bounds);
            var first=covers[0];var restoreHandle=first.Handle;
            if(!RegisterHotKey(restoreHandle,1,0x4000|1|2|4,0x50))throw new InvalidOperationException("The display restore shortcut is unavailable.");
            void Stop(){if(closing)return;closing=true;Application.ExitThread();}
            using var watchdog=new System.Windows.Forms.Timer { Interval=500 };watchdog.Tick+=(_,_)=>{
                if(Environment.TickCount64-Interlocked.Read(ref last)>45000){Stop();return;}
                if(!covers.Any(cover=>cover.Visible))return;
                try{localCursor.Hide();foreach(var cover in covers)SetWindowPos(cover.Handle,new IntPtr(-1),0,0,0,0,0x1|0x2|0x10|0x200);}
                catch(Exception error){failure=new{ok=false,error=error.Message,diagnostic=new{stage="cursor-privacy",displayRestored=true}};Stop();}
            };watchdog.Start();
            _=Task.Run(()=>{try{string? line;while((line=Console.ReadLine())!=null){if(line=="stop")break;if(line=="keepalive")Interlocked.Exchange(ref last,Environment.TickCount64);}}finally{try{first.BeginInvoke((Action)Stop);}catch{}}});
            // Keep frame acquisition, D3D immediate-context access and probe
            // painting on this UI thread, including teardown. Do not resume a
            // capture created on the STA across arbitrary thread-pool threads.
            PrivacyCaptureVerification? verifier=null;
            var handles=new HashSet<IntPtr>();long warmupDeadline=Environment.TickCount64+2500;bool warmupRestarted=false;
            using var verification=new System.Windows.Forms.Timer { Interval=50 };
            verification.Tick+=(_,_)=>
            {
                if(closing)return;
                int matched=0;
                try
                {
                    if(verifier==null)
                    {
                        stage="capture-warmup";
                        // A live frame is sufficient to warm WGC. Requiring black
                        // pixels here falsely rejects working capture when a
                        // foreground window or transition covers the warmup patch.
                        if(!capture!.Capture(after)||!capture.FrameChanged)
                        {
                            if(Environment.TickCount64<warmupDeadline)return;
                            if(warmupRestarted)throw new InvalidOperationException("Windows could not start desktop capture before the privacy cover was shown. Displays restored.");
                            warmupRestarted=true;warmupDeadline=Environment.TickCount64+2500;
                            capture.Dispose();capture=new WindowCapture(monitor,monitor:true,captureCursor:false);
                            SetWindowPos(probe!.Handle,Topmost,0,0,0,0,KeepGeometry|0x40);probe.Invalidate();probe.Refresh();DwmFlush();return;
                        }
                        stage="cover-setup";
                        captureSignal=new Mutex(false,CaptureSignal);
                        foreach(var cover in covers)
                        {
                            if(!SetLayeredWindowAttributes(cover.Handle,0,255,2))throw new InvalidOperationException("The privacy cover could not pass through PC input.");
                            if(!SetWindowDisplayAffinity(cover.Handle,0x11))throw new InvalidOperationException("Windows could not exclude the privacy cover from screen capture.");
                            cover.Show();ShowWindow(cover.Handle,4);cover.Refresh();
                            handles.Add(cover.Handle);
                        }
                        stage="cursor-privacy";localCursor.Hide();DwmFlush();
                        if(!SetWindowPos(probe!.Handle,primaryCover.Handle,0,0,0,0,KeepGeometry)||!IsBehind(probe.Handle,primaryCover.Handle))
                            throw new InvalidOperationException("Windows could not position the capture check behind the privacy cover. Displays restored.");
                        probe.BackColor=Color.Magenta;probe.Invalidate();probe.Refresh();DwmFlush();
                        verifier=new PrivacyCaptureVerification(Environment.TickCount64);return;
                    }
                    stage="input-passthrough";
                    if(handles.Contains(WindowFromPoint(new Point(bounds.Left+bounds.Width/2,bounds.Top+bounds.Height/2))))throw new InvalidOperationException("The privacy cover would block PC input. Displays restored.");
                    stage=verifier.Stage;matched=capture!.Capture(after)&&capture.FrameChanged?Matched(verifier.LivePhase?Color.Lime:Color.Magenta):0;
                    switch(verifier.Observe(Environment.TickCount64,matched>=8))
                    {
                        case PrivacyCaptureVerification.Action.ChangeProbe:
                            probe!.BackColor=Color.Lime;probe.Invalidate();probe.Refresh();DwmFlush();break;
                        case PrivacyCaptureVerification.Action.RestartCapture:
                            Console.Error.WriteLine(JsonSerializer.Serialize(new {stage=verifier.Stage,action="restart",matched}));
                            capture.Dispose();capture=new WindowCapture(monitor,monitor:true,captureCursor:false);break;
                        case PrivacyCaptureVerification.Action.Complete:
                            verification.Stop();probe!.Close();probe=null;
                            Console.Error.WriteLine(JsonSerializer.Serialize(new {stage="verified",restarts=verifier.Restarts}));
                            Console.WriteLine("{\"ok\":true,\"active\":true}");Console.Out.Flush();break;
                        case PrivacyCaptureVerification.Action.Fail:
                            Console.Error.WriteLine(JsonSerializer.Serialize(new {stage=verifier.Stage,action="failed",matched}));
                            throw new InvalidOperationException("Windows could not verify "+(verifier.LivePhase?"live updates":"the desktop")+" behind the privacy cover after restarting capture. Displays restored.");
                    }
                }
                catch(Exception error){verification.Stop();failure=new {ok=false,error=error.Message,diagnostic=new {stage,matched,required=8,samples=9,restarts=(verifier?.Restarts??0)+(warmupRestarted?1:0),hresult=$"0x{error.HResult:X8}",probeVisible=probe!=null&&IsWindowVisible(probe.Handle),probeBounds=probe==null?null:new[]{probe.Left,probe.Top,probe.Width,probe.Height},captureSize=capture==null?null:new[]{capture.Size.Width,capture.Size.Height},displayRestored=true}};Stop();}
            };
            verification.Start();
            Application.Run();UnregisterHotKey(restoreHandle,1);
        }
        catch(Exception error){failure=new {ok=false,error=error.Message,diagnostic=new {stage,hresult=$"0x{error.HResult:X8}",displayRestored=true}};}
        finally{capture?.Dispose();probe?.Dispose();foreach(var cover in covers)cover.Dispose();localCursor.Dispose();captureSignal?.Dispose();if(failure!=null)Console.WriteLine(JsonSerializer.Serialize(failure));Console.WriteLine("{\"active\":false}");Console.Out.Flush();}
    }
}
