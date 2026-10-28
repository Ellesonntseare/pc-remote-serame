using System.Runtime.InteropServices;
using System.Text.Json;

internal static class FileLocations
{
    [DllImport("shell32.dll", CharSet=CharSet.Unicode)] private static extern int SHGetKnownFolderPath(ref Guid id,uint flags,IntPtr token,out IntPtr path);
    internal static void Run()
    {
        var locations=new List<object>();var seen=new HashSet<string>(StringComparer.OrdinalIgnoreCase);object? shell=null;
        void Add(string id,string label,string path,string kind="known",object? capacity=null){if(string.IsNullOrWhiteSpace(path)||!Directory.Exists(path)||!seen.Add(Path.GetFullPath(path).TrimEnd('\\')))return;locations.Add(new{id,label,directory=Path.GetFullPath(path),kind,capacity});}
        try
        {
            Add("@desktop","Desktop",Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory));
            var downloadsId=new Guid("374DE290-123F-4565-9164-39C4925E467B");IntPtr downloads=IntPtr.Zero;
            try{if(SHGetKnownFolderPath(ref downloadsId,0,IntPtr.Zero,out downloads)==0)Add("@downloads","Downloads",Marshal.PtrToStringUni(downloads)??"");}finally{if(downloads!=IntPtr.Zero)Marshal.FreeCoTaskMem(downloads);}
            Add("@documents","Documents",Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments));
            Add("@pictures","Pictures",Environment.GetFolderPath(Environment.SpecialFolder.MyPictures));
            Add("@music","Music",Environment.GetFolderPath(Environment.SpecialFolder.MyMusic));
            Add("@videos","Videos",Environment.GetFolderPath(Environment.SpecialFolder.MyVideos));
            var cloud=Environment.GetEnvironmentVariable("OneDriveConsumer")??Environment.GetEnvironmentVariable("OneDrive");if(!string.IsNullOrEmpty(cloud))Add("@onedrive","OneDrive - Personal",cloud,"cloud");
            // Shell Home provides actual pinned/frequent locations; ZIP shell folders
            // are excluded because they are not filesystem directories.
            try
            {
                var shellType=Type.GetTypeFromProgID("Shell.Application");if(shellType!=null)shell=Activator.CreateInstance(shellType);
                if(shell!=null){dynamic home=((dynamic)shell).NameSpace("shell:::{679f85cb-0220-4080-b29b-5540cc05aab6}");if(home!=null)foreach(dynamic item in home.Items()){try{string path=item.Path;if(Directory.Exists(path)){var hash=Convert.ToHexString(System.Security.Cryptography.SHA256.HashData(System.Text.Encoding.UTF8.GetBytes(path.ToLowerInvariant())))[..16].ToLowerInvariant();Add("@pin-"+hash,(string)item.Name,path,"pinned");}}catch{}if(locations.Count>=24)break;}}
            }catch{}
            foreach(var drive in DriveInfo.GetDrives())try{if(drive.IsReady&&drive.DriveType is DriveType.Fixed or DriveType.Removable or DriveType.Network){var letter=drive.Name[..1].ToLowerInvariant();var label=(string.IsNullOrWhiteSpace(drive.VolumeLabel)?"Local Disk":drive.VolumeLabel)+" ("+letter.ToUpperInvariant()+":)";Add("@drive-"+letter,label,drive.RootDirectory.FullName,drive.DriveType==DriveType.Network?"share":"drive",new{total=drive.TotalSize,free=drive.AvailableFreeSpace});}}catch{}
            Console.WriteLine(JsonSerializer.Serialize(new{ok=true,locations}));
        }
        catch{Console.WriteLine("{\"ok\":false,\"error\":\"PC locations could not be read.\"}");}
        finally{if(shell!=null&&Marshal.IsComObject(shell))Marshal.ReleaseComObject(shell);}
    }
}
