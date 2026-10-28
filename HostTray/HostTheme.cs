using System.Runtime.InteropServices;
namespace PCRemoteHost;
internal static class HostTheme
{
    internal static readonly Color Background=Color.FromArgb(8,18,29),Surface=Color.FromArgb(16,32,47),Border=Color.FromArgb(42,67,86),Text=Color.FromArgb(232,242,250),Muted=Color.FromArgb(151,176,196),Accent=Color.FromArgb(0,216,207);
    internal static Icon AppIcon(){using var source=typeof(HostTheme).Assembly.GetManifestResourceStream("PCRemoteHost.remote.ico");return source==null?(Icon)SystemIcons.Application.Clone():new Icon(source);}
    internal static void Window(Form form){form.BackColor=Background;form.ForeColor=Text;form.Font=new Font("Segoe UI",10);form.Icon=AppIcon();form.HandleCreated+=(_,_)=>{if(OperatingSystem.IsWindowsVersionAtLeast(10)){int dark=1;DwmSetWindowAttribute(form.Handle,20,ref dark,sizeof(int));}};}
    internal static void Button(Button button,bool primary=false){button.FlatStyle=FlatStyle.Flat;button.FlatAppearance.BorderColor=primary?Accent:Border;button.BackColor=primary?Accent:Surface;button.ForeColor=primary?Background:Text;button.Cursor=Cursors.Hand;button.Padding=new Padding(8,4,8,4);button.MinimumSize=new Size(84,36);}
    [DllImport("dwmapi.dll")]private static extern int DwmSetWindowAttribute(IntPtr hwnd,int attribute,ref int value,int size);
}
