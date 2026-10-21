using System.Drawing;
using System.Drawing.Imaging;
using System.Text.Json;
internal class Checks {
  [STAThread] static void Main(){
    using var image=new Bitmap(1000,160);using(var graphics=Graphics.FromImage(image)){graphics.Clear(Color.White);using var font=new Font("Arial",44,FontStyle.Bold);graphics.DrawString("SERAME TEST 42",font,Brushes.Black,20,35);}
    using var png=new MemoryStream();image.Save(png,ImageFormat.Png);var originalOut=Console.Out;var originalIn=Console.In;using var result=new StringWriter();Console.SetIn(new StringReader(Convert.ToBase64String(png.ToArray())));Console.SetOut(result);ImageTools.Run("--ocr");Console.SetOut(originalOut);Console.SetIn(originalIn);
    using var response=JsonDocument.Parse(result.ToString());if(!response.RootElement.GetProperty("ok").GetBoolean())throw new Exception(response.RootElement.GetProperty("error").GetString());var text=response.RootElement.GetProperty("text").GetString()??"";if(!text.Contains("SERAME")||!text.Contains("42"))throw new Exception("Synthetic OCR result did not match");Console.WriteLine("Synthetic image text recognition passed: "+text);
  }
}
