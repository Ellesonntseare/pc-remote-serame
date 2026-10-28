@echo off
setlocal
cd /d "%~dp0"
title PC Remote - Visible Windows Host
where node.exe >nul 2>nul || (echo Node.js is missing. Install Node.js 22.13 or newer from https://nodejs.org & pause & exit /b 1)
node -e "const [a,b]=process.versions.node.split('.').map(Number);if(a<22||(a===22&&b<13)){console.error('Node.js 22.13 or newer is required for account history.');process.exit(1)}"
if errorlevel 1 exit /b 1
rem Reuse the active host before rebuilding its running desktop agent.
node -e "const http=require('node:http');let done=false;function finish(code){if(!done){done=true;process.exit(code)}}const req=http.get({host:'127.0.0.1',port:Number(process.env.PORT||7666),path:'/api/ping',headers:{'X-PCR':'1'}},res=>{let data='';res.on('data',chunk=>{data+=chunk;if(data.length>4096)finish(11)});res.on('end',()=>{try{const value=JSON.parse(data);finish(res.statusCode===200&&value.ok===true&&(typeof value.requirePassword==='boolean'||typeof value.requirePin==='boolean')?10:11)}catch{finish(11)}})});req.setTimeout(2000,()=>{req.destroy();finish(11)});req.on('error',error=>finish(error.code==='ECONNREFUSED'?0:11));"
if "%errorlevel%"=="10" (echo PC Remote is already running. Reusing the existing host. & exit /b 0)
if "%errorlevel%"=="11" (echo Port 7666 is occupied or not responding as PC Remote. Check the existing host before starting again. & exit /b 1)
where dotnet.exe >nul 2>nul || (echo .NET 8 SDK is missing. Install it from https://dotnet.microsoft.com/download/dotnet/8.0 & pause & exit /b 1)
echo Checking server dependencies...
node -e "const fs=require('fs'),path=require('path'),p=require('./package.json'),lock=require('./package-lock.json');try{for(const name of Object.keys(p.dependencies||{})){const installed=JSON.parse(fs.readFileSync(path.join('node_modules',name,'package.json'),'utf8'));if(installed.version!==lock.packages['node_modules/'+name].version)process.exit(1)}}catch{process.exit(1)}"
if errorlevel 1 (
  echo Installing updated server dependencies...
  call npm ci --omit=dev --no-audit --no-fund
  if errorlevel 1 (echo Dependency installation failed. Check your internet connection and retry. & pause & exit /b 1)
)
echo Building the Windows desktop agent...
rem Framework-dependent build: avoids NuGet downloads for single-file publishing tools.
rem The installed .NET 8 SDK includes the Windows desktop runtime.
dotnet build "RemoteAgent\RemoteAgent.csproj" -c Release -o "RemoteAgent\bin" --nologo
if errorlevel 1 (echo Build failed. Check the errors above. & pause & exit /b 1)
if not exist "RemoteAgent\bin\RemoteAgent.dll" (echo Build output missing. & pause & exit /b 1)
echo.
echo Opening private remote control server. Keep this window open.
echo Windows Firewall may ask you to allow private networks. Do NOT allow public networks.
echo.
node server.js
if errorlevel 1 (echo. & echo PC Remote exited with an error. & pause)
endlocal
