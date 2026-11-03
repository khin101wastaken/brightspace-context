#ifndef PayloadDir
  #error PayloadDir must point to the verified staging directory.
#endif
#ifndef ReleaseDir
  #error ReleaseDir is required.
#endif
#ifndef AppVersion
  #error AppVersion is required.
#endif
#ifndef AppIdentity
  #define AppIdentity "{{A73D4F48-E16D-4D91-9FE4-722A45A899F0}"
#endif
#ifndef AppDefaultDir
  #define AppDefaultDir "{localappdata}\Programs\Brightspace Context"
#endif
#ifndef AppGroupName
  #define AppGroupName "Brightspace Context"
#endif

[Setup]
AppId={#AppIdentity}
AppName=Brightspace Context
AppVersion={#AppVersion}
AppPublisher=Brightspace Context contributors
DefaultDirName={#AppDefaultDir}
DefaultGroupName={#AppGroupName}
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible and not arm64
ArchitecturesInstallIn64BitMode=x64compatible
MinVersion=10.0
DisableProgramGroupPage=yes
DisableDirPage=yes
OutputDir={#ReleaseDir}
OutputBaseFilename=BrightspaceContext-{#AppVersion}-windows-x64-setup
#ifdef FastTestBuild
Compression=none
SolidCompression=no
#else
Compression=lzma2
SolidCompression=yes
#endif
WizardStyle=modern
CloseApplications=yes
RestartApplications=no
UninstallDisplayName=Brightspace Context
UninstallDisplayIcon={app}\runtime\node.exe
SetupLogging=yes

[Tasks]
Name: "desktopicon"; Description: "Create a desktop shortcut"; GroupDescription: "Shortcuts:"; Flags: unchecked

[Files]
Source: "{#PayloadDir}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\Brightspace Context Companion"; Filename: "{app}\Start Companion.cmd"; WorkingDir: "{app}"; IconFilename: "{app}\runtime\node.exe"
#ifndef LegacyUpgradeFixture
Name: "{group}\Troubleshooting\Companion (verbose logs)"; Filename: "{app}\Start Companion.cmd"; Parameters: "--debug"; WorkingDir: "{app}"; IconFilename: "{app}\runtime\node.exe"
#endif
Name: "{group}\Setup guide"; Filename: "{app}\SETUP.html"
Name: "{group}\Extension folder"; Filename: "{app}\app\extension"
Name: "{group}\Uninstall Brightspace Context"; Filename: "{uninstallexe}"
Name: "{userdesktop}\Brightspace Context"; Filename: "{app}\Start Companion.cmd"; WorkingDir: "{app}"; IconFilename: "{app}\runtime\node.exe"; Tasks: desktopicon

[Run]
Filename: "{app}\SETUP.html"; Description: "Open the setup guide"; Flags: shellexec postinstall skipifsilent

; User data lives outside {app}. Deliberately no cache, pairing, catalog,
; browser profile, startup registration, or desktop MCP configuration deletion.
