@echo off
setlocal

set "UNINSTALL_1=%LOCALAPPDATA%\Programs\AASTHIX ATS\Uninstall AASTHIX ATS.exe"
set "UNINSTALL_2=%ProgramFiles%\AASTHIX ATS\Uninstall AASTHIX ATS.exe"

if exist "%UNINSTALL_1%" (
  echo Running uninstaller from "%UNINSTALL_1%"
  start /wait "" "%UNINSTALL_1%" /S
  exit /b %errorlevel%
)

if exist "%UNINSTALL_2%" (
  echo Running uninstaller from "%UNINSTALL_2%"
  start /wait "" "%UNINSTALL_2%" /S
  exit /b %errorlevel%
)

echo [ERROR] Uninstaller not found. Please uninstall from Windows Settings > Apps.
exit /b 1
