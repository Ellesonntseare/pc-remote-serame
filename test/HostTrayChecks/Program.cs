using PCRemoteHost;
internal static class Program
{
    [STAThread]static void Main(){
        ApplicationConfiguration.Initialize();var root=Path.Combine(Path.GetTempPath(),"pcr-sharing-window-"+Guid.NewGuid().ToString("N"));Directory.CreateDirectory(root);
        try{
            var first=Path.Combine(root,"Presentation.pdf");var second=Path.Combine(root,"Meeting notes.txt");File.WriteAllBytes(first,new byte[4096]);File.WriteAllText(second,"A fixture file");
            using var form=new Preview(root,new[]{first,first,second});form.StartPosition=FormStartPosition.Manual;form.Location=new Point(-20000,-20000);form.ShowInTaskbar=false;form.Show();Application.DoEvents();
            var controls=Descendants(form).ToArray();var files=controls.OfType<ListView>().Single();if(files.Items.Count!=2)throw new Exception("Duplicate files must appear only once.");
            foreach(var width in new[]{640,540,900}){form.ClientSize=new Size(width,620);form.PerformLayout();using var bitmap=new Bitmap(form.Width,form.Height);form.DrawToBitmap(bitmap,form.ClientRectangle);if(width==640){Directory.CreateDirectory(Path.Combine(Directory.GetCurrentDirectory(),"test/.test-runtime"));bitmap.Save("test/.test-runtime/send-window-preview.png");}if(files.ClientSize.Width<200||files.ClientSize.Height<80)throw new Exception("File list lost its usable space.");}
            if(form.Icon==null)throw new Exception("The branded window icon is missing.");
            Console.WriteLine("Sharing window: deduplicated files, embedded icon, three responsive sizes rendered. No host session or clipboard accessed.");
        }finally{if(Path.GetFullPath(root).StartsWith(Path.GetFullPath(Path.GetTempPath()),StringComparison.OrdinalIgnoreCase)&&Path.GetFileName(root).StartsWith("pcr-sharing-window-"))Directory.Delete(root,true);}
    }
    static IEnumerable<Control> Descendants(Control root){foreach(Control child in root.Controls){yield return child;foreach(var nested in Descendants(child))yield return nested;}}
    sealed class Preview(string root,IEnumerable<string> files):SendToPhone(root,files){protected override bool ShowWithoutActivation=>true;protected override void OnShown(EventArgs e){/* Render only: never connect to a real host. */}}
}
