@echo off
setlocal

set "SCRIPT_DIR=%~dp0"
set "ROOT_DIR=%SCRIPT_DIR%.."
set "DIST_DIR=%ROOT_DIR%\dist"

if not exist "%DIST_DIR%" (
  echo [ERROR] dist folder not found at "%DIST_DIR%".
  echo Build desktop installer first with: npm run desktop:build:win
  exit /b 1
)

for %%F in ("%DIST_DIR%\ATS-Setup-*.exe") do set "SETUP_EXE=%%~fF"

if not defined SETUP_EXE (
  echo [ERROR] ATS installer not found in "%DIST_DIR%".
  echo Expected file pattern: ATS-Setup-*.exe
  exit /b 1
)

echo Installing: "%SETUP_EXE%"
start /wait "" "%SETUP_EXE%" /S
if errorlevel 1 (
  echo [ERROR] Installer exited with error code %errorlevel%.
  exit /b %errorlevel%
)

echo Installation completed.
exit /b 0
