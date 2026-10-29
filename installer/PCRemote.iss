#define AppVersion "2.2.0"
[Setup]
AppId={{C9EF8E11-66AA-43CB-B017-25F799BDA175}
AppName=Elleson Connect Personal Host
AppVersion={#AppVersion}
AppPublisher=Elleson Connect
DefaultDirName={localappdata}\Programs\PCRemote
DefaultGroupName=Elleson Connect
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
OutputDir=..\dist
OutputBaseFilename=Elleson-Connect-Host-Setup-2.2.0
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
SetupIconFile=..\HostTray\Assets\remote.ico
UninstallDisplayIcon={app}\PCRemoteHost.exe
CloseApplications=yes
[Tasks]
Name: "startup"; Description: "Start Elleson Connect when I sign in"; Flags: unchecked
[Files]
Source: "..\dist\host-package\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs; Excludes: "config.json,.remembered-sessions.json,.google-accounts.json,.session-history.json,.shared-device-state.json,host.log,transfer-queue.json"
[Icons]
Name: "{group}\Elleson Connect Host"; Filename: "{app}\PCRemoteHost.exe"
Name: "{userappdata}\Microsoft\Windows\SendTo\Elleson Connect"; Filename: "{app}\PCRemoteHost.exe"; Parameters: "--send-to-phone"
Name: "{group}\Uninstall Elleson Connect"; Filename: "{uninstallexe}"
[Registry]
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; ValueType: string; ValueName: "PCRemotePersonalHost"; ValueData: """{app}\PCRemoteHost.exe"" --quiet"; Tasks: startup; Flags: uninsdeletevalue
[InstallDelete]
Type: files; Name: "{userappdata}\Microsoft\Windows\SendTo\PC Remote.lnk"
Type: files; Name: "{userprograms}\PC Remote\PC Remote Host.lnk"
Type: files; Name: "{userprograms}\PC Remote\Uninstall PC Remote.lnk"
[Run]
Filename: "{app}\PCRemoteHost.exe"; Description: "Start Elleson Connect Host"; Flags: nowait postinstall skipifsilent
