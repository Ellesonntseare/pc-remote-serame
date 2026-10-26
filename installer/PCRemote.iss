#define AppVersion "1.9.0"
[Setup]
AppId={{C9EF8E11-66AA-43CB-B017-25F799BDA175}
AppName=PC Remote Personal Host
AppVersion={#AppVersion}
AppPublisher=PC Remote
DefaultDirName={localappdata}\Programs\PCRemote
DefaultGroupName=PC Remote
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
OutputDir=..\dist
OutputBaseFilename=PC-Remote-Host-Setup-1.9
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
UninstallDisplayIcon={app}\PCRemoteHost.exe
CloseApplications=yes
[Tasks]
Name: "startup"; Description: "Start PC Remote when I sign in"; Flags: unchecked
[Files]
Source: "..\dist\host-package\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs; Excludes: "config.json,.remembered-sessions.json,.google-accounts.json,host.log,transfer-queue.json"
[Icons]
Name: "{group}\PC Remote Host"; Filename: "{app}\PCRemoteHost.exe"
Name: "{group}\Uninstall PC Remote"; Filename: "{uninstallexe}"
[Registry]
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; ValueType: string; ValueName: "PCRemotePersonalHost"; ValueData: """{app}\PCRemoteHost.exe"" --quiet"; Tasks: startup; Flags: uninsdeletevalue
[Run]
Filename: "{app}\PCRemoteHost.exe"; Description: "Start PC Remote Host"; Flags: nowait postinstall skipifsilent
