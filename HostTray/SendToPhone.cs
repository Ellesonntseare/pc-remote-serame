using System.Net;
using System.Net.Http.Json;
using System.Text.Json.Nodes;
namespace PCRemoteHost;
internal class SendToPhone:Form
{
    readonly string root;
    readonly HttpClient http=new(new HttpClientHandler{AllowAutoRedirect=false,UseProxy=false,CookieContainer=new CookieContainer()}){BaseAddress=new Uri("http://127.0.0.1:7666"),Timeout=TimeSpan.FromMinutes(2)};
    readonly List<string> files=[];
    readonly ComboBox targets=new(){DropDownStyle=ComboBoxStyle.DropDownList,Dock=DockStyle.Fill,AccessibleName="Receiving device",FlatStyle=FlatStyle.Flat};
    readonly TextBox text=new(){Multiline=true,Dock=DockStyle.Fill,AccessibleName="Link or text to send",PlaceholderText="Paste a link or write a message",ScrollBars=ScrollBars.Vertical,BorderStyle=BorderStyle.FixedSingle};
    readonly ListView fileList=new(){View=View.Details,FullRowSelect=true,MultiSelect=true,HideSelection=false,HeaderStyle=ColumnHeaderStyle.Nonclickable,Dock=DockStyle.Fill,BorderStyle=BorderStyle.None,ShowItemToolTips=true,AccessibleName="Files ready to send"};
    readonly Label status=new(){Dock=DockStyle.Fill,AutoEllipsis=true,TextAlign=ContentAlignment.MiddleLeft,AccessibleName="Delivery status"},summary=new(){AutoSize=true,Text="Files"};
    readonly Button send=new(){Text="Send to devices",Enabled=false,Dock=DockStyle.Right,Width=160},choose=new(){Text="Add files…",AutoSize=true},remove=new(){Text="Remove",AutoSize=true,Enabled=false};
    readonly ProgressBar progress=new(){Dock=DockStyle.Top,Height=3,Style=ProgressBarStyle.Marquee,Visible=false};
    bool signedIn,delivering,closing,closed;
    sealed record Target(string Id,string Name){public override string ToString()=>Name;}
    public SendToPhone(string hostRoot,IEnumerable<string> selected)
    {
        root=hostRoot;Text="Send to your devices · Elleson Connect";ClientSize=new Size(640,620);MinimumSize=new Size(540,540);StartPosition=FormStartPosition.CenterScreen;AutoScaleMode=AutoScaleMode.Dpi;AllowDrop=true;HostTheme.Window(this);
        var panel=new TableLayoutPanel{Dock=DockStyle.Fill,ColumnCount=1,RowCount=8,Padding=new Padding(24)};
        foreach(var height in new[]{62,55,44,0,30,88,68,24})panel.RowStyles.Add(height==0?new RowStyle(SizeType.Percent,100):new RowStyle(SizeType.Absolute,height));Controls.Add(panel);
        var heading=new Label{Text="Send to your devices",Dock=DockStyle.Fill,Font=new Font(Font.FontFamily,20,FontStyle.Bold),TextAlign=ContentAlignment.MiddleLeft};panel.Controls.Add(heading,0,0);
        var destination=new TableLayoutPanel{Dock=DockStyle.Fill,ColumnCount=2,Padding=new Padding(0,8,0,8)};destination.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute,58));destination.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,100));destination.Controls.Add(new Label{Text="To",Dock=DockStyle.Fill,TextAlign=ContentAlignment.MiddleLeft},0,0);destination.Controls.Add(targets,1,0);panel.Controls.Add(destination,0,1);
        var actions=new FlowLayoutPanel{Dock=DockStyle.Fill,WrapContents=false};summary.Margin=new Padding(0,10,12,0);actions.Controls.Add(summary);actions.Controls.Add(choose);actions.Controls.Add(remove);panel.Controls.Add(actions,0,2);
        var fileCard=new Panel{Dock=DockStyle.Fill,BackColor=HostTheme.Surface,Padding=new Padding(10)};fileCard.Controls.Add(fileList);panel.Controls.Add(fileCard,0,3);fileList.Columns.Add("File",380);fileList.Columns.Add("Size",120,HorizontalAlignment.Right);fileList.Resize+=(_,_)=>{fileList.Columns[0].Width=Math.Max(150,fileList.ClientSize.Width-125);fileList.Columns[1].Width=110;};
        panel.Controls.Add(new Label{Text="Text or link",Dock=DockStyle.Fill,TextAlign=ContentAlignment.BottomLeft,ForeColor=HostTheme.Muted},0,4);panel.Controls.Add(text,0,5);
        var footer=new TableLayoutPanel{Dock=DockStyle.Fill,Padding=new Padding(0,16,0,0),ColumnCount=2};footer.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,100));footer.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute,170));footer.Controls.Add(status,0,0);footer.Controls.Add(send,1,0);panel.Controls.Add(footer,0,6);panel.Controls.Add(progress,0,7);
        targets.BackColor=text.BackColor=fileList.BackColor=HostTheme.Surface;targets.ForeColor=text.ForeColor=fileList.ForeColor=HostTheme.Text;status.ForeColor=HostTheme.Muted;
        targets.DrawMode=DrawMode.OwnerDrawFixed;targets.DrawItem+=(_,e)=>{using var brush=new SolidBrush(HostTheme.Surface);e.Graphics.FillRectangle(brush,e.Bounds);var label=e.Index>=0?targets.Items[e.Index]?.ToString()??"":"Choose a receiving device";TextRenderer.DrawText(e.Graphics,label,Font,e.Bounds,HostTheme.Text,TextFormatFlags.VerticalCenter|TextFormatFlags.Left);};
        fileList.OwnerDraw=true;fileList.DrawColumnHeader+=(_,e)=>{using var brush=new SolidBrush(HostTheme.Surface);e.Graphics.FillRectangle(brush,e.Bounds);TextRenderer.DrawText(e.Graphics,e.Header?.Text??"",Font,e.Bounds,HostTheme.Muted,TextFormatFlags.VerticalCenter|TextFormatFlags.Left);};fileList.DrawItem+=(_,e)=>e.DrawDefault=true;fileList.DrawSubItem+=(_,e)=>e.DrawDefault=true;
        HostTheme.Button(choose);HostTheme.Button(remove);HostTheme.Button(send,true);
        choose.Click+=(_,_)=>{using var picker=new OpenFileDialog{Multiselect=true,Title="Send files to your devices"};if(picker.ShowDialog(this)==DialogResult.OK)Add(picker.FileNames);};
        remove.Click+=(_,_)=>RemoveSelected();fileList.SelectedIndexChanged+=(_,_)=>remove.Enabled=!delivering&&fileList.SelectedItems.Count>0;
        fileList.KeyDown+=(_,e)=>{if(e.KeyCode==Keys.Delete&&!delivering){RemoveSelected();e.Handled=true;}};
        foreach(Control control in new Control[]{this,panel,fileCard,fileList}){control.AllowDrop=true;control.DragEnter+=(_,e)=>e.Effect=!delivering&&e.Data?.GetDataPresent(DataFormats.FileDrop)==true?DragDropEffects.Copy:DragDropEffects.None;control.DragDrop+=(_,e)=>{if(!delivering&&e.Data?.GetData(DataFormats.FileDrop) is string[] dropped)Add(dropped);};}
        send.Click+=async(_,_)=>await Deliver();Shown+=async(_,_)=>await Connect();FormClosed+=(_,_)=>http.Dispose();Add(selected);
    }
    void Add(IEnumerable<string> selected)
    {
        foreach(var candidate in selected){try{var file=Path.GetFullPath(candidate);if(File.Exists(file)&&files.Count<100&&!files.Contains(file,StringComparer.OrdinalIgnoreCase))files.Add(file);}catch{}}
        RefreshFiles();
    }
    void RefreshFiles()
    {
        fileList.BeginUpdate();fileList.Items.Clear();foreach(var file in files){string size="Unavailable";try{var bytes=new FileInfo(file).Length;size=bytes>=1048576?(bytes/1048576d).ToString("0.##")+" MB":bytes>=1024?(bytes/1024d).ToString("0.##")+" KB":bytes+" B";}catch{}var item=new ListViewItem(Path.GetFileName(file)){Tag=file,ToolTipText=file};item.SubItems.Add(size);fileList.Items.Add(item);}fileList.EndUpdate();summary.Text=files.Count==0?"Drop files here":files.Count+" file"+(files.Count==1?"":"s");remove.Enabled=false;
    }
    void RemoveSelected(){foreach(var item in fileList.SelectedItems.Cast<ListViewItem>().ToArray())if(item.Tag is string file)files.Remove(file);RefreshFiles();}
    async Task<JsonObject> Call(string route,object? body=null)
    {
        using var result=body==null?await http.GetAsync(route):await http.PostAsJsonAsync(route,body);var data=JsonNode.Parse(await result.Content.ReadAsStringAsync()) as JsonObject??throw new InvalidOperationException("The host did not respond.");if(!result.IsSuccessStatusCode)throw new InvalidOperationException(data["error"]?.GetValue<string>()??"The host could not complete this request.");return data;
    }
    async Task Connect()
    {
        status.Text="Connecting to your PC…";try{
            http.DefaultRequestHeaders.Add("X-PCR","1");http.DefaultRequestHeaders.UserAgent.ParseAdd("PCRemote-Windows-SendTo/2.1");var config=JsonNode.Parse(await File.ReadAllTextAsync(Path.Combine(root,"config.json")));await Call("/api/pair",new{password=config?["password"]?.GetValue<string>()??"",remember=false});signedIn=true;
            var data=await Call("/api/host/targets");if(closing)return;targets.Items.Add(new Target("*","All my devices"));if(data["devices"] is JsonArray devices)foreach(var device in devices){if(device==null)continue;targets.Items.Add(new Target(device["id"]!.GetValue<string>(),device["name"]!.GetValue<string>()+(device["online"]?.GetValue<bool>()==true?" · connected":" · delivery queued")));}targets.SelectedIndex=targets.Items.Count==2?1:0;send.Enabled=true;status.Text="Ready to send";
        }catch{if(!closing)status.Text="Start the Elleson Connect host, then reopen this window.";}
    }
    async Task Deliver()
    {
        if(files.Count==0&&string.IsNullOrWhiteSpace(text.Text)){status.Text="Add a file or write a message.";return;}
        delivering=true;send.Enabled=choose.Enabled=remove.Enabled=targets.Enabled=text.Enabled=false;progress.Visible=true;status.Text="Preparing delivery…";
        try{var target=targets.SelectedItem as Target;await Call("/api/host/send",new{files=files.ToArray(),text=text.Text,target=target?.Id??"*"});if(closing)return;files.Clear();text.Clear();RefreshFiles();status.Text="Sent · ready on your receiving devices";}
        catch(Exception ex){if(!closing)status.Text=ex is TaskCanceledException?"Delivery timed out. Check your devices before retrying.":ex.Message;}
        finally{delivering=false;if(!closing){send.Enabled=choose.Enabled=targets.Enabled=text.Enabled=true;remove.Enabled=fileList.SelectedItems.Count>0;progress.Visible=false;}}
    }
    protected override async void OnFormClosing(FormClosingEventArgs e)
    {
        if(!closed){e.Cancel=true;if(closing)return;closing=true;http.CancelPendingRequests();if(signedIn){using var timeout=new CancellationTokenSource(TimeSpan.FromSeconds(2));try{using var result=await http.PostAsJsonAsync("/api/unpair",new{},timeout.Token);}catch{}}closed=true;Close();return;}base.OnFormClosing(e);
    }
}
