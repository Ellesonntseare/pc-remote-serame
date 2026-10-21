@echo off
setlocal
cd /d "%~dp0"
title Publish PC Remote Android - PRIVATE GitHub

echo.
echo ======================================================
echo  PC Remote + Android APK builder - PRIVATE repository

echo ======================================================
echo.
echo Repository name: pc-remote-android

echo Android APK will be built automatically on GitHub Actions.
echo.
where git.exe >nul 2>nul || (echo Git is missing. Install Git from https://git-scm.com/ & pause & exit /b 1)
where gh.exe >nul 2>nul || (echo GitHub CLI is missing. In PowerShell run: winget install --id GitHub.cli -e & pause & exit /b 1)
gh auth status >nul 2>nul || (echo GitHub is not signed in. First run: gh auth login & pause & exit /b 1)

if not exist ".git\HEAD" (
  git init -b main || (echo Could not initialize Git. & pause & exit /b 1)
)
git add -A || (echo Could not stage files. & pause & exit /b 1)
git diff --cached --check || (echo Whitespace or patch errors detected. & pause & exit /b 1)
git diff --cached --quiet
if errorlevel 1 (
  git commit -m "PC Remote Android client and configurable phone controls" || (echo Please configure Git name/email and rerun. & pause & exit /b 1)
)
echo.
echo These tracked files will be uploaded:
git ls-files
echo.
set /p confirm=Type YES to create a PRIVATE GitHub repository and push:
if not "%confirm%"=="YES" (echo Cancelled - nothing uploaded. & exit /b 0)
git remote get-url origin >nul 2>nul
if not errorlevel 1 (
  echo This folder already has an origin. Will push to it if you choose to do so manually.
  git remote -v
  pause
  exit /b 1
)
gh repo create pc-remote-android --private --source . --remote origin --push
if errorlevel 1 (echo GitHub repository creation failed. No public repository was created by this script. & pause & exit /b 1)
echo.
echo Published privately. The Actions tab will build the Android APK.
echo It will be under Actions ^> Build Android APK ^> Artifacts.
gh repo view --web
pause
endlocal
