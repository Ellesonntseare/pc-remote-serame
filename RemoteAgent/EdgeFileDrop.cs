using System.Drawing;
using System.Windows.Forms;

// An OLE drop target, shown only during an approved phone handoff session.
// Moving a Windows window still uses Windows' own mouse capture unchanged.
internal sealed class EdgeFileDrop : Form
{
    readonly Action<string[]> dropped;
    readonly Action<string> failed;
    string side;bool expanded;
    protected override bool ShowWithoutActivation=>true;
    protected override CreateParams CreateParams {get{var value=base.CreateParams;value.ExStyle|=0x08000000|0x80;return value;}}
    internal EdgeFileDrop(string side,Action<string[]> dropped,Action<string> failed){
        this.side=side;this.dropped=dropped;this.failed=failed;FormBorderStyle=FormBorderStyle.None;ShowInTaskbar=false;TopMost=true;AllowDrop=true;BackColor=Color.FromArgb(16,16,15);ForeColor=Color.FromArgb(252,86,62);Opacity=.94;Text="Elleson Connect · Send to phone";
        SetStyle(ControlStyles.OptimizedDoubleBuffer|ControlStyles.UserPaint|ControlStyles.AllPaintingInWmPaint,true);
        DragEnter+=(_,eventArgs)=>{if(eventArgs.Data?.GetDataPresent(DataFormats.FileDrop)==true){eventArgs.Effect=DragDropEffects.Copy;expanded=true;Place();}else eventArgs.Effect=DragDropEffects.None;};
        DragOver+=(_,eventArgs)=>eventArgs.Effect=eventArgs.Data?.GetDataPresent(DataFormats.FileDrop)==true?DragDropEffects.Copy:DragDropEffects.None;
        DragLeave+=(_,_)=>{expanded=false;Place();};
        DragDrop+=(_,eventArgs)=>{try{if(eventArgs.Data?.GetData(DataFormats.FileDrop) is string[] paths){if(paths.Length is <1 or >100||paths.Any(file=>string.IsNullOrEmpty(file)||file.Length>2048||file.Contains('\0')))failed("Drop up to 100 files with ordinary Windows paths.");else dropped(paths);}}finally{expanded=false;Place();}};
        Place();
    }
    internal void Configure(string value){side=value;Place();}
    void Place(){var screen=Screen.PrimaryScreen?.Bounds??Screen.AllScreens[0].Bounds;bool vertical=side is "left" or "right";Size=vertical?new Size(expanded?208:9,160):new Size(208,expanded?80:9);Location=side switch{"left"=>new Point(screen.Left,screen.Top+(screen.Height-Height)/2),"right"=>new Point(screen.Right-Width,screen.Top+(screen.Height-Height)/2),"top"=>new Point(screen.Left+(screen.Width-Width)/2,screen.Top),_=>new Point(screen.Left+(screen.Width-Width)/2,screen.Bottom-Height)};Invalidate();}
    protected override void OnPaint(PaintEventArgs e){base.OnPaint(e);using var line=new SolidBrush(ForeColor);if(expanded){using var font=new Font("Segoe UI",12,FontStyle.Bold);TextRenderer.DrawText(e.Graphics,"Send to phone\nRelease files here",font,ClientRectangle,ForeColor,TextFormatFlags.HorizontalCenter|TextFormatFlags.VerticalCenter);}else e.Graphics.FillRectangle(line,ClientRectangle);}
}
