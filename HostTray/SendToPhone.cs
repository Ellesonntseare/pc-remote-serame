using System.Net;
using System.Net.Http.Json;
using System.Text.Json.Nodes;

namespace PCRemoteHost;
internal sealed class SendToPhone:Form
{
    readonly string root;
    readonly HttpClient http=new(new HttpClientHandler{AllowAutoRedirect=false,UseProxy=false,CookieContainer=new CookieContainer()}){BaseAddress=new Uri("http://127.0.0.1:7666"),Timeout=TimeSpan.FromSeconds(30)};
    readonly List<string> files=[];
    readonly Label summary=new(){AutoSize=true,MaximumSize=new Size(490,0)},status=new(){AutoSize=true,MaximumSize=new Size(490,0)};
    readonly ComboBox targets=new(){DropDownStyle=ComboBoxStyle.DropDownList,Width=490,AccessibleName="Receiving device"};
    readonly TextBox text=new(){Multiline=true,Width=490,Height=85,AccessibleName="Link or text to send",PlaceholderText="Paste a link or text"};
    readonly Button send=new(){Text="Send",AutoSize=true,Enabled=false};bool signedIn;
    sealed record Target(string Id,string Name){public override string ToString()=>Name;}
    public SendToPhone(string hostRoot,IEnumerable<string> selected)
    {
        root=hostRoot;Text="Send to my phone · PC Remote";Width=570;Height=440;MinimumSize=new Size(450,360);StartPosition=FormStartPosition.CenterScreen;AllowDrop=true;
        var panel=new FlowLayoutPanel{Dock=DockStyle.Fill,FlowDirection=FlowDirection.TopDown,WrapContents=false,AutoScroll=true,Padding=new Padding(24)};Controls.Add(panel);
        panel.Controls.Add(new Label{Text="Send to your devices",AutoSize=true,Font=new Font(SystemFonts.DefaultFont.FontFamily,18,FontStyle.Bold)});panel.Controls.Add(targets);panel.Controls.Add(summary);
        var choose=new Button{Text="Choose files…",AutoSize=true};choose.Click+=(_,_)=>{using var picker=new OpenFileDialog{Multiselect=true,Title="Send files to your phone"};if(picker.ShowDialog()==DialogResult.OK)Add(picker.FileNames);};panel.Controls.Add(choose);panel.Controls.Add(text);panel.Controls.Add(send);panel.Controls.Add(status);
        DragEnter+=(_,e)=>e.Effect=e.Data?.GetDataPresent(DataFormats.FileDrop)==true?DragDropEffects.Copy:DragDropEffects.None;DragDrop+=(_,e)=>{if(e.Data?.GetData(DataFormats.FileDrop) is string[] dropped)Add(dropped);};
        send.Click+=async(_,_)=>await Deliver();Shown+=async(_,_)=>await Connect();FormClosed+=(_,_)=>{if(signedIn)try{http.PostAsJsonAsync("/api/unpair",new{}).Wait(1000);}catch{}http.Dispose();};Add(selected);
    }
    void Add(IEnumerable<string> selected){foreach(var file in selected)if(File.Exists(file)&&files.Count<100&&!files.Contains(file))files.Add(Path.GetFullPath(file));summary.Text=files.Count==0?"Drop files here, choose files, or paste a link.":files.Count+" file(s) ready · "+string.Join(", ",files.Take(3).Select(Path.GetFileName));}
    async Task<JsonObject> Call(string route,object? body=null)
    {
        using var result=body==null?await http.GetAsync(route):await http.PostAsJsonAsync(route,body);var data=JsonNode.Parse(await result.Content.ReadAsStringAsync()) as JsonObject??throw new InvalidOperationException("The host did not respond.");if(!result.IsSuccessStatusCode)throw new InvalidOperationException(data["error"]?.GetValue<string>()??"The host could not complete this request.");return data;
    }
    async Task Connect()
    {
        status.Text="Connecting to your PC host…";try{
            http.DefaultRequestHeaders.Add("X-PCR","1");http.DefaultRequestHeaders.UserAgent.ParseAdd("PCRemote-Windows-SendTo/2.1");var config=JsonNode.Parse(await File.ReadAllTextAsync(Path.Combine(root,"config.json")));await Call("/api/pair",new{password=config?["password"]?.GetValue<string>()??"",remember=false});signedIn=true;
            var data=await Call("/api/host/targets");targets.Items.Add(new Target("*","All my devices"));if(data["devices"] is JsonArray devices)foreach(var device in devices){if(device==null)continue;targets.Items.Add(new Target(device["id"]!.GetValue<string>(),device["name"]!.GetValue<string>()+(device["online"]?.GetValue<bool>()==true?" · connected":" · queued delivery")));}targets.SelectedIndex=targets.Items.Count==2?1:0;send.Enabled=true;status.Text="Files wait here until your receiving device connects.";
        }catch{status.Text="Start the Windows PC Remote host first, then reopen Send to my phone.";}
    }
    async Task Deliver()
    {
        if(files.Count==0&&string.IsNullOrWhiteSpace(text.Text)){status.Text="Choose files or enter some text.";return;}send.Enabled=false;status.Text="Preparing delivery…";
        try{var target=targets.SelectedItem as Target;await Call("/api/host/send",new{files=files.ToArray(),text=text.Text,target=target?.Id??"*"});files.Clear();text.Clear();Add([]);status.Text="Sent. Open PC Remote on the receiving device to collect it.";}catch(Exception ex){status.Text=ex.Message;}finally{send.Enabled=true;}
    }
}
