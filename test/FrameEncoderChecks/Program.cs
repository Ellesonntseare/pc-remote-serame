using System.Buffers.Binary;
using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;
using System.Diagnostics;

static void Check(bool value, string message) { if (!value) throw new Exception(message); }
static uint Read(byte[] p, int offset) => BinaryPrimitives.ReadUInt32BigEndian(p.AsSpan(offset));
static Bitmap Decode(byte[] p) { using var stream = new MemoryStream(p, 21, p.Length - 21); using var image = new Bitmap(stream); return new Bitmap(image); }
static void Paint(Bitmap b, Rectangle rect, Color color) { using var g = Graphics.FromImage(b); using var brush = new SolidBrush(color); g.FillRectangle(brush, rect); }

using var screen = new Bitmap(3840, 2160, PixelFormat.Format24bppRgb);
var bits = screen.LockBits(new Rectangle(0,0,screen.Width,screen.Height), ImageLockMode.WriteOnly, PixelFormat.Format24bppRgb);
try { var bytes = new byte[bits.Stride * bits.Height]; new Random(7).NextBytes(bytes); Marshal.Copy(bytes,0,bits.Scan0,bytes.Length); }
finally { screen.UnlockBits(bits); }
using var encoder = new DesktopFrameEncoder(screen.Width, screen.Height);
var timer=Stopwatch.StartNew();
var first = encoder.Encode(screen,85,false,1000)!;
Check(first[0]==1 && Read(first,5)==3840 && Read(first,9)==2160,"Initial frame must be full size");
Check(encoder.Encode(screen,85,false,1034)==null,"Unchanged screen must not encode another JPEG");
Paint(screen,new Rectangle(320,240,64,32),Color.Red);
var patch1=encoder.Encode(screen,85,false,1068)!;
Check(patch1[0]==0 && Read(patch1,1)==Read(first,1),"Patch must reference its keyframe");
Paint(screen,new Rectangle(480,240,64,32),Color.Blue);
var patch2=encoder.Encode(screen,85,false,1102)!;
Check(Read(patch2,13)==320 && Read(patch2,17)==240,"Patches must include all changes since the keyframe");
using var combined=Decode(first);
using(var patch=Decode(patch2)) { using var g=Graphics.FromImage(combined); g.DrawImageUnscaled(patch,(int)Read(patch2,13),(int)Read(patch2,17)); }
Check(combined.GetPixel(340,250).R>220 && combined.GetPixel(500,250).B>220,"Skipping an intermediate patch must preserve both changes");
Check(patch2.Length<first.Length/20,"Small edits should be far smaller than a full 4K JPEG");
Paint(screen,new Rectangle(320,240,64,32),Color.Green);
var recovered=encoder.Encode(screen,85,true,1136)!;
Check(recovered[0]==1 && Read(recovered,1)!=Read(first,1),"Recovery must create a fresh base");
Check(encoder.Encode(screen,85,false,1200)==null,"Static refresh must settle back to idle");
var quality=encoder.Encode(screen,50,false,1300)!;
Check(quality[0]==1,"A quality change must refresh the whole screen");
Paint(screen,new Rectangle(64,64,32,32),Color.Yellow);
var periodic=encoder.Encode(screen,50,false,6501)!;
Check(periodic[0]==1,"Long-running activity must periodically refresh its base");
// Odd widths exercise row padding rather than assuming packed GDI bitmap rows.
using var odd=new Bitmap(101,73,PixelFormat.Format24bppRgb);
using var oddEncoder=new DesktopFrameEncoder(101,73);
oddEncoder.Encode(odd,70,false,1);Paint(odd,new Rectangle(100,72,1,1),Color.White);
var edge=oddEncoder.Encode(odd,70,false,2)!;
using(var patch=Decode(edge)) Check(Read(edge,13)+patch.Width==101 && Read(edge,17)+patch.Height==73,"Edge regions must stay within odd-sized screens");
timer.Stop();
var bgra=Enumerable.Repeat((byte)199,24).ToArray();
bgra[0]=10;bgra[1]=20;bgra[2]=30;bgra[4]=40;bgra[5]=50;bgra[6]=60;
bgra[12]=70;bgra[13]=80;bgra[14]=90;bgra[16]=100;bgra[17]=110;bgra[18]=120;
var bgr=Enumerable.Repeat((byte)177,16).ToArray();
var pinnedSource=GCHandle.Alloc(bgra,GCHandleType.Pinned);var pinnedDestination=GCHandle.Alloc(bgr,GCHandleType.Pinned);
try
{
    BgraCopy.Copy(pinnedSource.AddrOfPinnedObject(),12,pinnedDestination.AddrOfPinnedObject(),8,2,2);
    Check(bgr.Take(6).SequenceEqual(new byte[]{10,20,30,40,50,60})&&bgr.Skip(8).Take(6).SequenceEqual(new byte[]{70,80,90,100,110,120}),"GPU pixel conversion must preserve channels and row pitches");
    Check(bgr[6]==177&&bgr[7]==177&&bgr[14]==177&&bgr[15]==177,"GPU pixel conversion must not overwrite padding");
    BgraCopy.Copy(pinnedSource.AddrOfPinnedObject(),12,pinnedDestination.AddrOfPinnedObject()+8,-8,2,2);
    Check(bgr.Take(6).SequenceEqual(new byte[]{70,80,90,100,110,120}),"Bottom-up capture surfaces must preserve row order");
}
finally{pinnedSource.Free();pinnedDestination.Free();}
using var dynamicOutput=new ScreenOutput();
dynamicOutput.Resize(96,64);
var beforeResize=dynamicOutput.Encoder.Encode(dynamicOutput.Image,85,false,1)!;
dynamicOutput.Resize(48,32);
var afterResize=dynamicOutput.Encoder.Encode(dynamicOutput.Image,70,false,2)!;
Check(afterResize[0]==1&&Read(afterResize,5)==48&&Read(afterResize,9)==32,"A resolution change needs a correctly sized full frame");
Check(Read(afterResize,1)>Read(beforeResize,1),"Resolution changes must not reuse an old keyframe generation");
dynamicOutput.Resize(96,64);
var restored=dynamicOutput.Encoder.Encode(dynamicOutput.Image,85,false,3)!;
Check(Read(restored,1)>Read(afterResize,1),"Restoring sharp quality must also create a unique generation");
Console.WriteLine("PASS: 4K encoding, unchanged frames, cumulative patches, skipped updates, refresh, quality changes, periodic refresh, odd dimensions.");
Console.WriteLine("SYNTHETIC_4K full_bytes="+first.Length+" patch_bytes="+patch2.Length+" reduction_percent="+Math.Round(100.0*(1-(double)patch2.Length/first.Length),2)+" check_ms="+timer.ElapsedMilliseconds);
if(args.Length==1)
{
    Directory.CreateDirectory(args[0]);
    File.WriteAllBytes(Path.Combine(args[0],"first.bin"),first);
    File.WriteAllBytes(Path.Combine(args[0],"patch.bin"),patch2);
}
