@echo off
setlocal
cd /d "%~dp0"
where node.exe >nul 2>nul || (echo Node.js 20 or newer is required. & exit /b 1)
node -e "const fs=require('fs');const p='config.json';let c={};if(fs.existsSync(p)){try{c=JSON.parse(fs.readFileSync(p,'utf8'))}catch(e){console.error('Invalid config.json:',e.message);process.exit(1)}}c.tunnelHostname='remote.teamtrader.co.za';c.requirePin=false;fs.writeFileSync(p,JSON.stringify(c,null,2)+'\n');console.log('Cloudflare hostname configured:',c.tunnelHostname)"
if errorlevel 1 exit /b 1
call "%~dp0start.bat"
endlocal
