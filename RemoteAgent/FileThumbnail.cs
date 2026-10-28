using System.Drawing;
using System.Runtime.InteropServices;
using System.Text.Json;
using System.Windows.Media.Imaging;

internal static class FileThumbnail
{
    [StructLayout(LayoutKind.Sequential)] private struct Size { public int Width, Height; }
    [ComImport, Guid("bcc18b79-ba16-442f-80c4-8a59c30c463b"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface ImageFactory { [PreserveSig] int GetImage(Size size, uint flags, out IntPtr bitmap); }
    [DllImport("shell32.dll", CharSet=CharSet.Unicode, PreserveSig=true)] private static extern int SHCreateItemFromParsingName(string path, IntPtr context, ref Guid iid, [MarshalAs(UnmanagedType.Interface)] out ImageFactory item);
    [DllImport("gdi32.dll")] private static extern bool DeleteObject(IntPtr handle);

    internal static void Run()
    {
        ImageFactory? item=null;IntPtr bitmap=IntPtr.Zero;
        try
        {
            using var input=JsonDocument.Parse(Console.In.ReadToEnd());
            var path=input.RootElement.GetProperty("path").GetString();
            if(string.IsNullOrWhiteSpace(path)||!System.IO.Path.IsPathFullyQualified(path)||(!File.Exists(path)&&!Directory.Exists(path)))throw new ArgumentException();
            var iid=typeof(ImageFactory).GUID;
            Marshal.ThrowExceptionForHR(SHCreateItemFromParsingName(path,IntPtr.Zero,ref iid,out item));
            // Windows supplies its own cached thumbnail or the associated file/folder icon.
            Marshal.ThrowExceptionForHR(item.GetImage(new Size{Width=128,Height=128},0,out bitmap));
            var source=System.Windows.Interop.Imaging.CreateBitmapSourceFromHBitmap(bitmap,IntPtr.Zero,System.Windows.Int32Rect.Empty,BitmapSizeOptions.FromEmptyOptions());
            var encoder=new PngBitmapEncoder();encoder.Frames.Add(BitmapFrame.Create(source));
            using var output=new MemoryStream();encoder.Save(output);
            if(output.Length>256*1024)throw new InvalidOperationException();
            Console.WriteLine(JsonSerializer.Serialize(new {ok=true,data=Convert.ToBase64String(output.ToArray())}));
        }
        catch{Console.WriteLine("{\"ok\":false,\"error\":\"Windows preview unavailable.\"}");}
        finally{if(bitmap!=IntPtr.Zero)DeleteObject(bitmap);if(item!=null&&Marshal.IsComObject(item))Marshal.ReleaseComObject(item);}
    }
}
