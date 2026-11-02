// Opt-in read-only capture check. No privacy covers, input or saved screen pixels.
using System.Reflection;
using System.Runtime.Loader;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;
internal static class CaptureCheck
{
 [DllImport("user32.dll")] private static extern bool SetProcessDPIAware();
 [STAThread] static int Main(string[] args)
 {
  if(args.Length!=1)throw new ArgumentException("Pass the built RemoteAgent.dll path.");
  SetProcessDPIAware();var file=Path.GetFullPath(args[0]);var root=Path.GetDirectoryName(file)!;
  AssemblyLoadContext.Default.Resolving+=(_,name)=>{var dependency=Path.Combine(root,name.Name+".dll");return File.Exists(dependency)?AssemblyLoadContext.Default.LoadFromAssemblyPath(dependency):null;};
  var assembly=AssemblyLoadContext.Default.LoadFromAssemblyPath(file);var type=assembly.GetType("DesktopCapture",true)!;var bounds=System.Windows.Forms.Screen.PrimaryScreen!.Bounds;
  using var capture=(IDisposable)Activator.CreateInstance(type,[bounds,true])!;using var bitmap=new System.Drawing.Bitmap(bounds.Width,bounds.Height,PixelFormat.Format32bppArgb);
  var method=type.GetMethod("Capture")!;int frames=0;long start=Environment.TickCount64;
  while(frames<3&&Environment.TickCount64-start<10000){object[] values=[bitmap,true,false];if((bool)method.Invoke(capture,values)!)frames++;else Thread.Sleep(20);}
  var backend=(string)type.GetProperty("Backend")!.GetValue(capture)!;var embedded=(bool)type.GetProperty("CursorEmbedded")!.GetValue(capture)!;
  var window=type.GetField("cursorFreeCapture",BindingFlags.NonPublic|BindingFlags.Instance)!.GetValue(capture);bool cachedRestored=false;
  if(window!=null)for(int i=0;i<120&&!cachedRestored;i++){
   var previous=bitmap.GetPixel(0,0);bitmap.SetPixel(0,0,System.Drawing.Color.FromArgb(255-previous.R,255-previous.G,255-previous.B));object[] values=[bitmap,true,false];if(!(bool)method.Invoke(capture,values)!)continue;
   bool fresh=(bool)window.GetType().GetProperty("FrameChanged")!.GetValue(window)!;if(!fresh)cachedRestored=bitmap.GetPixel(0,0).ToArgb()==previous.ToArgb();
  }
  var captureSize=window?.GetType().GetProperty("Size")?.GetValue(window);
  Console.WriteLine(System.Text.Json.JsonSerializer.Serialize(new{frames,backend,cursorEmbedded=embedded,cachedTargetRestored=cachedRestored,desktopWidth=bounds.Width,desktopHeight=bounds.Height,captureSize,elapsedMs=Environment.TickCount64-start}));
  return frames==3&&backend=="wgc"&&!embedded&&cachedRestored?0:1;
 }
}
