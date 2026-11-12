param(
    [Parameter(Mandatory = $true)][string]$InstallDirectory,
    [switch]$CheckRuntime
)

$ErrorActionPreference = 'Stop'
$trayPath = Join-Path $InstallDirectory 'Brightspace Context.exe'
$nodePath = Join-Path $InstallDirectory 'runtime\node.exe'

foreach ($entry in (Get-CimInstance -ClassName Win32_Process -Filter "Name = 'Brightspace Context.exe'" -OperationTimeoutSec 5)) {
    if ($entry.ExecutablePath -ne $trayPath) { continue }
    $tray = Get-Process -Id $entry.ProcessId -ErrorAction SilentlyContinue
    if (!$tray) { continue }

    $children = Get-CimInstance -ClassName Win32_Process -Filter "ParentProcessId = $($tray.Id) AND Name = 'node.exe'" -OperationTimeoutSec 5
    $workers = foreach ($child in $children) {
        if ($child.ExecutablePath -eq $nodePath) {
            Get-Process -Id $child.ProcessId -ErrorAction SilentlyContinue
        }
    }

    # Shut down the old tray first. Its exit closes the worker's stdin, which
    # lets the worker flush state without the tray showing a crash dialog.
    if (!$tray.HasExited) { Stop-Process -InputObject $tray }
    if (!$tray.WaitForExit(5000)) { throw 'Brightspace Context tray did not exit.' }
    foreach ($worker in $workers) {
        if (!$worker.WaitForExit(8000)) { throw 'Brightspace Context worker did not exit.' }
    }
    Write-Output 'Stopped the installed companion tray and waited for its worker.'
}

if ($CheckRuntime) {
    $active = Get-CimInstance -ClassName Win32_Process -Filter "Name = 'node.exe'" -OperationTimeoutSec 5 |
        Where-Object { $_.ExecutablePath -eq $nodePath }
    if ($active) {
        Write-Output 'The installed Node runtime needs updating and is still running.'
        exit 3
    }
}
