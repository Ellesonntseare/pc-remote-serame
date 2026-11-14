using System.Runtime.InteropServices;

// Use Windows' visibility API, never replace the user's cursor files or cursor scheme.
internal sealed class PrivacyCursor : IDisposable
{
    [DllImport("Magnification.dll",SetLastError=true)] private static extern bool MagInitialize();
    [DllImport("Magnification.dll",SetLastError=true)] private static extern bool MagUninitialize();
    [DllImport("Magnification.dll",SetLastError=true)] private static extern bool MagShowSystemCursor(bool show);
    private bool initialized,hidden,restoreVisible=true;
    internal void Hide()
    {
        if(!initialized){var info=new Native.CURSORINFO{cbSize=Marshal.SizeOf<Native.CURSORINFO>()};if(Native.GetCursorInfo(ref info))restoreVisible=(info.flags&1)!=0;if(!MagInitialize())throw new InvalidOperationException("Windows could not prepare cursor privacy.");initialized=true;}
        if(!MagShowSystemCursor(false))throw new InvalidOperationException("Windows could not hide the local mouse pointer.");
        hidden=true;
    }
    public void Dispose()
    {
        if(hidden){MagShowSystemCursor(restoreVisible);hidden=false;}
        if(initialized){MagUninitialize();initialized=false;}
    }
}
