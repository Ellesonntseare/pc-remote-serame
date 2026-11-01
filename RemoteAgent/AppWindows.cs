using System.Diagnostics;
using System.Globalization;
using System.Runtime.InteropServices;
using System.Security.Principal;
using System.Text;
using System.Text.Json;
using Microsoft.Win32.SafeHandles;

internal static class AppWindows
{
    private record WindowInfo(string handle, int pid, string startTicks, string title, string processName, bool minimized, bool active);
    private static readonly int Session = Process.GetCurrentProcess().SessionId;
    private static readonly string? User = WindowsIdentity.GetCurrent().User?.Value;

    public static void Run(bool focus, bool current = false)
    {
        try
        {
            object result;
            if (focus)
            {
                using var reader = new StreamReader(Console.OpenStandardInput(), new UTF8Encoding(false, true));
                char[] input = new char[1025]; int length = reader.ReadBlock(input, 0, input.Length);
                if (length > 1024) throw new ArgumentException("Invalid app selection.");
                using var doc = JsonDocument.Parse(new string(input, 0, length));
                var value = doc.RootElement;
                if (value.ValueKind != JsonValueKind.Object || value.EnumerateObject().Count() != 3 ||
                    !value.TryGetProperty("handle", out var handleValue) || handleValue.ValueKind != JsonValueKind.String ||
                    !value.TryGetProperty("pid", out var pidValue) || !pidValue.TryGetInt32(out int pid) || pid <= 0 ||
                    !value.TryGetProperty("startTicks", out var startValue) || startValue.ValueKind != JsonValueKind.String)
                    throw new ArgumentException("Invalid app selection.");
                string handleText = handleValue.GetString()!, start = startValue.GetString()!;
                if (handleText.Length is < 1 or > 16 || !ulong.TryParse(handleText, NumberStyles.AllowHexSpecifier, CultureInfo.InvariantCulture, out ulong raw) || raw == 0 ||
                    start.Length > 20 || !long.TryParse(start, NumberStyles.None, CultureInfo.InvariantCulture, out long ticks) || ticks <= 0)
                    throw new ArgumentException("Invalid app selection.");
                IntPtr window = new(unchecked((long)raw));
                var info = Describe(window);
                if (info == null || info.pid != pid || info.startTicks != start) throw new InvalidOperationException("This app closed or changed. Refresh the app list.");
                Focus(window);
                result = new { ok = true };
            }
            else if(current)
            {
                var app=Describe(GetForegroundWindow());result=new {ok=true,app=app==null?null:new {app.processName,app.title}};
            }
            else
            {
                var windows = new List<WindowInfo>();
                EnumWindows((window, _) => { var info = Describe(window); if (info != null && windows.Count < 256) windows.Add(info); return true; }, IntPtr.Zero);
                result = new { ok = true, apps = windows };
            }
            Console.Write(JsonSerializer.Serialize(result));
        }
        catch (Exception ex) { Console.Write(JsonSerializer.Serialize(new { ok = false, error = ex.Message })); Environment.ExitCode = 1; }
    }

    internal static IntPtr PresentationWindow(JsonElement selection)
    {
        string text=selection.GetProperty("handle").GetString()??"";
        if(text.Length is <1 or >16||!ulong.TryParse(text,NumberStyles.AllowHexSpecifier,CultureInfo.InvariantCulture,out ulong raw)||raw==0)throw new ArgumentException("Invalid window selection.");
        IntPtr window=new(unchecked((long)raw));var info=Describe(window);
        if(info==null||info.pid!=selection.GetProperty("pid").GetInt32()||info.startTicks!=selection.GetProperty("startTicks").GetString())throw new InvalidOperationException("This window closed or changed. Choose it again.");
        // WGC can capture a covered/background window without stealing focus.
        if(IsIconic(window)){ShowWindowAsync(window,9);for(int i=0;i<20&&IsIconic(window);i++)Thread.Sleep(25);}
        return window;
    }

    private static WindowInfo? Describe(IntPtr window)
    {
        try
        {
            if (!IsWindow(window) || !IsWindowVisible(window) || GetAncestor(window, 2) != window ||
                (GetWindowLongPtr(window, -20).ToInt64() & 0x80) != 0 || GetWindow(window, 4) != IntPtr.Zero) return null;
            if (DwmGetWindowAttribute(window, 14, out int cloaked, 4) == 0 && cloaked != 0) return null;
            int length = GetWindowTextLength(window); if (length <= 0) return null;
            var title = new StringBuilder(Math.Min(length, 1024) + 1); GetWindowText(window, title, title.Capacity);
            string caption = title.ToString().Trim(); if (caption.Length == 0) return null;
            GetWindowThreadProcessId(window, out uint id); if (id == 0 || id > int.MaxValue) return null;
            using var process = Process.GetProcessById((int)id);
            if (process.SessionId != Session || !OpenProcessToken(process.Handle, 8, out SafeAccessTokenHandle token)) return null;
            using (token) { using var identity = new WindowsIdentity(token.DangerousGetHandle()); if (identity.User?.Value != User) return null; }
            return new WindowInfo(window.ToInt64().ToString("x", CultureInfo.InvariantCulture), process.Id,
                process.StartTime.ToUniversalTime().Ticks.ToString(CultureInfo.InvariantCulture), caption, process.ProcessName,
                IsIconic(window), GetForegroundWindow() == window);
        }
        catch { return null; } // Closed/protected windows are simply omitted.
    }

    internal static void Focus(IntPtr window)
    {
        uint own = GetCurrentThreadId(), foreground = GetWindowThreadProcessId(GetForegroundWindow(), out _), target = GetWindowThreadProcessId(window, out _);
        bool attachedForeground = false, attachedTarget = false;
        try
        {
            if (foreground != 0 && foreground != own) attachedForeground = AttachThreadInput(own, foreground, true);
            if (target != 0 && target != own && target != foreground) attachedTarget = AttachThreadInput(own, target, true);
            if (IsIconic(window)) ShowWindowAsync(window, 9);
            BringWindowToTop(window); SetForegroundWindow(window);
        }
        finally
        {
            if (attachedTarget) AttachThreadInput(own, target, false);
            if (attachedForeground) AttachThreadInput(own, foreground, false);
        }
        for (int i = 0; i < 10 && GetForegroundWindow() != window; i++) Thread.Sleep(20);
        if (GetForegroundWindow() != window) throw new InvalidOperationException("Windows could not activate this app. Unlock the desktop and try again.");
    }

    private delegate bool EnumProc(IntPtr window, IntPtr state);
    [DllImport("user32.dll")] private static extern bool EnumWindows(EnumProc callback, IntPtr state);
    [DllImport("user32.dll")] private static extern bool IsWindow(IntPtr window);
    [DllImport("user32.dll")] private static extern bool IsWindowVisible(IntPtr window);
    [DllImport("user32.dll")] private static extern IntPtr GetAncestor(IntPtr window, uint flags);
    [DllImport("user32.dll")] private static extern IntPtr GetWindow(IntPtr window, uint command);
    [DllImport("user32.dll", EntryPoint = "GetWindowLongPtrW")] private static extern IntPtr GetWindowLongPtr(IntPtr window, int index);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern int GetWindowTextLength(IntPtr window);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern int GetWindowText(IntPtr window, StringBuilder text, int max);
    [DllImport("user32.dll")] private static extern uint GetWindowThreadProcessId(IntPtr window, out uint pid);
    [DllImport("user32.dll")] private static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] private static extern bool IsIconic(IntPtr window);
    [DllImport("dwmapi.dll")] private static extern int DwmGetWindowAttribute(IntPtr window, int attribute, out int value, int size);
    [DllImport("advapi32.dll", SetLastError = true)] private static extern bool OpenProcessToken(IntPtr process, uint access, out SafeAccessTokenHandle token);
    [DllImport("kernel32.dll")] private static extern uint GetCurrentThreadId();
    [DllImport("user32.dll")] private static extern bool AttachThreadInput(uint from, uint to, bool attach);
    [DllImport("user32.dll")] private static extern bool ShowWindowAsync(IntPtr window, int command);
    [DllImport("user32.dll")] private static extern bool BringWindowToTop(IntPtr window);
    [DllImport("user32.dll")] private static extern bool SetForegroundWindow(IntPtr window);
}
