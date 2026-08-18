@echo off
setlocal
set "ROOT=%~dp0.."
set "CLI=%ROOT%\out\agent\los.mjs"

where node >nul 2>nul
if %ERRORLEVEL% EQU 0 (
  set "RUNTIME=node"
) else if exist "%ROOT%\node_modules\electron\dist\electron.exe" (
  set "RUNTIME=%ROOT%\node_modules\electron\dist\electron.exe"
  set ELECTRON_RUN_AS_NODE=1
) else if exist "%LOCALAPPDATA%\Programs\Los Alamos\Los Alamos.exe" (
  set "RUNTIME=%LOCALAPPDATA%\Programs\Los Alamos\Los Alamos.exe"
  set ELECTRON_RUN_AS_NODE=1
) else (
  echo Los Alamos requires Node.js or the Los Alamos desktop app. 1>&2
  exit /b 127
)

if not exist "%CLI%" "%RUNTIME%" "%ROOT%\scripts\build-agent-cli.mjs"
"%RUNTIME%" "%CLI%" %*
