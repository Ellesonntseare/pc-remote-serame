using System.Runtime.InteropServices;
using System.Text.Json;
using System.Windows.Forms;

internal static class ClipboardWatch
{
    [DllImport("user32.dll",SetLastError=true)] private static extern bool AddClipboardFormatListener(IntPtr handle);
    [DllImport("user32.dll")] private static extern bool RemoveClipboardFormatListener(IntPtr handle);
    [DllImport("user32.dll")] private static extern uint GetClipboardSequenceNumber();
    [DllImport("user32.dll")] private static extern bool PostMessage(IntPtr handle,uint message,IntPtr w,IntPtr l);
    private sealed class WatchWindow:NativeWindow,IDisposable
    {
        private readonly System.Windows.Forms.Timer timer=new(){Interval=40};
        private readonly string run=Guid.NewGuid().ToString("N");private uint sequence;private int attempts;private bool initial=true;
        internal WatchWindow()
        {
            CreateHandle(new CreateParams{Caption="PC Remote clipboard observer",Parent=new IntPtr(-3)});
            if(!AddClipboardFormatListener(Handle))throw new InvalidOperationException("Clipboard observation unavailable.");
            timer.Tick+=(_,_)=>Read();timer.Start();
        }
        protected override void WndProc(ref Message message)
        {
            if(message.Msg==0x031D){attempts=0;timer.Stop();timer.Start();}
            if(message.Msg==0x0010){Application.ExitThread();return;}
            base.WndProc(ref message);
        }
        private void Read()
        {
            timer.Stop();var next=GetClipboardSequenceNumber();if(!initial&&next==sequence)return;
            try
            {
                var id=run+"-"+next;var first=initial;
                if(Clipboard.ContainsText(TextDataFormat.UnicodeText))
                {
                    var text=Clipboard.GetText(TextDataFormat.UnicodeText);
                    if(text.Length<=250000)Console.WriteLine(JsonSerializer.Serialize(new{type="clipboard",kind="text",id,initial=first,text}));
                    else Console.WriteLine(JsonSerializer.Serialize(new{type="clipboard",kind="large-text",id,initial=first,length=text.Length}));
                }
                else if(Clipboard.ContainsFileDropList())Console.WriteLine(JsonSerializer.Serialize(new{type="clipboard",kind="files",id,initial=first,files=Clipboard.GetFileDropList().Cast<string>().Take(100).ToArray()}));
                else Console.WriteLine(JsonSerializer.Serialize(new{type="clipboard",kind=Clipboard.ContainsImage()?"image":"other",id,initial=first}));
                sequence=next;initial=false;attempts=0;
            }
            catch{if(++attempts<5)timer.Start();else Console.WriteLine("{\"type\":\"unavailable\"}");}
        }
        public void Dispose(){timer.Dispose();if(Handle!=IntPtr.Zero){RemoveClipboardFormatListener(Handle);DestroyHandle();}}
    }
    internal static void Run()
    {
        try
        {
            using var window=new WatchWindow();Console.WriteLine("{\"type\":\"ready\"}");
            _=Task.Run(()=>{try{Console.In.ReadToEnd();}finally{if(window.Handle!=IntPtr.Zero)PostMessage(window.Handle,0x0010,IntPtr.Zero,IntPtr.Zero);}});
            Application.Run();
        }
        catch{Console.WriteLine("{\"type\":\"unavailable\"}");}
    }
}
