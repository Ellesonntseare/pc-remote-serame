using System;

internal static class BgraCopy
{
    // D3D textures use BGRA rows; JPEG capture uses packed BGR rows. Respect
    // both pitches, including padded and bottom-up destination bitmaps.
    public static unsafe void Copy(IntPtr source, int sourcePitch, IntPtr destination, int destinationPitch, int width, int height)
    {
        if(width<=0||height<=0||sourcePitch<checked(width*4)||Math.Abs((long)destinationPitch)<checked(width*3)||source==IntPtr.Zero||destination==IntPtr.Zero)throw new ArgumentException("Invalid capture surface");
        for(int y=0;y<height;y++)
        {
            byte* src=(byte*)source+y*(long)sourcePitch;byte* dst=(byte*)destination+y*(long)destinationPitch;
            for(int x=0;x<width;x++){dst[x*3]=src[x*4];dst[x*3+1]=src[x*4+1];dst[x*3+2]=src[x*4+2];}
        }
    }
}
