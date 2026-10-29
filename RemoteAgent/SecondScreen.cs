using System.Collections.Concurrent;
using System.Drawing;
using System.Runtime.InteropServices;
using System.Text.Json;
using System.Text;
using System.Windows.Forms;

internal sealed class SecondScreen : IDisposable
{
    [StructLayout(LayoutKind.Sequential,CharSet=CharSet.Unicode)]struct Device{public int size;[MarshalAs(UnmanagedType.ByValTStr,SizeConst=32)]public string name;[MarshalAs(UnmanagedType.ByValTStr,SizeConst=128)]public string description;public uint state;[MarshalAs(UnmanagedType.ByValTStr,SizeConst=128)]public string id;[MarshalAs(UnmanagedType.ByValTStr,SizeConst=128)]public string key;}
    [StructLayout(LayoutKind.Sequential,CharSet=CharSet.Unicode)]struct Mode{[MarshalAs(UnmanagedType.ByValTStr,SizeConst=32)]public string device;public ushort spec,driver,size,extra;public uint fields;public int x,y;public uint orientation,fixedOutput;public short color,duplex,yResolution,tt,collate;[MarshalAs(UnmanagedType.ByValTStr,SizeConst=32)]public string form;public ushort logPixels;public uint bits,width,height,flags,frequency,icmMethod,icmIntent,media,dither,reserved1,reserved2,panningWidth,panningHeight;}
    [StructLayout(LayoutKind.Sequential)]struct Rect{public int left,top,right,bottom;}
    delegate bool WindowCallback(IntPtr window,IntPtr data);
    [DllImport("user32.dll",CharSet=CharSet.Unicode)]static extern bool EnumDisplayDevices(string? device,uint index,ref Device result,uint flags);
    [DllImport("user32.dll",CharSet=CharSet.Unicode)]static extern bool EnumDisplaySettings(string name,int index,ref Mode mode);
    [DllImport("user32.dll",CharSet=CharSet.Unicode)]static extern int ChangeDisplaySettingsEx(string name,ref Mode mode,IntPtr window,uint flags,IntPtr data);
    [DllImport("user32.dll")]static extern bool GetCursorPos(out Point point);
    [DllImport("user32.dll")]static extern bool SetCursorPos(int x,int y);
    [DllImport("user32.dll")]static extern void mouse_event(uint flags,uint x,uint y,uint data,UIntPtr extra);
    [DllImport("user32.dll")]static extern bool EnumWindows(WindowCallback callback,IntPtr data);
    [DllImport("user32.dll")]static extern bool IsWindowVisible(IntPtr window);
    [DllImport("user32.dll")]static extern bool IsIconic(IntPtr window);
    [DllImport("user32.dll")]static extern bool GetWindowRect(IntPtr window,out Rect rect);
    [DllImport("user32.dll")]static extern bool SetWindowPos(IntPtr window,IntPtr insertAfter,int x,int y,int width,int height,uint flags);
    [DllImport("user32.dll",CharSet=CharSet.Unicode)]static extern int GetClassName(IntPtr window,StringBuilder name,int length);
    [DllImport("user32.dll",CharSet=CharSet.Unicode)]static extern int GetWindowTextLength(IntPtr window);
    [DllImport("user32.dll")]static extern bool SetProcessDpiAwarenessContext(IntPtr context);
    readonly ConcurrentQueue<string> commands=new();readonly System.Windows.Forms.Timer timer=new(){Interval=32};
    string deviceName="";Mode previous;Rectangle bounds;bool attached,previouslyAttached,mouseDown,disposed;long heartbeat=Environment.TickCount64,lastPointer;Point lastPoint;EdgeFileDrop? drop;
    static Mode EmptyMode()=>new(){size=(ushort)Marshal.SizeOf<Mode>()};
    static Device? FindDriver(){for(uint i=0;i<64;i++){var value=new Device{size=Marshal.SizeOf<Device>()};if(!EnumDisplayDevices(null,i,ref value,0))break;var name=value.description+" "+value.id;if(!name.Contains("MuMu",StringComparison.OrdinalIgnoreCase)&&(name.Contains("MttVDD",StringComparison.OrdinalIgnoreCase)||name.Contains("Virtual Display Driver",StringComparison.OrdinalIgnoreCase)))return value;}return null;}
    static void Publish(object value)=>Console.WriteLine(JsonSerializer.Serialize(value));
    internal static void Probe(){try{SetProcessDpiAwarenessContext(new IntPtr(-4));var driver=FindDriver();Publish(new{ok=true,installed=driver.HasValue,driver=driver?.description,screens=Screen.AllScreens.Select(screen=>new{name=screen.DeviceName,primary=screen.Primary,width=screen.Bounds.Width,height=screen.Bounds.Height}),setupUrl="https://github.com/VirtualDrivers/Virtual-Display-Driver"});}catch{Publish(new{ok=false,error="Windows display information is unavailable."});}}
    internal static void Run(){
        using var mutex=new Mutex(true,"Local\\EllesonConnectSecondScreen",out bool first);if(!first){Publish(new{kind="error",message="A phone second-screen session is already running."});return;}
        try{SetProcessDpiAwarenessContext(new IntPtr(-4));var line=Console.ReadLine()??"";if(line.Length>8192)throw new ArgumentException();using var config=JsonDocument.Parse(line);using var session=new SecondScreen();session.Start(config.RootElement);_ = Task.Run(()=>{try{while(Console.ReadLine() is string input){if(input.Length>8192||session.commands.Count>256)break;session.commands.Enqueue(input);}}catch{}finally{session.commands.Enqueue("{\"type\":\"stop\"}");}});Application.Run();}
        catch(Exception error){Publish(new{kind="error",message=error.Message});}
    }
    void Start(JsonElement config){
        var driver=FindDriver()??throw new InvalidOperationException("Install Virtual Display Driver on the PC, then choose Extend these displays in Windows Display settings.");
        deviceName=driver.name;previouslyAttached=(driver.state&1)!=0;if(Screen.PrimaryScreen?.DeviceName==deviceName)throw new InvalidOperationException("Keep the physical monitor primary before starting the phone's second screen.");
        previous=EmptyMode();if(!EnumDisplaySettings(deviceName,-1,ref previous)){previous=EmptyMode();if(!EnumDisplaySettings(deviceName,-2,ref previous))throw new InvalidOperationException("Open Windows Display settings and finish the virtual monitor setup first.");}
        var side=config.GetProperty("side").GetString()??"right";if(!PhoneDeskGeometry.ValidSide(side))throw new ArgumentException("Choose the phone's position.");
        int width=config.GetProperty("width").GetInt32(),height=config.GetProperty("height").GetInt32();if(width is <320 or >8192||height is <320 or >8192)throw new ArgumentException("Invalid phone display dimensions.");
        double aspect=width/(double)height,best=double.MaxValue;var mode=previous;
        for(int index=0;index<512;index++){var candidate=EmptyMode();if(!EnumDisplaySettings(deviceName,index,ref candidate))break;if(candidate.width<640||candidate.height<480||candidate.width>1920||candidate.height>1920||(long)candidate.width*candidate.height>2073600||candidate.frequency<30)continue;double score=Math.Abs(Math.Log(candidate.width/(double)candidate.height/aspect))*12+Math.Abs(Math.Log(candidate.width*(double)candidate.height/2073600));if(score<best){best=score;mode=candidate;}}
        if(best==double.MaxValue||mode.width<2||mode.height<2)throw new InvalidOperationException("No usable virtual display mode was found. Configure it in Windows Display settings first.");
        // Windows rotates an advertised mode rather than requiring a separate
        // portrait mode in the driver's list. Restore this orientation on exit.
        if((aspect<1)!=(mode.width<mode.height)){(mode.width,mode.height)=(mode.height,mode.width);mode.orientation=(mode.orientation+1)%4;}
        var primary=Screen.PrimaryScreen?.Bounds??throw new InvalidOperationException("The physical PC screen is unavailable.");
        mode.x=side=="left"?primary.Left-(int)mode.width:side=="right"?primary.Right:primary.Left;mode.y=side=="top"?primary.Top-(int)mode.height:side=="bottom"?primary.Bottom:primary.Top;mode.fields=0x20|0x80|0x40000|0x80000|0x100000|0x400000;
        if(ChangeDisplaySettingsEx(deviceName,ref mode,IntPtr.Zero,0,IntPtr.Zero)!=0)throw new InvalidOperationException("Windows could not extend the virtual display. Check its driver and display settings.");
        attached=true;bounds=new Rectangle(mode.x,mode.y,(int)mode.width,(int)mode.height);
        Publish(new{kind="ready",monitor=deviceName,width=bounds.Width,height=bounds.Height,side});
        drop=new EdgeFileDrop(side,paths=>Publish(new{kind="files",paths}),message=>Publish(new{kind="drop-error",message}));drop.Show();
        timer.Tick+=(_,_)=>Tick();timer.Start();
    }
    void Tick(){
        while(commands.TryDequeue(out var line))try{using var doc=JsonDocument.Parse(line);var item=doc.RootElement;switch(item.GetProperty("type").GetString()){
            case "heartbeat":heartbeat=Environment.TickCount64;break;
            case "stop":Application.ExitThread();return;
            case "recover":Recover();break;
            case "input":Input(item);break;
        }}catch{Application.ExitThread();return;}
        if(Environment.TickCount64-heartbeat>5000){Application.ExitThread();return;}
        if(GetCursorPos(out var point)&&(point!=lastPoint||Environment.TickCount64-lastPointer>1000)){lastPoint=point;lastPointer=Environment.TickCount64;Publish(new{kind="pointer",visible=bounds.Contains(point),x=Math.Clamp((point.X-bounds.Left)/(double)bounds.Width,0,1),y=Math.Clamp((point.Y-bounds.Top)/(double)bounds.Height,0,1)});}
    }
    void Input(JsonElement item){double x=item.GetProperty("x").GetDouble(),y=item.GetProperty("y").GetDouble();if(!double.IsFinite(x)||!double.IsFinite(y)||x<0||x>1||y<0||y>1)return;SetCursorPos(bounds.Left+(int)(x*(bounds.Width-1)),bounds.Top+(int)(y*(bounds.Height-1)));switch(item.GetProperty("action").GetString()){
        case "down":if(!mouseDown){mouseDown=true;mouse_event(2,0,0,0,UIntPtr.Zero);}break;
        case "up":if(mouseDown){mouseDown=false;mouse_event(4,0,0,0,UIntPtr.Zero);}break;
        case "right":mouse_event(8,0,0,0,UIntPtr.Zero);mouse_event(16,0,0,0,UIntPtr.Zero);break;
        case "wheel":int delta=item.GetProperty("delta").GetInt32();if(delta is >=-1200 and <=1200)mouse_event(0x800,0,0,unchecked((uint)delta),UIntPtr.Zero);break;
    }}
    void Recover(){var physical=Screen.PrimaryScreen?.WorkingArea??Rectangle.Empty;if(physical.IsEmpty)return;EnumWindows((window,_)=>{var kind=new StringBuilder(128);GetClassName(window,kind,kind.Capacity);if(kind.ToString() is "Progman" or "WorkerW" or "Shell_TrayWnd" or "Shell_SecondaryTrayWnd")return true;if(IsWindowVisible(window)&&!IsIconic(window)&&GetWindowTextLength(window)>0&&GetWindowRect(window,out var rect)&&bounds.Contains((rect.left+rect.right)/2,(rect.top+rect.bottom)/2))SetWindowPos(window,IntPtr.Zero,physical.Left+24,physical.Top+24,0,0,0x1|0x4|0x10);return true;},IntPtr.Zero);if(GetCursorPos(out var cursor)&&bounds.Contains(cursor))SetCursorPos(physical.Left+physical.Width/2,physical.Top+physical.Height/2);}
    public void Dispose(){if(disposed)return;disposed=true;timer.Stop();timer.Dispose();drop?.Dispose();if(mouseDown)mouse_event(4,0,0,0,UIntPtr.Zero);if(attached){Recover();var restore=previous;if(!previouslyAttached)restore.width=restore.height=0;restore.fields=0x20|0x80|0x40000|0x80000|0x100000|0x400000;ChangeDisplaySettingsEx(deviceName,ref restore,IntPtr.Zero,0,IntPtr.Zero);}}
}
