using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;

// Reconfigure the encoded surface without restarting input or changing native
// pointer coordinates. Base generations remain unique across size changes.
internal sealed class ScreenOutput : IDisposable
{
    public Bitmap Image { get; private set; } = null!;
    public Graphics Graphics { get; private set; } = null!;
    public DesktopFrameEncoder Encoder { get; private set; } = null!;
    public void Resize(int width, int height)
    {
        if(Image?.Width == width && Image.Height == height)return;
        uint generation = Encoder?.Generation ?? 0;
        Graphics?.Dispose(); Image?.Dispose(); Encoder?.Dispose();
        Image = new Bitmap(width, height, PixelFormat.Format24bppRgb);
        Graphics = Graphics.FromImage(Image); Graphics.InterpolationMode = InterpolationMode.Bilinear;
        Encoder = new DesktopFrameEncoder(width, height, generation);
    }
    public void Dispose() { Graphics?.Dispose(); Image?.Dispose(); Encoder?.Dispose(); }
}
