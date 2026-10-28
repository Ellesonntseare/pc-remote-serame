using System.Collections.Concurrent;
using System.Drawing;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.Json;
using System.Windows.Forms;

// No hook is installed until an approved phone session starts this process.
// Keyboard text leaves this process only while the pointer is on that phone.
internal sealed class PhoneHandoff : NativeWindow, IDisposable
{
    readonly BlockingCollection<object> output=new(256);
    readonly ConcurrentQueue<string> commands=new();
    readonly Hook mouseHook,keyboardHook;
    readonly System.Windows.Forms.Timer clock=new(){Interval=32};
    IntPtr mouseHandle,keyboardHandle;
    bool active,armed=true,leftDown,disposed,dirty;string side="right";
    int width=1080,height=2400;double sensitivity=1,x=.5,y=.5;
    long heartbeat=Environment.TickCount64,edgeAt,lastPointAt,cooldown;
    Rectangle screen;Point parked;
    readonly byte[] keys=new byte[256];
    delegate IntPtr Hook(int code,IntPtr message,IntPtr data);
    [StructLayout(LayoutKind.Sequential)]struct MouseData{public Point point;public uint data,flags,time;public UIntPtr extra;}
    [StructLayout(LayoutKind.Sequential)]struct KeyData{public uint key,scan,flags,time;public UIntPtr extra;}
    [StructLayout(LayoutKind.Sequential)]struct RawDevice{public ushort page,usage;public uint flags;public IntPtr target;}
    [DllImport("user32.dll")]static extern IntPtr SetWindowsHookEx(int type,Hook callback,IntPtr module,uint thread);
    [DllImport("user32.dll")]static extern bool UnhookWindowsHookEx(IntPtr hook);
    [DllImport("user32.dll")]static extern IntPtr CallNextHookEx(IntPtr hook,int code,IntPtr message,IntPtr data);
    [DllImport("kernel32.dll",CharSet=CharSet.Unicode)]static extern IntPtr GetModuleHandle(string? module);
    [DllImport("user32.dll")]static extern bool RegisterRawInputDevices(RawDevice[] devices,uint count,uint size);
    [DllImport("user32.dll")]static extern uint GetRawInputData(IntPtr input,uint command,IntPtr data,ref uint size,uint headerSize);
    [DllImport("user32.dll")]static extern short GetAsyncKeyState(int key);
    [DllImport("user32.dll")]static extern short GetKeyState(int key);
    [DllImport("user32.dll")]static extern bool GetCursorPos(out Point point);
    [DllImport("user32.dll")]static extern bool SetCursorPos(int x,int y);
    [DllImport("user32.dll")]static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")]static extern uint GetWindowThreadProcessId(IntPtr window,IntPtr pid);
    [DllImport("user32.dll")]static extern IntPtr GetKeyboardLayout(uint thread);
    [DllImport("user32.dll",CharSet=CharSet.Unicode)]static extern int ToUnicodeEx(uint key,uint scan,byte[] state,StringBuilder text,int length,uint flags,IntPtr layout);
    [DllImport("user32.dll")]static extern bool SetProcessDpiAwarenessContext(IntPtr context);
    internal static void Run(){
        SetProcessDpiAwarenessContext(new IntPtr(-4));
        using var input=new StreamReader(Console.OpenStandardInput(),new UTF8Encoding(false,true));
        var initial=input.ReadLine();if(initial==null||initial.Length>2048)return;
        try{
            using var current=new PhoneHandoff(initial);
            var writer=new Thread(()=>{try{foreach(var item in current.output.GetConsumingEnumerable())Console.WriteLine(JsonSerializer.Serialize(item));}catch{current.commands.Enqueue("{\"type\":\"stop\"}");}}){IsBackground=true,Name="Phone mouse output"};writer.Start();
            var reader=new Thread(()=>{try{string? line;while((line=input.ReadLine())!=null){if(line.Length>2048)break;current.commands.Enqueue(line);}}catch{}finally{current.commands.Enqueue("{\"type\":\"stop\"}");}}){IsBackground=true,Name="Phone mouse lease"};reader.Start();
            current.Publish(new{kind="state",state="armed",side=current.side});Application.Run();
        }catch{Console.WriteLine("{\"kind\":\"error\",\"message\":\"Windows mouse handoff could not start.\"}");Environment.ExitCode=1;}
    }
    PhoneHandoff(string initial){
        using(var value=JsonDocument.Parse(initial))Configure(value.RootElement);
        CreateHandle(new CreateParams{Caption="PC Remote phone mouse",Parent=new IntPtr(-3)});
        mouseHook=Mouse;keyboardHook=Keyboard;
        var module=GetModuleHandle(null);mouseHandle=SetWindowsHookEx(14,mouseHook,module,0);keyboardHandle=SetWindowsHookEx(13,keyboardHook,module,0);
        if(mouseHandle==IntPtr.Zero||keyboardHandle==IntPtr.Zero){Dispose();throw new InvalidOperationException();}
        if(!RegisterRawInputDevices([new RawDevice{page=1,usage=2,flags=0x100,target=Handle}],1,(uint)Marshal.SizeOf<RawDevice>())){Dispose();throw new InvalidOperationException();}
        clock.Tick+=(_,_)=>Tick();clock.Start();
    }
    void Configure(JsonElement value){
        var next=value.GetProperty("side").GetString()??"";if(!PhoneDeskGeometry.ValidSide(next))throw new ArgumentException();
        var w=value.GetProperty("width").GetInt32();var h=value.GetProperty("height").GetInt32();var speed=value.GetProperty("sensitivity").GetDouble();
        if(w<2||h<2||w>16384||h>16384||!double.IsFinite(speed)||speed<.3||speed>3)throw new ArgumentException();
        if(side!=next&&active)Release();side=next;width=w;height=h;sensitivity=speed;heartbeat=Environment.TickCount64;
    }
    void Publish(object value){if(!disposed&&!output.TryAdd(value)){Release(false);armed=false;commands.Enqueue("{\"type\":\"stop\"}");}}
    void Release(bool announce=true){
        if(!active)return;active=false;leftDown=false;dirty=false;Array.Clear(keys);cooldown=Environment.TickCount64+500;
        var point=PhoneDeskGeometry.Return(screen,x,y,side);SetCursorPos(point.X,point.Y);
        if(announce)Publish(new{kind="state",state="armed",side});
    }
    void Capture(Point point){
        if(!armed||active||Environment.TickCount64<cooldown||new[]{1,2,4,16,17,18,91,92}.Any(k=>(GetAsyncKeyState(k)&0x8000)!=0))return;
        screen=Screen.FromPoint(point).Bounds;var beyond=side switch{"left"=>new Point(screen.Left-1,point.Y),"right"=>new Point(screen.Right,point.Y),"top"=>new Point(point.X,screen.Top-1),_=>new Point(point.X,screen.Bottom)};
        if(Screen.AllScreens.Any(display=>display.Bounds.Contains(beyond)))return;
        (x,y)=PhoneDeskGeometry.Enter(screen,point,side);parked=point;Array.Clear(keys);keys[20]=(byte)(GetKeyState(20)&1);active=true;dirty=true;
        Publish(new{kind="state",state="active",side});
    }
    IntPtr Mouse(int code,IntPtr message,IntPtr address){
        if(code<0)return CallNextHookEx(mouseHandle,code,message,address);
        var data=Marshal.PtrToStructure<MouseData>(address);if((data.flags&1)!=0)return CallNextHookEx(mouseHandle,code,message,address);
        int type=message.ToInt32();
        if(!active){
            if(type==0x200){var bounds=Screen.FromPoint(data.point).Bounds;if(armed&&PhoneDeskGeometry.AtEdge(bounds,data.point,side)){if(edgeAt==0)edgeAt=Environment.TickCount64;}else edgeAt=0;}
            return CallNextHookEx(mouseHandle,code,message,address);
        }
        if(type==0x201){leftDown=true;Publish(new{kind="down",x,y});}
        else if(type==0x202){leftDown=false;Publish(new{kind="up",x,y});}
        else if(type==0x204)Publish(new{kind="longpress",x,y});
        else if(type is 0x20A or 0x20E){int delta=(short)(data.data>>16);Publish(new{kind="wheel",x,y,deltaX=type==0x20E?delta:0,deltaY=type==0x20A?-delta:0});}
        return new IntPtr(1);
    }
    IntPtr Keyboard(int code,IntPtr message,IntPtr address){
        if(code<0||!active)return CallNextHookEx(keyboardHandle,code,message,address);
        var data=Marshal.PtrToStructure<KeyData>(address);if((data.flags&16)!=0)return CallNextHookEx(keyboardHandle,code,message,address);
        int key=(int)data.key;bool down=message.ToInt32() is 0x100 or 0x104;if(key<0||key>255)return new IntPtr(1);
        if(down&&(key==27||key is 91 or 92)){Release();return key==27?new IntPtr(1):CallNextHookEx(keyboardHandle,code,message,address);}
        if(key==20){if(down)keys[20]^=1;return new IntPtr(1);}
        keys[key]=(byte)(down?128:0);
        if(key is 160 or 161)keys[16]=(byte)(keys[160]|keys[161]);if(key is 162 or 163)keys[17]=(byte)(keys[162]|keys[163]);if(key is 164 or 165)keys[18]=(byte)(keys[164]|keys[165]);
        if(!down)return new IntPtr(1);
        int modifiers=(keys[16]>0?1:0)|(keys[17]>0?2:0)|(keys[18]>0?4:0);
        string? name=key switch{13=>"Enter",8=>"Backspace",46=>"Delete",9=>"Tab",37=>"ArrowLeft",39=>"ArrowRight",38=>"ArrowUp",40=>"ArrowDown",36=>"Home",35=>"End",33=>"PageUp",34=>"PageDown",_=>null};
        if(name!=null)Publish(new{kind="key",key=name,modifiers});
        else if((modifiers&2)!=0&&key is 65 or 67 or 86 or 88 or 89 or 90)Publish(new{kind="key",key=((char)(key+32)).ToString(),modifiers});
        else if((modifiers&2)==0&&key is not (16 or 17 or 18 or 160 or 161 or 162 or 163 or 164 or 165)){
            var text=new StringBuilder(16);int count=ToUnicodeEx(data.key,data.scan,keys,text,16,0,GetKeyboardLayout(GetWindowThreadProcessId(GetForegroundWindow(),IntPtr.Zero)));
            if(count>0&&count<=16){string value=text.ToString(0,count);if(!value.Any(c=>c=='\0'||c<' '))Publish(new{kind="text",text=value});}
        }
        return new IntPtr(1);
    }
    protected override void WndProc(ref Message message){
        if(message.Msg==0xFF){
            uint size=0;uint header=(uint)(IntPtr.Size==8?24:16);GetRawInputData(message.LParam,0x10000003,IntPtr.Zero,ref size,header);
            if(size>=header+24&&size<4096){var buffer=Marshal.AllocHGlobal((int)size);try{
                if(GetRawInputData(message.LParam,0x10000003,buffer,ref size,header)==size&&Marshal.ReadInt32(buffer)==0){var data=IntPtr.Add(buffer,(int)header);if((Marshal.ReadInt16(data)&1)==0){int dx=Marshal.ReadInt32(data,12),dy=Marshal.ReadInt32(data,16);
                    if(!active&&armed&&edgeAt>0&&Environment.TickCount64-edgeAt>=120&&(side=="right"&&dx>0||side=="left"&&dx<0||side=="top"&&dy<0||side=="bottom"&&dy>0)){if(GetCursorPos(out var point))Capture(point);}
                    else if(active){double nextX=x+dx*sensitivity/width,nextY=y+dy*sensitivity/height;if(!leftDown&&PhoneDeskGeometry.Returns(nextX,nextY,side)){x=nextX;y=nextY;Release();}else{x=Math.Clamp(nextX,0,1);y=Math.Clamp(nextY,0,1);dirty=true;}}
                }}
            }finally{Marshal.FreeHGlobal(buffer);}}
        }
        base.WndProc(ref message);
    }
    void Tick(){
        while(commands.TryDequeue(out var line))try{using var doc=JsonDocument.Parse(line);var value=doc.RootElement;switch(value.GetProperty("type").GetString()){
            case "heartbeat":heartbeat=Environment.TickCount64;break;
            case "config":Configure(value);break;
            case "release":Release();break;
            case "stop":Release();Application.ExitThread();return;
        }}catch{Release();Application.ExitThread();return;}
        if(Environment.TickCount64-heartbeat>3000){Release();armed=false;Application.ExitThread();return;}
        if(active){SetCursorPos(parked.X,parked.Y);long now=Environment.TickCount64;if(dirty||now-lastPointAt>250){dirty=false;lastPointAt=now;Publish(new{kind=leftDown?"drag":"pointer",x,y});}}
    }
    public void Dispose(){if(disposed)return;Release();disposed=true;clock.Stop();clock.Dispose();if(mouseHandle!=IntPtr.Zero)UnhookWindowsHookEx(mouseHandle);if(keyboardHandle!=IntPtr.Zero)UnhookWindowsHookEx(keyboardHandle);if(Handle!=IntPtr.Zero){RegisterRawInputDevices([new RawDevice{page=1,usage=2,flags=1,target=IntPtr.Zero}],1,(uint)Marshal.SizeOf<RawDevice>());DestroyHandle();}output.CompleteAdding();}
}
