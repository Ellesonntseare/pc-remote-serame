using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;
using Vortice.Direct3D;
using Vortice.Direct3D11;
using Vortice.DXGI;
using Windows.Graphics.Capture;
using Windows.Graphics.DirectX;
using Windows.Graphics.DirectX.Direct3D11;
using WinRT;

/** Capture the selected window through WGC, including when another window covers it. */
internal sealed class WindowCapture : IDisposable
{
    private ID3D11Device? device;
    private ID3D11DeviceContext? context;
    private IDirect3DDevice? runtimeDevice;
    private GraphicsCaptureItem? item;
    private Direct3D11CaptureFramePool? pool;
    private GraphicsCaptureSession? session;
    private ID3D11Texture2D? staging;
    private volatile bool closed;
    private bool havePixels;
    private int width, height;
    public Size Size => new(width, height);
    public bool FrameChanged { get; private set; }

    public WindowCapture(IntPtr window, bool monitor = false, bool captureCursor = true)
    {
        try
        {
            if (!GraphicsCaptureSession.IsSupported()) throw new NotSupportedException("Window presentation needs Windows 10 version 1903 or newer.");
            item = CreateItem(window, monitor);width = item.Size.Width;height = item.Size.Height;
            if (width < 2 || height < 2 || width > 16384 || height > 16384) throw new InvalidOperationException("Restore this window before presenting it.");
            item.Closed += (_, _) => closed = true;
            D3D11.D3D11CreateDevice(null, DriverType.Hardware, DeviceCreationFlags.BgraSupport,
                new[] { FeatureLevel.Level_11_0, FeatureLevel.Level_10_0 }, out ID3D11Device d, out ID3D11DeviceContext c).CheckError();
            device = d;context = c;
            using var dxgi = device.QueryInterface<IDXGIDevice>();
            Marshal.ThrowExceptionForHR(CreateDirect3D11DeviceFromDXGIDevice(dxgi.NativePointer, out var pointer));
            try { runtimeDevice = MarshalInterface<IDirect3DDevice>.FromAbi(pointer); }
            finally { Marshal.Release(pointer); }
            pool = Direct3D11CaptureFramePool.CreateFreeThreaded(runtimeDevice, DirectXPixelFormat.B8G8R8A8UIntNormalized, 2, item.Size);
            session = pool.CreateCaptureSession(item);
            if (OperatingSystem.IsWindowsVersionAtLeast(10,0,19041)) session.IsCursorCaptureEnabled = captureCursor;
            session.StartCapture();
        }
        catch { Dispose();throw; }
    }

    public bool Capture(Bitmap target)
    {
        FrameChanged=false;
        if (closed) throw new InvalidOperationException("The presentation window closed. Choose another window.");
        using var frame = pool!.TryGetNextFrame();if (frame == null){if(havePixels)CopyTo(target);return havePixels;}
        var size = frame.ContentSize;if (size.Width != width || size.Height != height)
        {
            if(size.Width<2||size.Height<2||size.Width>16384||size.Height>16384)return false;
            frame.Dispose();width=size.Width;height=size.Height;staging?.Dispose();staging=null;havePixels=false;
            pool.Recreate(runtimeDevice,DirectXPixelFormat.B8G8R8A8UIntNormalized,2,size);return false;
        }
        var access = frame.Surface.As<IDirect3DDxgiInterfaceAccess>();
        var iid = typeof(ID3D11Texture2D).GUID;IntPtr pointer;
        try{access.GetInterface(ref iid, out pointer);}finally{if(Marshal.IsComObject(access))Marshal.ReleaseComObject(access);}
        using var texture = new ID3D11Texture2D(pointer);
        staging ??= device!.CreateTexture2D(new Texture2DDescription(Format.B8G8R8A8_UNorm, (uint)width, (uint)height,
            mipLevels: 1, bindFlags: BindFlags.None, usage: ResourceUsage.Staging, cpuAccessFlags: CpuAccessFlags.Read));
        context!.CopyResource(staging, texture);
        CopyTo(target);havePixels=true;FrameChanged=true;return true;
    }

    private void CopyTo(Bitmap target)
    {
        var mapped = context!.Map(staging!, 0, MapMode.Read, Vortice.Direct3D11.MapFlags.None);
        try
        {
            using var source = new Bitmap(width, height, checked((int)mapped.RowPitch), PixelFormat.Format32bppArgb, mapped.DataPointer);
            using var graphics = Graphics.FromImage(target);graphics.Clear(Color.Black);
            graphics.InterpolationMode = System.Drawing.Drawing2D.InterpolationMode.Bilinear;
            graphics.CompositingMode = System.Drawing.Drawing2D.CompositingMode.SourceCopy;
            double scale=Math.Min((double)target.Width/width,(double)target.Height/height);int w=Math.Max(1,(int)(width*scale)),h=Math.Max(1,(int)(height*scale));
            graphics.DrawImage(source, new Rectangle((target.Width-w)/2, (target.Height-h)/2, w, h), 0, 0, width, height, GraphicsUnit.Pixel);
        }
        finally { context.Unmap(staging, 0); }
    }

    private static GraphicsCaptureItem CreateItem(IntPtr window, bool monitor)
    {
        const string name = "Windows.Graphics.Capture.GraphicsCaptureItem";
        Marshal.ThrowExceptionForHR(WindowsCreateString(name, name.Length, out var className));
        IntPtr factory = IntPtr.Zero, item = IntPtr.Zero;
        try
        {
            var factoryId = typeof(IGraphicsCaptureItemInterop).GUID;
            Marshal.ThrowExceptionForHR(RoGetActivationFactory(className, ref factoryId, out factory));
            var interop = (IGraphicsCaptureItemInterop)Marshal.GetObjectForIUnknown(factory);
            try { var itemId = new Guid("79C3F95B-31F7-4EC2-A464-632EF5D30760");if(monitor)interop.CreateForMonitor(window, ref itemId, out item);else interop.CreateForWindow(window, ref itemId, out item);return MarshalInterface<GraphicsCaptureItem>.FromAbi(item); }
            finally { Marshal.ReleaseComObject(interop); }
        }
        finally { if (item != IntPtr.Zero) Marshal.Release(item);if (factory != IntPtr.Zero) Marshal.Release(factory);WindowsDeleteString(className); }
    }

    public void Dispose()
    {
        session?.Dispose();session = null;pool?.Dispose();pool = null;item = null;
        staging?.Dispose();staging = null;runtimeDevice?.Dispose();runtimeDevice = null;
        context?.Dispose();context = null;device?.Dispose();device = null;
    }

    [ComImport, Guid("3628E81B-3CAC-4C60-B7F4-23CE0E0C3356"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IGraphicsCaptureItemInterop
    {
        void CreateForWindow(IntPtr window, ref Guid iid, out IntPtr item);
        void CreateForMonitor(IntPtr monitor, ref Guid iid, out IntPtr item);
    }
    [ComImport, Guid("A9B3D012-3DF2-4EE3-B8D1-8695F457D3C1"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IDirect3DDxgiInterfaceAccess { void GetInterface(ref Guid iid, out IntPtr value); }
    [DllImport("d3d11.dll")] private static extern int CreateDirect3D11DeviceFromDXGIDevice(IntPtr dxgiDevice, out IntPtr device);
    [DllImport("combase.dll", CharSet = CharSet.Unicode)] private static extern int WindowsCreateString(string text, int length, out IntPtr value);
    [DllImport("combase.dll")] private static extern int WindowsDeleteString(IntPtr value);
    [DllImport("combase.dll")] private static extern int RoGetActivationFactory(IntPtr name, ref Guid iid, out IntPtr factory);
}
