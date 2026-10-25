param([string]$Email,[string]$Origin)
$ErrorActionPreference='Stop'
$configPath=Join-Path $PSScriptRoot 'config.json'
$settings=if(Test-Path -LiteralPath $configPath){Get-Content -LiteralPath $configPath -Raw|ConvertFrom-Json}else{[pscustomobject]@{}}
if(!$Email){$Email=Read-Host 'PC owner Google email (new users register separately)'}
if($Email -notmatch '^[^\s@]+@[^\s@]+\.[^\s@]+$'){throw 'Enter a valid Google email address.'}
if(!$Origin){$Origin=Read-Host 'Your HTTPS PC Remote website (example: https://remote.example.com)'}
$uri=[uri]$Origin
if($uri.Scheme -ne 'https' -or $uri.UserInfo -or $uri.AbsolutePath -ne '/' -or $uri.Query -or $uri.Fragment){throw 'Enter only your HTTPS website origin.'}
$clientId=Read-Host 'Google Web application client ID'
if($clientId -notmatch '^[a-zA-Z0-9._-]+\.apps\.googleusercontent\.com$'){throw 'Enter the Web application client ID from Google Auth Platform.'}
$secureSecret=Read-Host 'Google client secret (hidden)' -AsSecureString
$pointer=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureSecret)
try{$secret=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)}finally{[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)}
if(!$secret){throw 'Client secret is required.'}
$google=[pscustomobject]@{origin=$uri.GetLeftPart([System.UriPartial]::Authority);ownerEmails=@($Email.Trim().ToLowerInvariant());clientId=$clientId;clientSecret=$secret}
$settings|Add-Member -NotePropertyName googleSignIn -NotePropertyValue $google -Force
$settings|Add-Member -NotePropertyName tunnelHostname -NotePropertyValue $uri.Host -Force
[IO.File]::WriteAllText($configPath,($settings|ConvertTo-Json -Depth 10),[Text.UTF8Encoding]::new($false))
$secret=$null;$google=$null
Write-Host 'Saved locally. Restart the Windows host. Your client secret was not printed.'
Write-Host ('Google redirect URI: '+$uri.GetLeftPart([System.UriPartial]::Authority)+'/api/auth/google/callback')
