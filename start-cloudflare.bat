@echo off
setlocal
cd /d "%~dp0"
where node.exe >nul 2>nul || (echo Node.js 22.13 or newer is required. & exit /b 1)
node -e "const [a,b]=process.versions.node.split('.').map(Number);if(a<22||(a===22&&b<13)){console.error('Node.js 22.13 or newer is required for account history.');process.exit(1)}"
if errorlevel 1 exit /b 1
node -e "const fs=require('fs');const p='config.json';let c={};if(fs.existsSync(p)){try{c=JSON.parse(fs.readFileSync(p,'utf8'))}catch(e){console.error('Invalid config.json:',e.message);process.exit(1)}}c.tunnelHostname='remote.teamtrader.co.za';c.allowLan=true;c.requirePin=false;fs.writeFileSync(p,JSON.stringify(c,null,2)+'\n');console.log('Website and local Wi-Fi access configured:',c.tunnelHostname)"
if errorlevel 1 exit /b 1
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0check-tunnel.ps1" -StartIfStopped
call "%~dp0start.bat"
endlocal
