using System.Buffers.Binary;
using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;

// Each patch contains every changed pixel since its keyframe. Intermediate
// patches can therefore be discarded without leaving stale areas on screen.
internal sealed class DesktopFrameEncoder : IDisposable
{
    private readonly int width, height, rowBytes;
    private byte[] previous, current;
    private bool havePrevious;
    private Rectangle changed;
    private uint generation;
    private long lastKeyframe;
    private readonly ImageCodecInfo jpeg = ImageCodecInfo.GetImageEncoders().First(e => e.MimeType == "image/jpeg");
    private readonly EncoderParameters parameters = new(1);
    private readonly MemoryStream output = new();
    private int quality = -1;

    public uint Generation => generation;
    public DesktopFrameEncoder(int width, int height, uint generationSeed = 0)
    {
        generation = generationSeed;
        this.width = width; this.height = height; rowBytes = checked(width * 3);
        previous = new byte[checked(rowBytes * height)]; current = new byte[previous.Length];
    }

    public byte[]? Encode(Bitmap image, int requestedQuality, bool refresh, long now)
    {
        if (image.Width != width || image.Height != height) throw new ArgumentException("Screen dimensions changed");
        var bits = image.LockBits(new Rectangle(0, 0, width, height), ImageLockMode.ReadOnly, PixelFormat.Format24bppRgb);
        try
        {
            for (int y = 0; y < height; y++) Marshal.Copy(IntPtr.Add(bits.Scan0, y * bits.Stride), current, y * rowBytes, rowBytes);
        }
        finally { image.UnlockBits(bits); }

        Rectangle dirty = Rectangle.Empty;
        if (havePrevious)
        {
            int left = width, right = 0, top = height, bottom = 0;
            for (int y = 0; y < height; y++)
            {
                var row = current.AsSpan(y * rowBytes, rowBytes);
                var old = previous.AsSpan(y * rowBytes, rowBytes);
                if (row.SequenceEqual(old)) continue;
                int first = 0, last = rowBytes - 1;
                while (row[first] == old[first]) first++;
                while (row[last] == old[last]) last--;
                left = Math.Min(left, first / 3); right = Math.Max(right, last / 3 + 1);
                top = Math.Min(top, y); bottom = y + 1;
            }
            if (right > left)
            {
                // Align JPEG blocks to the full image grid to reduce patch seams.
                left = left / 16 * 16; top = top / 16 * 16;
                right = Math.Min(width, (right + 15) / 16 * 16); bottom = Math.Min(height, (bottom + 15) / 16 * 16);
                dirty = Rectangle.FromLTRB(left, top, right, bottom);
            }
        }
        bool keyframe = !havePrevious || refresh || quality != requestedQuality;
        (previous, current) = (current, previous); havePrevious = true;
        if (!keyframe && dirty.IsEmpty) return null;
        if (!dirty.IsEmpty) changed = changed.IsEmpty ? dirty : Rectangle.Union(changed, dirty);
        keyframe |= now - lastKeyframe >= 5000 || (long)changed.Width * changed.Height > (long)width * height * 65 / 100;
        Rectangle region;
        if (keyframe)
        {
            generation++; if (generation == 0) generation++;
            lastKeyframe = now; changed = Rectangle.Empty; region = new Rectangle(0, 0, width, height);
        }
        else region = changed;
        if (quality != requestedQuality)
        {
            parameters.Param[0]?.Dispose(); quality = requestedQuality;
            parameters.Param[0] = new EncoderParameter(System.Drawing.Imaging.Encoder.Quality, quality);
        }
        output.Position = 0; output.SetLength(0);
        if (keyframe) image.Save(output, jpeg, parameters);
        else
        {
            using var patch = image.Clone(region, PixelFormat.Format24bppRgb);
            patch.Save(output, jpeg, parameters);
        }
        var payload = new byte[checked(21 + (int)output.Length)];
        payload[0] = keyframe ? (byte)1 : (byte)0;
        BinaryPrimitives.WriteUInt32BigEndian(payload.AsSpan(1), generation);
        BinaryPrimitives.WriteUInt32BigEndian(payload.AsSpan(5), (uint)width);
        BinaryPrimitives.WriteUInt32BigEndian(payload.AsSpan(9), (uint)height);
        BinaryPrimitives.WriteUInt32BigEndian(payload.AsSpan(13), (uint)region.X);
        BinaryPrimitives.WriteUInt32BigEndian(payload.AsSpan(17), (uint)region.Y);
        output.GetBuffer().AsSpan(0, (int)output.Length).CopyTo(payload.AsSpan(21));
        return payload;
    }

    public void Dispose() { parameters.Dispose(); output.Dispose(); }
}
