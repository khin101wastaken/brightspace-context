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
#ifdef LegacyUpgradeFixture
Source: "{#PayloadDir}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
#else
Source: "Stop-Tray.ps1"; Flags: dontcopy
Source: "{#PayloadDir}\*"; DestDir: "{app}"; Excludes: "\runtime\node.exe"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "{#PayloadDir}\runtime\node.exe"; DestDir: "{app}\runtime"; Flags: ignoreversion; Check: RuntimeNeedsUpdate
#endif

[Icons]
#ifdef LegacyUpgradeFixture
Name: "{group}\Brightspace Context Companion"; Filename: "{app}\Start Companion.cmd"; WorkingDir: "{app}"; IconFilename: "{app}\runtime\node.exe"
#else
Name: "{group}\Brightspace Context Companion"; Filename: "{app}\Brightspace Context.exe"; WorkingDir: "{app}"
Name: "{group}\Troubleshooting\Companion (verbose logs)"; Filename: "{app}\Start Companion.cmd"; Parameters: "--debug"; WorkingDir: "{app}"; IconFilename: "{app}\runtime\node.exe"
#endif
Name: "{group}\Setup guide"; Filename: "{app}\SETUP.html"
Name: "{group}\Extension folder"; Filename: "{app}\app\extension"
Name: "{group}\Uninstall Brightspace Context"; Filename: "{uninstallexe}"
#ifdef LegacyUpgradeFixture
Name: "{userdesktop}\Brightspace Context"; Filename: "{app}\Start Companion.cmd"; WorkingDir: "{app}"; IconFilename: "{app}\runtime\node.exe"; Tasks: desktopicon
#else
Name: "{userdesktop}\Brightspace Context"; Filename: "{app}\Brightspace Context.exe"; WorkingDir: "{app}"; Tasks: desktopicon
#endif

[Run]
#ifndef LegacyUpgradeFixture
Filename: "{app}\Brightspace Context.exe"; Description: "Start Brightspace Context Companion"; Flags: nowait postinstall skipifsilent
#endif
Filename: "{app}\SETUP.html"; Description: "Open the setup guide"; Flags: shellexec postinstall skipifsilent

; User data and desktop MCP settings are kept on uninstall.
#ifndef LegacyUpgradeFixture
[Code]
function RuntimeNeedsUpdate: Boolean;
var
  RuntimePath: String;
begin
  RuntimePath := ExpandConstant('{app}\runtime\node.exe');
  Result := True;
  if FileExists(RuntimePath) then begin
    try
      Result := CompareText(GetSHA256OfFile(RuntimePath), '{#GetSHA256OfFile(PayloadDir + "\runtime\node.exe")}') <> 0;
    except
      Log('Unable to read the installed Node runtime checksum.');
    end;
  end;
end;

function PrepareToInstall(var NeedsRestart: Boolean): String;
var
  I, ExitCode: Integer;
  RuntimeCheck: String;
begin
  Result := '';
  for I := 1 to ParamCount do
    if CompareText(ParamStr(I), '/NOCLOSEAPPLICATIONS') = 0 then
      Exit;
  RuntimeCheck := '';
  if FileExists(ExpandConstant('{app}\runtime\node.exe')) then begin
    if RuntimeNeedsUpdate then
      RuntimeCheck := ' -CheckRuntime'
    else
      Log('Keeping the installed Node runtime because it matches the bundled checksum.');
  end;
  if (RuntimeCheck = '') and not FileExists(ExpandConstant('{app}\Brightspace Context.exe')) then
    Exit;

  ExtractTemporaryFile('Stop-Tray.ps1');
  if ExecAndLogOutput(ExpandConstant('{sys}\WindowsPowerShell\v1.0\powershell.exe'),
    '-NoProfile -NonInteractive -ExecutionPolicy Bypass -File "' +
    ExpandConstant('{tmp}\Stop-Tray.ps1') + '" -InstallDirectory "' + ExpandConstant('{app}') + '"' + RuntimeCheck,
    '', SW_HIDE, ewWaitUntilTerminated, ExitCode, nil) then begin
    if ExitCode = 0 then
      Log('Companion tray shutdown check completed before Restart Manager.')
    else if ExitCode = 3 then
      Result := 'This update includes a new Node runtime. Close any apps using the Brightspace Context connection and any companion terminal windows, then run Setup again.'
    else
      Result := 'Setup could not close Brightspace Context. Exit the companion from its tray menu, then run Setup again.';
  end else
    Result := 'Setup could not close Brightspace Context. Exit the companion from its tray menu, then run Setup again.';
end;

procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
var
  Command: String;
  RunKey: String;
begin
  if CurUninstallStep = usUninstall then begin
    RunKey := 'Software\Microsoft\Windows\CurrentVersion\Run';
    if RegQueryStringValue(HKCU, RunKey, 'BrightspaceContextCompanion', Command) then
      if CompareText(Command, '"' + ExpandConstant('{app}\Brightspace Context.exe') + '" --background') = 0 then
        RegDeleteValue(HKCU, RunKey, 'BrightspaceContextCompanion');
  end;
end;
#endif
