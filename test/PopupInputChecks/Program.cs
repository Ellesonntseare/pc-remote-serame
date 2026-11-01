using System.Diagnostics;
using System.Drawing;
using System.Runtime.InteropServices;
using System.Windows.Forms;

// Opt-in live Windows integration check. Only the test's own windows are clicked.
internal static class Checks
{
    [DllImport("user32.dll")] static extern bool GetCursorPos(out Point point);
    [STAThread] static void Main(string[] args)
    {
        if(args.Length!=1)throw new ArgumentException("Pass the RemoteAgent.exe path. This check opens disposable test windows.");
        Application.SetHighDpiMode(HighDpiMode.SystemAware);
        using var process=new Process{StartInfo=new ProcessStartInfo(args[0],"5 30 0.25"){UseShellExecute=false,CreateNoWindow=true,RedirectStandardInput=true,RedirectStandardOutput=true,RedirectStandardError=true}};
        process.Start();_ = process.StandardOutput.BaseStream.CopyToAsync(Stream.Null);process.ErrorDataReceived+=(_,e)=>{if(e.Data!=null)Console.WriteLine(e.Data);};process.BeginErrorReadLine();
        using var main=new Form{Text="Elleson input test",StartPosition=FormStartPosition.Manual,Bounds=new Rectangle(120,120,600,420)};
        var button=new Button{Text="Test target",Bounds=new Rectangle(150,120,160,60)};main.Controls.Add(button);
        Exception failure=null;
        async Task Check(Form window,Button target,string label)
        {
            int clicks=0;EventHandler handler=(_,_)=>clicks++;target.Click+=handler;
            try{
                await Task.Delay(250);
                var center=target.PointToScreen(new Point(target.Width/2,target.Height/2));var screen=Screen.PrimaryScreen.Bounds;
                process.StandardInput.WriteLine($"abs {center.X-screen.Left} {center.Y-screen.Top}");process.StandardInput.Flush();await Task.Delay(150);
                GetCursorPos(out var before);
                for(int i=0;i<8;i++)process.StandardInput.WriteLine("mv 2 0");process.StandardInput.Flush();await Task.Delay(250);
                GetCursorPos(out var moved);Console.WriteLine($"{label}: before={before}, moved={moved}");if(moved.X-before.X<6)throw new Exception(label+": relative movement lost or snapped back");
                await Task.Delay(200);GetCursorPos(out var settled);if(Math.Abs(settled.X-moved.X)>2)throw new Exception(label+": cursor did not stay at its new position");
                process.StandardInput.WriteLine($"abs {center.X-screen.Left} {center.Y-screen.Top}");process.StandardInput.WriteLine("click l");process.StandardInput.Flush();await Task.Delay(250);
                if(clicks!=1)throw new Exception(label+": popup button did not receive the click");Console.WriteLine(label+": queued movement, stable position and click PASS");
            }finally{target.Click-=handler;}
        }
        main.Shown+=async(_,_)=>{
            try{
                await Check(main,button,"Main window");
                using var popup=new Form{Text="Modal popup test",StartPosition=FormStartPosition.Manual,Bounds=new Rectangle(180,180,450,280)};
                var popupButton=new Button{Text="Popup target",Bounds=new Rectangle(90,70,160,60)};popup.Controls.Add(popupButton);
                popup.Shown+=async(_,_)=>{try{await Check(popup,popupButton,"Popup over main window");using var nested=new Form{Text="Nested popup test",StartPosition=FormStartPosition.Manual,Bounds=new Rectangle(220,220,380,230)};var nestedButton=new Button{Text="Nested target",Bounds=new Rectangle(70,60,160,60)};nested.Controls.Add(nestedButton);nested.Shown+=async(_,_)=>{try{await Check(nested,nestedButton,"Popup over another popup");}catch(Exception ex){failure=ex;}finally{nested.Close();}};nested.ShowDialog(popup);}catch(Exception ex){failure=ex;}finally{popup.Close();}};
                popup.ShowDialog(main);
            }catch(Exception ex){failure=ex;}finally{main.Close();}
        };
        try{Application.Run(main);}finally{process.StandardInput.Close();if(!process.WaitForExit(2000))process.Kill();}
        if(failure!=null)throw failure;
    }
}

