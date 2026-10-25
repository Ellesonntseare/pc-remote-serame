@echo off
setlocal
cd /d "%~dp0"
title PC Remote - Visible Windows Host
where node.exe >nul 2>nul || (echo Node.js is missing. Install Node.js 20 or newer from https://nodejs.org & pause & exit /b 1)
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
