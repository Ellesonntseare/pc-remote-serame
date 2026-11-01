using System.Drawing;
using System.Runtime.InteropServices;
using System.Text.Json;
using System.Windows.Forms;

internal static class WindowControl
{
    [StructLayout(LayoutKind.Sequential)] struct Rect {public int Left,Top,Right,Bottom;}
    [DllImport("user32.dll")] static extern IntPtr WindowFromPoint(Point p);
    [DllImport("user32.dll")] static extern IntPtr GetAncestor(IntPtr w,uint flags);
    [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
    [DllImport("dwmapi.dll")] static extern int DwmGetWindowAttribute(IntPtr w,int attr,out Rect r,int size);
    [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr w,out Rect r);
    public static void Run()
    {
        try
        {
            Native.SetProcessDPIAware();string raw=Console.In.ReadToEnd();if(raw.Length>16384)throw new ArgumentException("App input is too large.");
            using var doc=JsonDocument.Parse(raw);var root=doc.RootElement;var window=AppWindows.PresentationWindow(root.GetProperty("selection"));var action=root.GetProperty("action").GetString();
            if(action is not ("tap" or "right" or "double" or "wheel" or "text" or "key" or "drag"))throw new ArgumentException("Invalid app input.");
            // Focus must succeed before any input; never click through an app to another process.
            AppWindows.Focus(window);
            void Send(uint flags,int x=0,int y=0,uint data=0){if(GetForegroundWindow()!=window)throw new InvalidOperationException("The app changed focus. Choose it again or close its popup on the PC.");var batch=new[]{new Native.INPUT{type=0,U=new Native.INPUTUNION{mi=new Native.MOUSEINPUT{dx=x,dy=y,dwFlags=flags,mouseData=data}}}};if(Native.SendInput(1,batch,Marshal.SizeOf<Native.INPUT>())!=1)throw new InvalidOperationException("Windows blocked app input. Check the PC for a permission prompt.");}
            void Move(JsonElement value){double x=value.GetProperty("x").GetDouble(),y=value.GetProperty("y").GetDouble();if(!double.IsFinite(x)||!double.IsFinite(y)||x<0||x>1||y<0||y>1)throw new ArgumentException("Invalid app coordinates.");if(DwmGetWindowAttribute(window,9,out var r,Marshal.SizeOf<Rect>())!=0&&!GetWindowRect(window,out r))throw new InvalidOperationException("The app bounds are unavailable.");var point=new Point(r.Left+(int)Math.Round(x*(r.Right-r.Left-1)),r.Top+(int)Math.Round(y*(r.Bottom-r.Top-1)));if(GetAncestor(WindowFromPoint(point),2)!=window)throw new InvalidOperationException("A popup covers this app. Close it or use the full Remote screen.");var desktop=SystemInformation.VirtualScreen;Send(0xC001,(int)Math.Clamp(((long)(point.X-desktop.Left)*65536+32768)/desktop.Width,0,65535),(int)Math.Clamp(((long)(point.Y-desktop.Top)*65536+32768)/desktop.Height,0,65535));}
            if(action is "text" or "key")
            {
                var batch=new List<Native.INPUT>();void Key(ushort key,ushort scan,uint flags){batch.Add(new Native.INPUT{type=1,U=new Native.INPUTUNION{ki=new Native.KEYBDINPUT{wVk=key,wScan=scan,dwFlags=flags}}});}
                if(action=="text"){string text=root.GetProperty("text").GetString()??"";if(text.Length>2000||text.Contains('\0'))throw new ArgumentException("Text is too long.");foreach(char c in text){Key(0,c,4);Key(0,c,6);}}
                else{int key=root.GetProperty("key").GetInt32();if(key is not (8 or 9 or 13 or 27 or 37 or 38 or 39 or 40 or 46))throw new ArgumentException("Invalid app key.");Key((ushort)key,0,0);Key((ushort)key,0,2);}
                if(GetForegroundWindow()!=window||batch.Count>0&&Native.SendInput((uint)batch.Count,batch.ToArray(),Marshal.SizeOf<Native.INPUT>())!=batch.Count)throw new InvalidOperationException("Windows blocked typing in this app.");
            }
            else if(action=="drag")
            {
                var points=root.GetProperty("points");if(points.GetArrayLength()<2||points.GetArrayLength()>32)throw new ArgumentException("Invalid drag.");Move(points[0]);Send(2);try{foreach(var point in points.EnumerateArray()){Move(point);Thread.Sleep(12);}}finally{var up=new[]{new Native.INPUT{type=0,U=new Native.INPUTUNION{mi=new Native.MOUSEINPUT{dwFlags=4}}}};Native.SendInput(1,up,Marshal.SizeOf<Native.INPUT>());}
            }
            else{Move(root);if(action=="wheel"){int delta=root.GetProperty("delta").GetInt32();if(Math.Abs((long)delta)>1200)throw new ArgumentException("Invalid scroll.");Send(0x800,data:unchecked((uint)delta));}else{uint down=action=="right"?8u:2u,up=action=="right"?16u:4u;Send(down);Send(up);if(action=="double"){Thread.Sleep(60);Send(down);Send(up);}}}
            Console.WriteLine("{\"ok\":true}");
        }
        catch(Exception e){Console.WriteLine(JsonSerializer.Serialize(new{ok=false,error=e.Message}));Environment.ExitCode=1;}
    }
}
