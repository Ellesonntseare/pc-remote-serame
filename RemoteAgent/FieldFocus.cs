using System.Windows.Automation;

// Read only the kind of the focused control, never its value, name or contents.
// A slow provider must not stall the input loop or create unbounded workers.
internal static class FieldFocus
{
    private static int busy;
    public static bool? EditableAt(int x, int y)
    {
        if (Interlocked.CompareExchange(ref busy, 1, 0) != 0) return null;
        var result = new TaskCompletionSource<bool?>(TaskCreationOptions.RunContinuationsAsynchronously);
        var worker = new Thread(() =>
        {
            try
            {
                Thread.Sleep(65); // Let the target process handle the preceding click.
                var element = AutomationElement.FocusedElement;
                if (element == null) { result.TrySetResult(false); return; }
                var info = element.Current;
                if (!info.IsEnabled || !info.HasKeyboardFocus || !info.BoundingRectangle.Contains(x, y))
                { result.TrySetResult(false); return; }
                if (element.TryGetCurrentPattern(ValuePattern.Pattern, out var value))
                { result.TrySetResult(!((ValuePattern)value).Current.IsReadOnly); return; }
                if (element.TryGetCurrentPattern(TextPattern.Pattern, out var text))
                {
                    var readOnly = ((TextPattern)text).DocumentRange.GetAttributeValue(TextPattern.IsReadOnlyAttribute);
                    if (readOnly is bool locked) { result.TrySetResult(!locked); return; }
                }
                result.TrySetResult(info.ControlType == ControlType.Edit ? true : false);
            }
            catch { result.TrySetResult(null); }
            finally { Volatile.Write(ref busy, 0); }
        }) { IsBackground = true, Name = "Remote field detection" };
        worker.SetApartmentState(ApartmentState.MTA); worker.Start();
        return result.Task.Wait(300) ? result.Task.Result : null;
    }
}
