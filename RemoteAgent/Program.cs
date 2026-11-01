// Elleson Connect desktop agent. Runs only as the signed-in Windows user while the
// user has explicitly started the visible Node server and a paired viewer connects.
// Binary stdout: [1-byte type][4-byte BE length][JPEG frame or JSON metadata].
using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.Globalization;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.Json;
using System.Windows.Forms;

internal static class Program
{
    private static readonly object OutputLock = new();
    private static readonly object HeldInputLock = new();
    private static readonly HashSet<char> HeldMouseButtons = new();
    private static readonly HashSet<int> HeldKeys = new();
    private static volatile bool running = true;
    private static volatile bool demandFrames;
    private static int frameBudget, jpegQuality, refreshRequested, requestedScale, requestedFps;
    private static volatile bool regions;
    private static Rectangle primary;

    [STAThread]
    private static void Main(string[] args)
    {
        if(args.Length==1&&args[0]=="--phone-handoff"){PhoneHandoff.Run();return;}
        if(args.Length==1&&args[0]=="--second-screen"){SecondScreen.Run();return;}
        if(args.Length==1&&args[0]=="--second-screen-probe"){SecondScreen.Probe();return;}
        if(args.Length==1&&args[0]=="--video-frames"){var video=new Thread(VideoFrames.Run);video.SetApartmentState(ApartmentState.MTA);video.Start();video.Join();return;}
        if(args.Length==1&&args[0]=="--app-control"){WindowControl.Run();return;}
        if(args.Length==1&&args[0]=="--privacy-display"){PrivacyDisplay.Run();return;}
        if(args.Length==1&&args[0]=="--open-link")
        {
            try
            {
                using var reader=new StreamReader(Console.OpenStandardInput(),new UTF8Encoding(false,true));
                string raw=reader.ReadToEnd();if(raw.Length>8192)throw new ArgumentException("Link is too long.");
                using var body=JsonDocument.Parse(raw);string value=body.RootElement.GetProperty("url").GetString()??"";
                if(value.Length>4096||value.Any(char.IsControl)||value.Any(char.IsWhiteSpace)||!Uri.TryCreate(value,UriKind.Absolute,out var uri)||
                   (uri.Scheme!=Uri.UriSchemeHttp&&uri.Scheme!=Uri.UriSchemeHttps)||!string.IsNullOrEmpty(uri.UserInfo))throw new ArgumentException("Use an http or https link.");
                System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo(uri.AbsoluteUri){UseShellExecute=true});
                Console.WriteLine("{\"ok\":true}");
            }
            catch(Exception ex){Console.WriteLine(JsonSerializer.Serialize(new {ok=false,error="Could not open link. "+ex.Message}));Environment.ExitCode=1;}
            return;
        }
        if(args.Length==1&&args[0]=="--clipboard-sync"){ClipboardWatch.Run(true);return;}
        if(args.Length==1&&args[0]=="--clipboard-watch"){ClipboardWatch.Run();return;}
        if(args.Length==1&&args[0]=="--file-locations"){FileLocations.Run();return;}
        if(args.Length==1&&args[0]=="--file-thumbnail"){FileThumbnail.Run();return;}
        if(args.Length==1&&args[0]=="--media"){MediaKeys.Run();return;}
        if(args.Length==1&&args[0] is "--ocr" or "--clipboard-image-read" or "--clipboard-image-write"){ImageTools.Run(args[0]);return;}
        if(args.Length==1&&args[0]=="--capture-probe")
        {
            try{Native.SetProcessDPIAware();using var probe=GpuDesktopCapture.Create(Screen.PrimaryScreen?.Bounds??throw new InvalidOperationException("No display"));Console.WriteLine("{\"gpuAvailable\":true,\"backend\":\"dxgi\"}");}
            catch{Console.WriteLine("{\"gpuAvailable\":false,\"backend\":\"gdi\"}");}
            return;
        }
        if(args.Length>0&&args[0]=="--audio-playback"){AudioPlayback.Run();return;}
        if(args.Length==1&&args[0]=="--audio-devices"){AudioPlayback.Devices();return;}
        if (args.Length > 0 && args[0] is "--audio" or "--apps-list" or "--app-focus" or "--app-current")
        {
            if (args.Length != 1) { Environment.ExitCode = 2; return; }
            if (args[0] == "--audio") AudioLoopback.Run();
            else AppWindows.Run(args[0] == "--app-focus",args[0] == "--app-current");
            return;
        }
        if(args.Length==1&&(args[0]=="--clipboard-read"||args[0]=="--clipboard-write"))
        {
            try
            {
                if(args[0]=="--clipboard-write")
                {
                    using var reader=new StreamReader(Console.OpenStandardInput(),new UTF8Encoding(false,true));
                    string text=reader.ReadToEnd();if(text.Length>250000)throw new ArgumentException("Clipboard text is too long");
                    if(text.Length==0)Clipboard.Clear();else Clipboard.SetText(text,TextDataFormat.UnicodeText);
                    Console.WriteLine("{\"ok\":true}");
                }
                else
                {
                    string text=Clipboard.ContainsText(TextDataFormat.UnicodeText)?Clipboard.GetText(TextDataFormat.UnicodeText):"";
                    if(text.Length>250000)throw new ArgumentException("PC clipboard text is too long to transfer");
                    using var output=Console.OpenStandardOutput();output.Write(JsonSerializer.SerializeToUtf8Bytes(new {ok=true,text}));
                }
            }
            catch(Exception ex){Console.WriteLine(JsonSerializer.Serialize(new {ok=false,error="Clipboard unavailable. "+ex.Message}));Environment.ExitCode=1;}
            return;
        }
        if (args.Length is not (3 or 4) || !int.TryParse(args[0], out int fps)
            || !long.TryParse(args[1], out long quality)
            || !double.TryParse(args[2], NumberStyles.Float, CultureInfo.InvariantCulture, out double scale)
            || fps < 1 || fps > 30 || quality < 20 || quality > 90 || scale < .25 || scale > 1.0)
        {
            Console.Error.WriteLine("Usage: RemoteAgent <fps:1..30> <jpeg-quality:20..90> <scale:0.25..1> [max-width:320..8192]");
            Environment.ExitCode = 2;
            return;
        }
        int maxWidth=0;
        if(args.Length==4&&(!int.TryParse(args[3],out maxWidth)||maxWidth<320||maxWidth>8192)){Environment.ExitCode=2;return;}
        try
        {
            Native.SetProcessDPIAware();
            primary = Screen.PrimaryScreen?.Bounds ?? throw new InvalidOperationException("No active desktop monitor");
            if (primary.Width <= 0 || primary.Height <= 0) throw new InvalidOperationException("Invalid monitor size");
            if(maxWidth>0)scale=Math.Round(Math.Max(.25,Math.Min(scale,maxWidth/(double)primary.Width))*100)/100;
            int outW = Math.Max(1, (int)Math.Round(primary.Width * scale));
            int outH = Math.Max(1, (int)Math.Round(primary.Height * scale));
            int msPerFrame = Math.Max(33, 1000 / fps);
            var stdout = Console.OpenStandardOutput();
            Send(stdout, 1, JsonSerializer.SerializeToUtf8Bytes(new { w = primary.Width, h = primary.Height,encodedW=outW,encodedH=outH,scale }));
            using var source = new Bitmap(primary.Width, primary.Height, PixelFormat.Format24bppRgb);
            using var outputSurface = new ScreenOutput();
            outputSurface.Resize(outW, outH);
            using var capture = Graphics.FromImage(source);
            using var desktopCapture = new DesktopCapture(primary,Environment.GetEnvironmentVariable("PCR_CAPTURE")!="gdi");
            var jpeg = ImageCodecInfo.GetImageEncoders().First(e => e.MimeType == "image/jpeg");
            using var encoder = new EncoderParameters(1);
            encoder.Param[0] = new EncoderParameter(System.Drawing.Imaging.Encoder.Quality, quality);
            jpegQuality=(int)quality;
            requestedScale=(int)Math.Round(scale*100);requestedFps=fps;
            var inputThread = new Thread(() => ProcessInput(stdout)) { IsBackground = true };
            inputThread.SetApartmentState(ApartmentState.STA);
            inputThread.Start();
            using var memory = new MemoryStream();
            bool wasRegions = false;
            while (running)
            {
                if(demandFrames)
                {
                    int available=Volatile.Read(ref frameBudget);
                    if(available<=0){Thread.Sleep(8);continue;}
                    if(Interlocked.CompareExchange(ref frameBudget,available-1,available)!=available)continue;
                }
                int requestedQuality=Volatile.Read(ref jpegQuality);
                bool compressionChanged=requestedQuality!=quality;
                if(requestedQuality!=quality)
                {
                    encoder.Param[0].Dispose();
                    quality=requestedQuality;
                    encoder.Param[0]=new EncoderParameter(System.Drawing.Imaging.Encoder.Quality,quality);
                }
                var start = Environment.TickCount64;
                try
                {
                    int percent=Volatile.Read(ref requestedScale);
                    int nextW=Math.Max(1,(int)Math.Round(primary.Width*percent/100.0));
                    int nextH=Math.Max(1,(int)Math.Round(primary.Height*percent/100.0));
                    int targetFps=Volatile.Read(ref requestedFps);
                    msPerFrame=Math.Max(33,1000/targetFps);
                    if(nextW!=outW||nextH!=outH)
                    {
                        outW=nextW;outH=nextH;outputSurface.Resize(outW,outH);wasRegions=false;
                        Send(stdout,1,JsonSerializer.SerializeToUtf8Bytes(new {w=primary.Width,h=primary.Height,encodedW=outW,encodedH=outH,scale=percent/100.0,fps=targetFps}));
                    }
                    if (Screen.PrimaryScreen?.Bounds != primary)
                    {
                        Console.Error.WriteLine("Monitor dimensions changed; reconnecting the screen.");
                        break;
                    }
                    bool regionMode = regions;
                    bool needsPixels=!regionMode||!wasRegions||compressionChanged||Volatile.Read(ref refreshRequested)!=0;
                    if(!desktopCapture.Capture(source,needsPixels,out bool pixelsChanged)){Send(stdout,4,"{}"u8);Thread.Sleep(msPerFrame);continue;}
                    if (!regionMode) DrawCursor(capture);
                    else SendCursor(stdout);
                    if(regionMode&&!pixelsChanged&&!needsPixels){Send(stdout,4,"{}"u8);int idleRemaining=msPerFrame-(int)(Environment.TickCount64-start);if(idleRemaining>0)Thread.Sleep(idleRemaining);continue;}
                    Bitmap image = source;
                    if (outW != primary.Width || outH != primary.Height)
                    {
                        outputSurface.Graphics.DrawImage(source, new Rectangle(0, 0, outW, outH));
                        image = outputSurface.Image;
                    }
                    if (regionMode)
                    {
                        bool refresh = Interlocked.Exchange(ref refreshRequested, 0) != 0 || !wasRegions;
                        byte[]? update = outputSurface.Encoder.Encode(image, (int)quality, refresh, Environment.TickCount64);
                        if (update != null) Send(stdout, 5, update);
                        else Send(stdout, 4, "{}"u8);
                    }
                    else
                    {
                        memory.Position = 0; memory.SetLength(0);
                        image.Save(memory, jpeg, encoder);
                        Send(stdout, 0, memory.GetBuffer().AsSpan(0, checked((int)memory.Length)));
                    }
                    wasRegions = regionMode;
                }
                catch (Exception ex)
                {
                    Console.Error.WriteLine("Capture unavailable (desktop locked or permission denied): " + ex.Message);
                    Send(stdout, 4, JsonSerializer.SerializeToUtf8Bytes(new { error = "Capture unavailable" }));
                    Thread.Sleep(500);
                }
                int remaining = msPerFrame - (int)(Environment.TickCount64 - start);
                if (remaining > 0) Thread.Sleep(remaining);
            }
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine("Desktop agent error: " + ex);
            Environment.ExitCode = 1;
        }
        finally
        {
            running = false;
            ReleaseHeldInput();
        }
    }

    private static void Send(Stream output, byte type, ReadOnlySpan<byte> payload)
    {
        Span<byte> header = stackalloc byte[5];
        header[0] = type;
        header[1] = (byte)(payload.Length >> 24);
        header[2] = (byte)(payload.Length >> 16);
        header[3] = (byte)(payload.Length >> 8);
        header[4] = (byte)payload.Length;
        lock (OutputLock)
        {
            output.Write(header);
            output.Write(payload);
            output.Flush();
        }
    }

    private static void DrawCursor(Graphics g)
    {
        var cursor = new Native.CURSORINFO { cbSize = Marshal.SizeOf<Native.CURSORINFO>() };
        if (!Native.GetCursorInfo(ref cursor) || (cursor.flags & 1) == 0) return;
        int hotX = 0, hotY = 0;
        if (Native.GetIconInfo(cursor.hCursor, out var info))
        {
            hotX = (int)info.xHotspot;
            hotY = (int)info.yHotspot;
            if (info.hbmMask != IntPtr.Zero) Native.DeleteObject(info.hbmMask);
            if (info.hbmColor != IntPtr.Zero) Native.DeleteObject(info.hbmColor);
        }
        IntPtr hdc = g.GetHdc();
        try { Native.DrawIconEx(hdc, cursor.pt.X - primary.Left - hotX, cursor.pt.Y - primary.Top - hotY,
            cursor.hCursor, 0, 0, 0, IntPtr.Zero, 3); }
        finally { g.ReleaseHdc(hdc); }
    }

    private static void SendCursor(Stream output)
    {
        var cursor = new Native.CURSORINFO { cbSize = Marshal.SizeOf<Native.CURSORINFO>() };
        if (Native.GetCursorInfo(ref cursor))
            Send(output, 6, JsonSerializer.SerializeToUtf8Bytes(new { x = cursor.pt.X - primary.Left, y = cursor.pt.Y - primary.Top, visible = (cursor.flags & 1) != 0 }));
    }

    private static void ProcessInput(Stream output)
    {
        try
        {
            string? line;
            while ((line = Console.ReadLine()) != null)
            {
                // Acknowledged commands are used by the phone typing panel only.
                // An acknowledgement means Windows accepted SendInput, not that a
                // particular application accepted text (e.g. UAC/secure desktop).
                if (line.StartsWith("ack ", StringComparison.Ordinal))
                {
                    var fields = line.Split(' ', 3);
                    if (fields.Length != 3) continue;
                    try
                    {
                        if (fields[2]=="focuscurrent"||fields[2].StartsWith("focus ", StringComparison.Ordinal))
                        {
                            var point = fields[2].Split(' ');
                            var id=fields[1];int x=point.Length==3?Number(point[1])+primary.Left:-1,y=point.Length==3?Number(point[2])+primary.Top:-1;
                            bool current=fields[2]=="focuscurrent";
                            _=Task.Run(()=>{var focus=current?FieldFocus.InspectCurrent():FieldFocus.InspectAt(x,y);var bounds=focus.FieldBounds;Send(output,2,JsonSerializer.SerializeToUtf8Bytes(new {id,ok=true,editable=focus.Editable,fieldId=focus.FieldId,fieldBounds=bounds==null?null:new {x=bounds.x-primary.Left,y=bounds.y-primary.Top,bounds.width,bounds.height}}));});
                        }
                        else
                        {
                            Execute(fields[2]);
                            Send(output, 2, JsonSerializer.SerializeToUtf8Bytes(new { id = fields[1], ok = true }));
                        }
                    }
                    catch (Exception ex)
                    {
                        Console.Error.WriteLine("Desktop typing failed: " + ex.Message);
                        Send(output, 2, JsonSerializer.SerializeToUtf8Bytes(new { id = fields[1], ok = false, error = ex.Message }));
                    }
                }
                else
                {
                    try { Execute(line); }
                    catch (Exception ex) { Console.Error.WriteLine("Invalid desktop input: " + ex.Message); }
                }
            }
        }
        finally { ReleaseHeldInput(); running = false; }
    }

    private static int Number(string s) => int.Parse(s, CultureInfo.InvariantCulture);
    private static void Execute(string line)
    {
        var parts = line.Split(' ', 2, StringSplitOptions.RemoveEmptyEntries);
        if (parts.Length < 1) return;
        var words = (parts.Length > 1 ? parts[1] : "").Split(' ', StringSplitOptions.RemoveEmptyEntries);
        switch (parts[0])
        {
            case "stream":
                if(words.Length==3&&int.TryParse(words[0],out int pct)&&pct>=25&&pct<=100&&int.TryParse(words[1],out int rate)&&rate>=1&&rate<=30&&int.TryParse(words[2],out int q)&&q>=20&&q<=90)
                {
                    Volatile.Write(ref requestedScale,pct);Volatile.Write(ref requestedFps,rate);Volatile.Write(ref jpegQuality,q);
                }
                break;
            case "regions":
                regions = words.Length == 1 && words[0] == "1";
                Interlocked.Exchange(ref refreshRequested, 1);
                break;
            case "refresh":
                Interlocked.Exchange(ref refreshRequested, 1);
                break;
            case "flow":
                demandFrames=words.Length==1&&words[0]=="1";
                Interlocked.Exchange(ref frameBudget,0);
                break;
            case "frame":
                int budget;
                do{budget=Volatile.Read(ref frameBudget);if(budget>=2)return;}
                while(Interlocked.CompareExchange(ref frameBudget,budget+1,budget)!=budget);
                break;
            case "quality":
                if(words.Length==1&&int.TryParse(words[0],out int requested)&&requested>=20&&requested<=90)
                    Volatile.Write(ref jpegQuality,requested);
                break;
            case "mv":
                if (words.Length != 2) return;
                // Queue real relative motion; reading then warping the cursor can
                // reuse an old position while a foreground dialog processes input.
                SendMouse(0x0001, Number(words[0]), Number(words[1]));
                break;
            case "abs":
                if (words.Length != 2) return;
                var desktop = SystemInformation.VirtualScreen;
                int px=primary.Left+Math.Clamp(Number(words[0]),0,primary.Width-1);
                int py=primary.Top+Math.Clamp(Number(words[1]),0,primary.Height-1);
                SendMouse(0x0001|0x8000|0x4000,
                    (int)Math.Clamp(((long)(px-desktop.Left)*65536+32768)/desktop.Width,0,65535),
                    (int)Math.Clamp(((long)(py-desktop.Top)*65536+32768)/desktop.Height,0,65535));
                break;
            case "wheel": case "hwheel":
                if (words.Length != 1) return;
                SendMouse(parts[0]=="hwheel"?0x1000u:0x0800u, data:unchecked((uint)Number(words[0])));
                break;
            case "click": case "down": case "up":
                if (words.Length != 1 || words[0].Length != 1) return;
                PressMouse(words[0][0], parts[0]);
                break;
            case "dbl": PressMouse('l', "click"); Thread.Sleep(75); PressMouse('l', "click"); break;
            case "key": case "keydown": case "keyup":
                if (words.Length != 1) return;
                PressKey(Number(words[0]), parts[0]);
                break;
            case "combo":
                if (words.Length != 1) return;
                var keys = words[0].Split(',').Select(Number).ToArray();
                foreach (int key in keys) PressKey(key, "keydown");
                foreach (int key in keys.Reverse()) PressKey(key, "keyup");
                break;
            case "paste":
                if (words.Length != 1) throw new ArgumentException("Missing paste text");
                var pasteBytes = Convert.FromBase64String(words[0]);
                if (pasteBytes.Length > 65536) throw new ArgumentException("Paste is too large");
                var pasteText = new UTF8Encoding(false, true).GetString(pasteBytes);
                // Clipboard APIs require the dedicated STA input thread. A single
                // paste preserves Unicode, line breaks and character order.
                Clipboard.SetText(pasteText.Replace("\r\n", "\n").Replace("\r", "\n").Replace("\n", "\r\n"));
                SendPaste();
                break;
            case "edit":
                if (words.Length != 1) throw new ArgumentException("Missing live edit");
                var editBytes = Convert.FromBase64String(words[0]);
                if (editBytes.Length > 65536) throw new ArgumentException("Live edit is too large");
                using (var document = JsonDocument.Parse(new UTF8Encoding(false, true).GetString(editBytes)))
                {
                    var edit = document.RootElement;
                    if (edit.ValueKind != JsonValueKind.Object || edit.EnumerateObject().Count() != 2 ||
                        !edit.TryGetProperty("remove", out var removeValue) || !removeValue.TryGetInt32(out int remove) ||
                        remove < 0 || remove > 16000 || !edit.TryGetProperty("text", out var textValue) ||
                        textValue.ValueKind != JsonValueKind.String)
                        throw new ArgumentException("Invalid live edit");
                    var text = textValue.GetString()!;
                    if (text.Length > 16000 || text.Contains('\0')) throw new ArgumentException("Invalid live text");
                    // Strict encoding also rejects JSON-escaped isolated surrogates.
                    _ = new UTF8Encoding(false, true).GetBytes(text);
                    SendEdit(remove, text);
                }
                break;
            case "text":
                if (words.Length != 1) return;
                var bytes = Convert.FromBase64String(words[0]);
                if (bytes.Length > 600) return;
                var inputText = new UTF8Encoding(false, true).GetString(bytes);
                SendEdit(0, inputText);
                break;
        }
    }

    private static void SendMouse(uint flags,int x=0,int y=0,uint data=0)
    {
        var inputs=new[]{new Native.INPUT{type=0,U=new Native.INPUTUNION{mi=new Native.MOUSEINPUT{dx=x,dy=y,mouseData=data,dwFlags=flags}}}};
        if(Native.SendInput(1,inputs,Marshal.SizeOf<Native.INPUT>())!=1)
            throw new InvalidOperationException("Windows blocked mouse input. Check whether the foreground window requires administrator access or is a Windows security prompt.");
    }

    private static void PressMouse(char button, string kind)
    {
        (uint down, uint up) = button switch
        {
            'l' => (0x0002u, 0x0004u), 'r' => (0x0008u, 0x0010u), 'm' => (0x0020u, 0x0040u),
            _ => (0u, 0u)
        };
        if (down == 0) return;
        lock (HeldInputLock)
        {
            if (kind != "up") { SendMouse(down); HeldMouseButtons.Add(button); }
            if (kind != "down") { SendMouse(up); HeldMouseButtons.Remove(button); }
        }
    }
    private static void PressKey(int value, string kind)
    {
        if (value < 0 || value > 255) return;
        lock (HeldInputLock)
        {
            if (kind != "keyup") { HeldKeys.Add(value); Native.keybd_event((byte)value, 0, 0, UIntPtr.Zero); }
            if (kind != "keydown") { Native.keybd_event((byte)value, 0, 2, UIntPtr.Zero); HeldKeys.Remove(value); }
        }
    }
    private static void ReleaseHeldInput()
    {
        lock (HeldInputLock)
        {
            // Release only inputs this agent held, leaving physical user input alone.
            foreach (char button in HeldMouseButtons.ToArray())
                try { PressMouse(button, "up"); } catch { }
            foreach (int key in HeldKeys.ToArray())
                try { PressKey(key, "keyup"); } catch { }
        }
    }
    private static void SendPaste()
    {
        var inputs = new[] {
            new Native.INPUT { type = 1, U = new Native.INPUTUNION { ki = new Native.KEYBDINPUT { wVk = 17 } } },
            new Native.INPUT { type = 1, U = new Native.INPUTUNION { ki = new Native.KEYBDINPUT { wVk = 86 } } },
            new Native.INPUT { type = 1, U = new Native.INPUTUNION { ki = new Native.KEYBDINPUT { wVk = 86, dwFlags = 2 } } },
            new Native.INPUT { type = 1, U = new Native.INPUTUNION { ki = new Native.KEYBDINPUT { wVk = 17, dwFlags = 2 } } }
        };
        if (Native.SendInput((uint)inputs.Length, inputs, Marshal.SizeOf<Native.INPUT>()) != inputs.Length)
        {
            PressKey(86, "keyup"); PressKey(17, "keyup");
            throw new InvalidOperationException("Windows refused paste. Select an editable field on the unlocked desktop.");
        }
        // Do not restore the old clipboard: the target handles paste asynchronously.
    }

    private static void SendEdit(int remove, string text)
    {
        var inputs = new List<Native.INPUT>();
        void Add(ushort value, bool unicode)
        {
            uint flags = unicode ? 0x0004u : 0u;
            var key = new Native.KEYBDINPUT { wVk = unicode ? (ushort)0 : value, wScan = unicode ? value : (ushort)0, dwFlags = flags };
            inputs.Add(new Native.INPUT { type = 1, U = new Native.INPUTUNION { ki = key } });
            key.dwFlags |= 0x0002;
            inputs.Add(new Native.INPUT { type = 1, U = new Native.INPUTUNION { ki = key } });
        }
        // The browser removes the changed suffix at the remote caret before
        // inserting its replacement. One SendInput call keeps the entire edit
        // ordered, including surrogate pairs and line breaks, without clipboard changes.
        for (int i = 0; i < remove; i++) Add(8, false);
        foreach (char ch in text.Replace("\r\n", "\n").Replace("\r", "\n"))
            Add(ch == '\n' ? (ushort)13 : ch, ch != '\n');
        if (inputs.Count == 0) return;
        var batch = inputs.ToArray();
        uint inserted = Native.SendInput((uint)batch.Length, batch, Marshal.SizeOf<Native.INPUT>());
        if (inserted != batch.Length)
            throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error(),
                "Windows refused some live keyboard input. Check the PC field before resuming typing.");
    }

}

internal static class Native
{
    [StructLayout(LayoutKind.Sequential)] public struct POINT { public int X; public int Y; }
    [StructLayout(LayoutKind.Sequential)] public struct CURSORINFO { public int cbSize; public int flags; public IntPtr hCursor; public POINT pt; }
    [StructLayout(LayoutKind.Sequential)] public struct ICONINFO { [MarshalAs(UnmanagedType.Bool)] public bool fIcon; public uint xHotspot; public uint yHotspot; public IntPtr hbmMask; public IntPtr hbmColor; }
    [StructLayout(LayoutKind.Sequential)] public struct MOUSEINPUT { public int dx; public int dy; public uint mouseData; public uint dwFlags; public uint time; public IntPtr dwExtraInfo; }
    [StructLayout(LayoutKind.Sequential)] public struct KEYBDINPUT { public ushort wVk; public ushort wScan; public uint dwFlags; public uint time; public IntPtr dwExtraInfo; }
    [StructLayout(LayoutKind.Explicit)] public struct INPUTUNION { [FieldOffset(0)] public MOUSEINPUT mi; [FieldOffset(0)] public KEYBDINPUT ki; }
    [StructLayout(LayoutKind.Sequential)] public struct INPUT { public uint type; public INPUTUNION U; }
    [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
    [DllImport("user32.dll")] public static extern bool GetCursorInfo(ref CURSORINFO info);
    [DllImport("user32.dll")] public static extern bool GetIconInfo(IntPtr cursor, out ICONINFO info);
    [DllImport("user32.dll")] public static extern bool DrawIconEx(IntPtr hdc, int x, int y, IntPtr icon, int cx, int cy, int step, IntPtr brush, int flags);
    [DllImport("gdi32.dll")] public static extern bool DeleteObject(IntPtr obj);
    [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
    [DllImport("user32.dll")] public static extern bool GetCursorPos(out POINT point);
    [DllImport("user32.dll")] public static extern void mouse_event(uint flags, uint dx, uint dy, int delta, UIntPtr extra);
    [DllImport("user32.dll")] public static extern void keybd_event(byte vk, byte scan, uint flags, UIntPtr extra);
    [DllImport("user32.dll", SetLastError = true)] public static extern uint SendInput(uint count, INPUT[] inputs, int size);
}
