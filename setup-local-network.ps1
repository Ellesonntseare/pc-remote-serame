# Run manually as administrator on a trusted home network.
$ErrorActionPreference = 'Stop'
$taskIdentity = [Security.Principal.WindowsIdentity]::GetCurrent()
$taskPrincipal = [Security.Principal.WindowsPrincipal]::new($taskIdentity)
if (-not $taskPrincipal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw 'Open PowerShell as administrator, then run this script on your trusted home network.'
}
$taskProfiles = @(Get-NetConnectionProfile | Where-Object IPv4Connectivity -ne 'Disconnected')
foreach ($taskProfile in $taskProfiles) {
    if ($taskProfile.NetworkCategory -eq 'Public') {
        Set-NetConnectionProfile -InterfaceIndex $taskProfile.InterfaceIndex -NetworkCategory Private
    }
}
$taskNode = (Get-Command node.exe -ErrorAction Stop).Source
$taskRuleName = 'PC-Remote-Local-TCP-7666'
Get-NetFirewallRule -Name $taskRuleName -ErrorAction SilentlyContinue | Remove-NetFirewallRule
New-NetFirewallRule -Name $taskRuleName -DisplayName 'PC Remote - local private network' -Direction Inbound -Action Allow -Profile Private -Protocol TCP -LocalPort 7666 -RemoteAddress LocalSubnet -Program $taskNode | Out-Null
Write-Output 'PC Remote is allowed on trusted Private networks for devices on the local subnet. Keep the Windows host running.'
