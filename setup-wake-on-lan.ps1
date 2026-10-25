# Run manually in an elevated PowerShell window. No adapter restart is performed.
$ErrorActionPreference = 'Stop'
$taskIdentity = [Security.Principal.WindowsIdentity]::GetCurrent()
$taskPrincipal = [Security.Principal.WindowsPrincipal]::new($taskIdentity)
if (-not $taskPrincipal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw 'Open PowerShell as administrator, then run this script to configure Wake-on-LAN.'
}
$taskAdapters = @(Get-NetAdapter -Physical | Where-Object { $_.Status -eq 'Up' -and $_.MediaType -eq '802.3' })
if (-not $taskAdapters.Count) { throw 'Connect the PC through a wired Ethernet adapter first.' }
foreach ($taskAdapter in $taskAdapters) {
    $taskProperties = @(Get-NetAdapterAdvancedProperty -Name $taskAdapter.Name -AllProperties)
    foreach ($taskKeyword in @('*WakeOnMagicPacket', 'EnablePME')) {
        if ($taskProperties.RegistryKeyword -contains $taskKeyword) {
            Set-NetAdapterAdvancedProperty -Name $taskAdapter.Name -RegistryKeyword $taskKeyword -RegistryValue 1 -NoRestart
        }
    }
    & powercfg.exe /deviceenablewake $taskAdapter.InterfaceDescription
    Write-Output "Configured $($taskAdapter.Name) ($($taskAdapter.MacAddress)). Enable wake/PME in BIOS if needed, then test a real sleep/wake cycle."
}
