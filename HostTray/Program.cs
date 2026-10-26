using System.Diagnostics;
using System.Net;
using System.Net.NetworkInformation;
using System.Security.Cryptography;
using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.Win32;

namespace PCRemoteHost;
internal static class Program
{
    [STAThread] static void Main(string[] args)
    {
        using var mutex=new Mutex(true,"Local\\PCRemotePersonalHost",out bool first);
        if(!first){MessageBox.Show("PC Remote is already in the notification area.","PC Remote");return;}
        ApplicationConfiguration.Initialize();Application.Run(new HostContext(args.Contains("--quiet")));
    }
}
internal sealed class HostContext:ApplicationContext
{
    const string ReleasePage="https://github.com/Ellesonntseare/pc-remote-serame/releases";
    static string HostRoot(){var packaged=Path.Combine(AppContext.BaseDirectory,"host");if(File.Exists(Path.Combine(packaged,"server.js")))return packaged;var dir=new DirectoryInfo(AppContext.BaseDirectory);for(int i=0;i<6&&dir!=null;i++,dir=dir.Parent)if(File.Exists(Path.Combine(dir.FullName,"server.js")))return dir.FullName;throw new DirectoryNotFoundException("Reinstall PC Remote: the Windows host files are missing.");}
    readonly string root=HostRoot();
    readonly NotifyIcon tray=new(){Icon=SystemIcons.Application,Visible=true,Text="PC Remote · checking host"};
    readonly HttpClient http=new(new HttpClientHandler{AllowAutoRedirect=false}){Timeout=TimeSpan.FromSeconds(2)};
    readonly System.Windows.Forms.Timer timer=new(){Interval=3000};
    readonly ToolStripMenuItem state=new("Checking host…"),start=new("Start host"),stop=new("Stop host"),startup=new("Start when I sign in");
    Process? child;bool busy,online,closing;
    public HostContext(bool quiet)
    {
        Directory.CreateDirectory(root);EnsureConfig();
        var menu=new ContextMenuStrip();state.Enabled=false;menu.Items.Add(state);menu.Items.Add(new ToolStripSeparator());menu.Items.Add("Open PC Remote",null,(_,_)=>Open("http://localhost:7666/"));menu.Items.Add("Pair a phone…",null,(_,_)=>Pair());menu.Items.Add("Import existing settings…",null,async(_,_)=>await ImportSettings());menu.Items.Add(start);menu.Items.Add(stop);menu.Items.Add(new ToolStripSeparator());menu.Items.Add(startup);menu.Items.Add("Check for updates…",null,async(_,_)=>await Updates());menu.Items.Add("Show host log",null,(_,_)=>Open(Path.Combine(root,"host.log")));menu.Items.Add(new ToolStripSeparator());menu.Items.Add("Exit PC Remote",null,(_,_)=>Quit());tray.ContextMenuStrip=menu;tray.DoubleClick+=(_,_)=>Open("http://localhost:7666/");
        start.Click+=async(_,_)=>await Start();stop.Click+=(_,_)=>Stop();startup.CheckOnClick=true;startup.Checked=ReadStartup();startup.Click+=(_,_)=>SetStartup(startup.Checked);
        timer.Tick+=async(_,_)=>await Poll();timer.Start();_ = Start();if(!quiet)tray.ShowBalloonTip(4000,"PC Remote","Your host controls are in the notification area. Right-click for pairing, status and updates.",ToolTipIcon.Info);
    }
    void EnsureConfig()
    {
        var file=Path.Combine(root,"config.json");if(File.Exists(file))return;
        string password=Convert.ToBase64String(RandomNumberGenerator.GetBytes(18)).TrimEnd('=').Replace('+','-').Replace('/','_');
        File.WriteAllText(file,JsonSerializer.Serialize(new{password,allowLan=true,screen=true,tunnelHostname="remote.teamtrader.co.za",deviceName=Environment.MachineName}));
    }
    async Task<bool> Probe()
    {
        try{using var result=await http.GetAsync("http://127.0.0.1:7666/api/ping");if(!result.IsSuccessStatusCode)return false;using var body=JsonDocument.Parse(await result.Content.ReadAsStringAsync());return body.RootElement.TryGetProperty("ok",out var ok)&&ok.GetBoolean()&&body.RootElement.TryGetProperty("requirePassword",out _);}catch{return false;}
    }
    async Task Poll(){if(busy||closing)return;busy=true;try{online=await Probe();state.Text=online?(child is {HasExited:false}?"Host online · managed here":"Host online · started elsewhere"):"Host offline";start.Enabled=!online;stop.Enabled=child is {HasExited:false};tray.Text=online?"PC Remote · host online":"PC Remote · host offline";}finally{busy=false;}}
    async Task Start()
    {
        if(closing||child is {HasExited:false})return;if(await Probe()){await Poll();return;}
        try{
            var node=Path.Combine(root,"runtime","node.exe");if(!File.Exists(node))node="node.exe";
            var info=new ProcessStartInfo(node){WorkingDirectory=root,UseShellExecute=false,CreateNoWindow=true,RedirectStandardOutput=true,RedirectStandardError=true};info.ArgumentList.Add(Path.Combine(root,"server.js"));
            child=new Process{StartInfo=info,EnableRaisingEvents=true};child.OutputDataReceived+=(_,e)=>Log(e.Data);child.ErrorDataReceived+=(_,e)=>Log(e.Data);child.Start();child.BeginOutputReadLine();child.BeginErrorReadLine();await Task.Delay(800);await Poll();
        }catch{MessageBox.Show("The host could not start. Open the host log or reinstall PC Remote.","PC Remote",MessageBoxButtons.OK,MessageBoxIcon.Error);}
    }
    readonly object logLock=new();
    void Log(string? line){if(line==null)return;lock(logLock)try{var file=Path.Combine(root,"host.log");if(File.Exists(file)&&new FileInfo(file).Length>2*1024*1024)File.Move(file,file+".previous",true);File.AppendAllText(file,DateTimeOffset.Now.ToString("u")+" "+line+Environment.NewLine);}catch{}}
    void Stop(){var owned=child;child=null;if(owned!=null)try{if(!owned.HasExited){owned.Kill(true);owned.WaitForExit(3000);}owned.Dispose();}catch{} _=Poll();}
    void Pair()
    {
        if(online&&child is not {HasExited:false}){Open("http://localhost:7666/");return;}
        using var form=new Form{Text="Pair your phone · PC Remote",Width=550,Height=410,StartPosition=FormStartPosition.CenterScreen,MinimumSize=new Size(430,340)};
        var panel=new FlowLayoutPanel{Dock=DockStyle.Fill,FlowDirection=FlowDirection.TopDown,WrapContents=false,Padding=new Padding(24),AutoScroll=true};form.Controls.Add(panel);
        panel.Controls.Add(new Label{Text="Connect your phone",AutoSize=true,Font=new Font(SystemFonts.DefaultFont.FontFamily,18,FontStyle.Bold)});
        panel.Controls.Add(new Label{Text="Use the same Wi-Fi, open PC Remote, and choose Local Wi-Fi.",AutoSize=true,MaximumSize=new Size(440,0)});
        var addresses=NetworkInterface.GetAllNetworkInterfaces().Where(n=>n.OperationalStatus==OperationalStatus.Up).SelectMany(n=>n.GetIPProperties().UnicastAddresses).Where(a=>a.Address.AddressFamily==System.Net.Sockets.AddressFamily.InterNetwork&&!IPAddress.IsLoopback(a.Address)).Select(a=>"http://"+a.Address+":7666").ToArray();
        var ip=new TextBox{Text=string.Join(Environment.NewLine,addresses),Multiline=true,ReadOnly=true,Width=440,Height=65,AccessibleName="PC local addresses"};panel.Controls.Add(ip);
        var copy=new Button{Text="Copy local address",AutoSize=true};copy.Click+=(_,_)=>{if(addresses.Length>0)Clipboard.SetText(addresses[0]);};panel.Controls.Add(copy);
        panel.Controls.Add(new Label{Text="Then sign in using your Google account or this PC’s password.",AutoSize=true,MaximumSize=new Size(440,0)});
        var password=new TextBox{Width=440,UseSystemPasswordChar=true,ReadOnly=true,AccessibleName="PC pairing password"};try{var cfg=JsonNode.Parse(File.ReadAllText(Path.Combine(root,"config.json")));password.Text=cfg?["password"]?.GetValue<string>()??"";}catch{}panel.Controls.Add(password);
        var reveal=new CheckBox{Text="Show PC password",AutoSize=true};reveal.CheckedChanged+=(_,_)=>password.UseSystemPasswordChar=!reveal.Checked;panel.Controls.Add(reveal);
        var open=new Button{Text="Open Devices & pairing",AutoSize=true};open.Click+=(_,_)=>Open("http://localhost:7666/");panel.Controls.Add(open);form.ShowDialog();
    }
    async Task ImportSettings()
    {
        using var picker=new OpenFileDialog{Title="Import your existing PC Remote config.json",Filter="PC Remote settings|config.json|JSON settings|*.json",CheckFileExists=true};if(picker.ShowDialog()!=DialogResult.OK)return;
        try{
            if(new FileInfo(picker.FileName).Length>128*1024)throw new InvalidDataException();
            byte[] data=File.ReadAllBytes(picker.FileName);var config=JsonNode.Parse(data);if(config is not JsonObject||string.IsNullOrWhiteSpace(config["password"]?.GetValue<string>()))throw new InvalidDataException();
            bool owned=child is {HasExited:false};if(owned)Stop();var destination=Path.Combine(root,"config.json");File.Copy(destination,destination+".previous",true);File.WriteAllBytes(destination+".import",data);File.Move(destination+".import",destination,true);
            if(owned)await Start();MessageBox.Show(owned?"Settings imported and your host restarted.":"Settings imported. They will be used when this installed host starts. A host already running from another folder keeps its existing settings.","PC Remote settings");
        }catch{MessageBox.Show("Choose a valid PC Remote config.json containing your PC password. No settings were imported.","PC Remote settings",MessageBoxButtons.OK,MessageBoxIcon.Error);}
    }
    async Task Updates()
    {
        // Personal releases are private. Use the user's signed-in browser rather
        // than embedding GitHub credentials or reporting an unauthenticated 404 as current.
        await Task.CompletedTask;Open(ReleasePage);
    }
    bool ReadStartup(){using var key=Registry.CurrentUser.OpenSubKey(@"Software\Microsoft\Windows\CurrentVersion\Run");return key?.GetValue("PCRemotePersonalHost") is string;}
    void SetStartup(bool enable){using var key=Registry.CurrentUser.CreateSubKey(@"Software\Microsoft\Windows\CurrentVersion\Run");if(enable)key.SetValue("PCRemotePersonalHost","\""+Application.ExecutablePath+"\" --quiet");else key.DeleteValue("PCRemotePersonalHost",false);}
    static void Open(string value){try{Process.Start(new ProcessStartInfo(value){UseShellExecute=true});}catch{MessageBox.Show("Windows could not open that item.","PC Remote");}}
    void Quit(){closing=true;timer.Stop();if(child is {HasExited:false}&&MessageBox.Show("Stop your PC Remote host and close the tray? Active remote sessions will end.","Exit PC Remote",MessageBoxButtons.YesNo,MessageBoxIcon.Question)!=DialogResult.Yes){closing=false;timer.Start();return;}Stop();tray.Visible=false;tray.Dispose();http.Dispose();ExitThread();}
}
