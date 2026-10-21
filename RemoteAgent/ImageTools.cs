using System.Drawing;
using System.Drawing.Imaging;
using System.Text.Json;
using System.Windows.Forms;
using Windows.Graphics.Imaging;
using Windows.Media.Ocr;
using Windows.Storage.Streams;

internal static class ImageTools
{
    internal static void Run(string mode)
    {
        try
        {
            if(mode=="--clipboard-image-read")
            {
                using var image=Clipboard.GetImage();
                if(image==null){Console.WriteLine("{\"ok\":true,\"data\":null}");return;}
                CheckSize(image.Width,image.Height);using var output=new MemoryStream();image.Save(output,ImageFormat.Png);
                if(output.Length>8*1024*1024)throw new ArgumentException("Clipboard image is too large.");
                Console.WriteLine(JsonSerializer.Serialize(new {ok=true,data=Convert.ToBase64String(output.ToArray()),width=image.Width,height=image.Height}));return;
            }
            string value=Console.In.ReadToEnd();if(value.Length>11200000)throw new ArgumentException("Image is too large.");byte[] bytes=Convert.FromBase64String(value);
            if(bytes.Length>8*1024*1024||bytes.Length<33||!bytes.AsSpan(0,8).SequenceEqual(new byte[]{137,80,78,71,13,10,26,10}))throw new ArgumentException("Use a PNG image under 8 MB.");
            using var input=new MemoryStream(bytes);using var decoded=Image.FromStream(input);CheckSize(decoded.Width,decoded.Height);
            if(mode=="--clipboard-image-write"){using var bitmap=new Bitmap(decoded);Clipboard.SetImage(bitmap);Console.WriteLine("{\"ok\":true}");return;}
            Console.WriteLine(JsonSerializer.Serialize(new {ok=true,text=Recognize(bytes).GetAwaiter().GetResult()}));
        }
        catch(Exception e){Console.WriteLine(JsonSerializer.Serialize(new {ok=false,error=e.Message}));Environment.ExitCode=1;}
    }
    private static void CheckSize(int width,int height){if(width<1||height<1||width>4096||height>4096||(long)width*height>16000000)throw new ArgumentException("Use an image up to 4096 pixels per side.");}
    private static async Task<string> Recognize(byte[] bytes)
    {
        var engine=OcrEngine.TryCreateFromUserProfileLanguages();
        if(engine==null){var language=OcrEngine.AvailableRecognizerLanguages.FirstOrDefault();if(language!=null)engine=OcrEngine.TryCreateFromLanguage(language);}
        if(engine==null)throw new InvalidOperationException("Install a text recognition language in Windows to use this feature.");
        using var stream=new InMemoryRandomAccessStream();
        using(var writer=new DataWriter(stream.GetOutputStreamAt(0))){writer.WriteBytes(bytes);await writer.StoreAsync();}
        stream.Seek(0);var decoder=await BitmapDecoder.CreateAsync(stream);
        var scale=Math.Min(1.0,(double)OcrEngine.MaxImageDimension/Math.Max(decoder.PixelWidth,decoder.PixelHeight));
        var transform=new BitmapTransform{ScaledWidth=Math.Max(1,(uint)Math.Round(decoder.PixelWidth*scale)),ScaledHeight=Math.Max(1,(uint)Math.Round(decoder.PixelHeight*scale))};
        using var bitmap=await decoder.GetSoftwareBitmapAsync(BitmapPixelFormat.Bgra8,BitmapAlphaMode.Premultiplied,transform,ExifOrientationMode.IgnoreExifOrientation,ColorManagementMode.DoNotColorManage);
        var result=await engine.RecognizeAsync(bitmap);return string.Join("\n",result.Lines.Select(line=>line.Text));
    }
}
