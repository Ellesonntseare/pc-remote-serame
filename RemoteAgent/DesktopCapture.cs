using System.Drawing;
using System.Drawing.Imaging;
using Vortice.Direct3D;
using Vortice.Direct3D11;
using Vortice.DXGI;

internal sealed class DesktopCapture : IDisposable
{
    private GpuDesktopCapture? gpu;
    private WindowCapture? privacyCapture;
    [System.Runtime.InteropServices.DllImport("user32.dll")] private static extern IntPtr MonitorFromPoint(Point point, uint flags);
    private readonly Rectangle bounds;
    private bool retryGpu;
    private long nextRetry;
    public string Backend => privacyCapture is not null ? "wgc" : gpu is null ? "gdi" : "dxgi";
    public DesktopCapture(Rectangle bounds, bool preferGpu=true)
    {
        this.bounds=bounds;retryGpu=preferGpu;
        if(preferGpu&&!PrivacyDisplay.CaptureRequested)TryGpu();
    }
    private void TryGpu()
    {
        nextRetry=Environment.TickCount64+10000;
        try{gpu=GpuDesktopCapture.Create(bounds);Console.Error.WriteLine("Capture: Windows GPU desktop duplication.");}
        catch{gpu?.Dispose();gpu=null;Console.Error.WriteLine("Capture: standard Windows fallback; GPU capture will be retried.");}
    }
    public bool Capture(Bitmap target, bool requirePixels, out bool changed)
    {
        if(PrivacyDisplay.CaptureRequested)
        {
            // Never fall back to a path that may include the physical privacy cover.
            gpu?.Dispose();gpu=null;
            privacyCapture ??= new WindowCapture(MonitorFromPoint(new Point(bounds.Left+bounds.Width/2,bounds.Top+bounds.Height/2),2),monitor:true);
            changed=true;return privacyCapture.Capture(target);
        }
        if(privacyCapture is not null){privacyCapture.Dispose();privacyCapture=null;nextRetry=0;}
        if(gpu is null&&retryGpu&&Environment.TickCount64>=nextRetry)TryGpu();
        if(gpu is not null)
        {
            try{return gpu.Capture(target,requirePixels,out changed);}
            catch{gpu.Dispose();gpu=null;nextRetry=Environment.TickCount64+10000;Console.Error.WriteLine("GPU capture reset; using standard capture until the desktop is ready.");}
        }
        using var graphics=Graphics.FromImage(target);graphics.CopyFromScreen(bounds.Left,bounds.Top,0,0,bounds.Size);changed=true;return true;
    }
    public void Dispose(){privacyCapture?.Dispose();privacyCapture=null;gpu?.Dispose();gpu=null;retryGpu=false;}
}

internal sealed class GpuDesktopCapture : IDisposable
{
    private ID3D11Device? device;
    private ID3D11DeviceContext? context;
    private IDXGIOutputDuplication? duplication;
    private ID3D11Texture2D? staging;
    private bool havePixels;
    private readonly int width,height;
    private GpuDesktopCapture(int width,int height){this.width=width;this.height=height;}
    public static GpuDesktopCapture Create(Rectangle bounds)
    {
        using var factory=DXGI.CreateDXGIFactory1<IDXGIFactory1>();
        for(uint a=0;factory.EnumAdapters1(a,out var adapter).Success;a++)
        using(adapter)
        for(uint o=0;adapter.EnumOutputs(o,out var output).Success;o++)
        using(output)
        {
            var description=output.Description;var r=description.DesktopCoordinates;
            if(!description.AttachedToDesktop||r.Left!=bounds.Left||r.Top!=bounds.Top||r.Right-r.Left!=bounds.Width||r.Bottom-r.Top!=bounds.Height)continue;
            if(description.Rotation!=ModeRotation.Identity&&description.Rotation!=ModeRotation.Unspecified)throw new NotSupportedException("Rotated display requires standard capture");
            var capture=new GpuDesktopCapture(bounds.Width,bounds.Height);
            try
            {
                D3D11.D3D11CreateDevice(adapter,DriverType.Unknown,DeviceCreationFlags.BgraSupport,new[]{FeatureLevel.Level_11_0,FeatureLevel.Level_10_0},out ID3D11Device d,out ID3D11DeviceContext c).CheckError();
                capture.device=d;capture.context=c;
                using var output1=output.QueryInterface<IDXGIOutput1>();capture.duplication=output1.DuplicateOutput(d);
                var desc=new Texture2DDescription(Format.B8G8R8A8_UNorm,(uint)bounds.Width,(uint)bounds.Height,mipLevels:1,bindFlags:BindFlags.None,usage:ResourceUsage.Staging,cpuAccessFlags:CpuAccessFlags.Read);
                capture.staging=d.CreateTexture2D(desc);return capture;
            }
            catch{capture.Dispose();throw;}
        }
        throw new InvalidOperationException("Primary display is not available for GPU capture");
    }
    public bool Capture(Bitmap target,bool requirePixels,out bool changed)
    {
        changed=false;bool acquired=false;
        var result=duplication!.AcquireNextFrame(0,out var information,out var resource);
        if(result.Code==unchecked((int)0x887A0027))
        {
            resource?.Dispose();if(havePixels&&requirePixels)CopyTo(target);return havePixels;
        }
        result.CheckError();acquired=true;
        try
        {
            using(resource)
            {
                changed=!havePixels||information.LastPresentTime!=0;
                if(changed){using var texture=resource.QueryInterface<ID3D11Texture2D>();context!.CopyResource(staging!,texture);havePixels=true;}
                if(changed||requirePixels)CopyTo(target);
                return havePixels;
            }
        }
        finally{if(acquired)duplication.ReleaseFrame().CheckError();}
    }
    private void CopyTo(Bitmap target)
    {
        if(target.Width!=width||target.Height!=height)throw new ArgumentException("Capture target dimensions changed");
        var mapped=context!.Map(staging!,0,MapMode.Read,Vortice.Direct3D11.MapFlags.None);
        try
        {
            var bits=target.LockBits(new Rectangle(0,0,width,height),ImageLockMode.WriteOnly,PixelFormat.Format24bppRgb);
            try{BgraCopy.Copy(mapped.DataPointer,checked((int)mapped.RowPitch),bits.Scan0,bits.Stride,width,height);}
            finally{target.UnlockBits(bits);}
        }
        finally{context.Unmap(staging!,0);}
    }
    public void Dispose(){staging?.Dispose();staging=null;duplication?.Dispose();duplication=null;context?.Dispose();context=null;device?.Dispose();device=null;}
}
