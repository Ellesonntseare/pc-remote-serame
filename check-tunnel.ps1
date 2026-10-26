param([switch]$StartIfStopped)
$ErrorActionPreference='Stop'
$tunnelService=Get-Service -Name Cloudflared -ErrorAction SilentlyContinue
if(!$tunnelService){Write-Host 'Cloudflare connector service is not installed. Local Wi-Fi access can still work.';exit 2}
if($tunnelService.Status -ne 'Running' -and $StartIfStopped){
    try{Start-Service -Name $tunnelService.Name;$tunnelService.WaitForStatus('Running',[TimeSpan]::FromSeconds(10))}
    catch{Write-Host 'Cloudflare is stopped. Open Windows Services as administrator and start Cloudflared. Local access can still work.';exit 2}
}
if($tunnelService.Status -eq 'Running'){Write-Host 'Cloudflare connector service is running.';exit 0}
Write-Host 'Cloudflare connector service is stopped. Website access will fail until it starts.'
exit 2
