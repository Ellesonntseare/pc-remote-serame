using System.Collections.Concurrent;
using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;
using System.Text.Json;
using System.Windows.Forms;

internal static class ClipboardWatch
{
    private const int MaxImageBytes=20*1024*1024;
    [DllImport("user32.dll",SetLastError=true)] private static extern bool AddClipboardFormatListener(IntPtr handle);
    [DllImport("user32.dll")] private static extern bool RemoveClipboardFormatListener(IntPtr handle);
    [DllImport("user32.dll")] private static extern uint GetClipboardSequenceNumber();
    [DllImport("user32.dll")] private static extern bool PostMessage(IntPtr handle,uint message,IntPtr w,IntPtr l);
    private static void Emit(object value)=>Console.WriteLine(JsonSerializer.Serialize(value));
    private sealed class WatchWindow:NativeWindow,IDisposable
    {
        private readonly System.Windows.Forms.Timer timer=new(){Interval=40};
        private readonly ConcurrentQueue<string> commands=new();
        private readonly string run=Guid.NewGuid().ToString("N");
        private readonly bool images;
        private uint sequence;private int attempts;private bool initial=true;
        internal WatchWindow(bool includeImages)
        {
            images=includeImages;CreateHandle(new CreateParams{Caption="Elleson Connect clipboard connection",Parent=new IntPtr(-3)});
            if(!AddClipboardFormatListener(Handle))throw new InvalidOperationException("Clipboard observation unavailable.");
            timer.Tick+=(_,_)=>Read();timer.Start();
        }
        internal void Enqueue(string command){if(command.Length<=30*1024*1024){commands.Enqueue(command);PostMessage(Handle,0x8001,IntPtr.Zero,IntPtr.Zero);}}
        protected override void WndProc(ref Message message)
        {
            if(message.Msg==0x031D){attempts=0;timer.Stop();timer.Start();}
            if(message.Msg==0x8001){while(commands.TryDequeue(out var command))Apply(command);return;}
            if(message.Msg==0x0010){Application.ExitThread();return;}
            base.WndProc(ref message);
        }
        private void Apply(string line)
        {
            string id="";
            try
            {
                using var document=JsonDocument.Parse(line);var value=document.RootElement;
                id=value.GetProperty("id").GetString()??"";
                if(id.Length is <1 or >100||id.Any(c=>!char.IsAsciiLetterOrDigit(c)&&c!='-'))throw new ArgumentException();
                if(value.GetProperty("type").GetString()!="set")throw new ArgumentException();
                var kind=value.GetProperty("kind").GetString();
                if(kind=="empty")Clipboard.Clear();
                else if(kind=="text")
                {
                    var text=value.GetProperty("text").GetString()??"";if(text.Length>250000||text.Contains('\0'))throw new ArgumentException();
                    if(text.Length==0)Clipboard.Clear();else Clipboard.SetDataObject(text,true,8,50);
                }
                else if(kind=="image")
                {
                    var data=Convert.FromBase64String(value.GetProperty("data").GetString()??"");
                    if(data.Length<24||data.Length>MaxImageBytes||!data.AsSpan(0,8).SequenceEqual(new byte[]{137,80,78,71,13,10,26,10}))throw new ArgumentException();
                    using var input=new MemoryStream(data);using var original=Image.FromStream(input,true,true);
                    if(original.Width<1||original.Height<1||(long)original.Width*original.Height>24000000)throw new ArgumentException();
                    using var bitmap=new Bitmap(original);using var png=new MemoryStream(data);
                    var content=new DataObject();content.SetData(DataFormats.Bitmap,true,bitmap);content.SetData("PNG",false,png);
                    Clipboard.SetDataObject(content,true,8,50);
                }
                else throw new ArgumentException();
                Emit(new{type="applied",id,ok=true,sequence=GetClipboardSequenceNumber()});
            }
            catch{Emit(new{type="applied",id,ok=false,error="Windows could not update its clipboard. Retry after the current clipboard operation finishes."});}
        }
        private void Read()
        {
            timer.Stop();var next=GetClipboardSequenceNumber();if(!initial&&next==sequence)return;
            try
            {
                var id=run+"-"+next;var first=initial;
                if(Clipboard.ContainsImage())
                {
                    if(!images)Emit(new{type="clipboard",kind="image",id,sequence=next,initial=first});
                    else
                    {
                        using var image=Clipboard.GetImage();if(image==null)throw new InvalidOperationException();
                        if((long)image.Width*image.Height>24000000)Emit(new{type="clipboard",kind="large-image",id,sequence=next,initial=first});
                        else
                        {
                            using var encoded=new MemoryStream();image.Save(encoded,ImageFormat.Png);
                            if(encoded.Length>MaxImageBytes)Emit(new{type="clipboard",kind="large-image",id,sequence=next,initial=first});
                            else Emit(new{type="clipboard",kind="image",id,sequence=next,initial=first,mime="image/png",data=Convert.ToBase64String(encoded.ToArray())});
                        }
                    }
                }
                else if(Clipboard.ContainsText(TextDataFormat.UnicodeText))
                {
                    var text=Clipboard.GetText(TextDataFormat.UnicodeText);
                    if(text.Length<=250000)Emit(new{type="clipboard",kind="text",id,sequence=next,initial=first,text});
                    else Emit(new{type="clipboard",kind="large-text",id,sequence=next,initial=first,length=text.Length});
                }
                else if(Clipboard.ContainsFileDropList())Emit(new{type="clipboard",kind="files",id,sequence=next,initial=first,files=Clipboard.GetFileDropList().Cast<string>().Take(100).ToArray()});
                else Emit(new{type="clipboard",kind=Clipboard.GetDataObject()?.GetFormats().Length>0?"other":"empty",id,sequence=next,initial=first});
                sequence=next;initial=false;attempts=0;
            }
            catch{if(++attempts<5)timer.Start();else Emit(new{type="unavailable"});}
        }
        public void Dispose(){timer.Dispose();if(Handle!=IntPtr.Zero){RemoveClipboardFormatListener(Handle);DestroyHandle();}}
    }
    internal static void Run(bool includeImages=false)
    {
        try
        {
            using var window=new WatchWindow(includeImages);Emit(new{type="ready"});
            _=Task.Run(()=>{try{string? line;while((line=Console.In.ReadLine())!=null)window.Enqueue(line);}finally{if(window.Handle!=IntPtr.Zero)PostMessage(window.Handle,0x0010,IntPtr.Zero,IntPtr.Zero);}});
            Application.Run();
        }
        catch{Emit(new{type="unavailable"});}
    }
}
