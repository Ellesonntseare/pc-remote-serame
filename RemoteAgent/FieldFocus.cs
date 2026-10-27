using System.Windows.Automation;
using System.Runtime.InteropServices;

// Read only the kind of the focused control, never its value, name or contents.
// A slow provider must not stall the input loop or create unbounded workers.
internal static class FieldFocus
{
    private static int busy;
    public static bool? EditableAt(int x, int y)
    {
        var caret = CaretAt(x, y);
        if (Interlocked.CompareExchange(ref busy, 1, 0) != 0) return caret;
        var result = new TaskCompletionSource<bool?>(TaskCreationOptions.RunContinuationsAsynchronously);
        var worker = new Thread(() =>
        {
            try
            {
                Thread.Sleep(65); // Let the target process handle the preceding click.
                var element = AutomationElement.FocusedElement;
                if (element == null) { result.TrySetResult(caret); return; }
                var info = element.Current;
                if(Environment.GetEnvironmentVariable("PCR_FOCUS_DIAGNOSTICS")=="1")Console.Error.WriteLine($"Focus: {info.ControlType.ProgrammaticName}; focused={info.HasKeyboardFocus}; bounds={info.BoundingRectangle}; point={x},{y}; caret={caret}");
                if (!info.IsEnabled) { result.TrySetResult(false); return; }
                var bounds = info.BoundingRectangle;
                if (!bounds.IsEmpty) bounds.Inflate(10, 10); // Text-box borders are valid taps too.
                if (!info.HasKeyboardFocus || !bounds.Contains(x, y))
                { result.TrySetResult(caret); return; }
                var focused = Editable(element);
                if (focused == true || info.ControlType == ControlType.Edit) { result.TrySetResult(focused);return; }
                // Chromium and embedded web views can expose the document as
                // focused while its clicked child is the actual editor.
                var candidate = AutomationElement.FromPoint(new System.Windows.Point(x,y));
                for(int depth=0;candidate!=null&&depth<6;depth++)
                {
                    var target=candidate.Current;if(target.ProcessId!=info.ProcessId)break;
                    if(target.BoundingRectangle.Contains(x,y))
                    {
                        var editable=Editable(candidate);
                        if(editable==true||target.ControlType==ControlType.Edit){result.TrySetResult(editable);return;}
                    }
                    if(candidate.Equals(element))break;
                    candidate=TreeWalker.ControlViewWalker.GetParent(candidate);
                }
                result.TrySetResult(focused??false);
            }
            catch { result.TrySetResult(caret); }
            finally { Volatile.Write(ref busy, 0); }
        }) { IsBackground = true, Name = "Remote field detection" };
        worker.SetApartmentState(ApartmentState.MTA); worker.Start();
        return result.Task.Wait(350) ? result.Task.Result : caret;
    }

    private static bool? Editable(AutomationElement element)
    {
        if(!element.Current.IsEnabled)return false;
        if(element.TryGetCurrentPattern(ValuePattern.Pattern,out var value))return !((ValuePattern)value).Current.IsReadOnly;
        if(element.TryGetCurrentPattern(TextPattern.Pattern,out var text))
        {
            var readOnly=((TextPattern)text).DocumentRange.GetAttributeValue(TextPattern.IsReadOnlyAttribute);
            if(readOnly is bool locked)return !locked;
        }
        return element.Current.ControlType==ControlType.Edit?true:null;
    }

    private static bool? CaretAt(int x, int y)
    {
        var info = new GuiThreadInfo { Size = (uint)Marshal.SizeOf<GuiThreadInfo>() };
        if (!GetGUIThreadInfo(0, ref info) || info.Focus == IntPtr.Zero || info.Caret == IntPtr.Zero ||
            info.CaretRect.Bottom <= info.CaretRect.Top || !GetWindowRect(info.Focus, out var bounds)) return null;
        return x >= bounds.Left && x <= bounds.Right && y >= bounds.Top && y <= bounds.Bottom ? true : null;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct NativeRect { public int Left, Top, Right, Bottom; }
    [StructLayout(LayoutKind.Sequential)]
    private struct GuiThreadInfo
    {
        public uint Size, Flags;
        public IntPtr Active, Focus, Capture, MenuOwner, MoveSize, Caret;
        public NativeRect CaretRect;
    }
    [DllImport("user32.dll")] private static extern bool GetGUIThreadInfo(uint threadId, ref GuiThreadInfo info);
    [DllImport("user32.dll")] private static extern bool GetWindowRect(IntPtr window, out NativeRect bounds);
}
