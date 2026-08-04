@echo off
rem Launch the game by double-clicking, no terminal needed.
rem
rem The window stays open on failure. That is the whole point of a batch file
rem here: a crash should be readable, not a window that blinks and vanishes.
rem
rem Pass --windowed to play in a desktop window instead of fullscreen:
rem     play.bat --windowed

setlocal
cd /d "%~dp0"

rem `npm start` runs electron-vite preview, which rejects unknown argv, so the
rem flag travels as an environment variable instead (src/main/index.ts).
if /i "%~1"=="--windowed" set "POW_WINDOWED=1"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found on PATH.
  echo Install Node 20 or newer from https://nodejs.org and run this again.
  goto :fail
)

if not exist node_modules (
  echo Installing dependencies, one moment...
  call npm install
  if errorlevel 1 goto :fail
)

rem Always build: the sources move faster than anyone remembers to rebuild,
rem and a stale bundle looks exactly like a bug that was already fixed.
echo Building...
call npm run build
if errorlevel 1 goto :fail

rem The game folder is NOT guessed here. This project normally sits inside the
rem installation, and the app already falls back to its parent directory when
rem nothing else says otherwise (src/main/gameDir.ts). Setting it here would
rem turn that guess into an explicit answer and override the .env a player
rem established by pointing the app at their own install.

echo Starting Pigs of Worldwar...
call npm start
if errorlevel 1 goto :fail

exit /b 0

:fail
echo.
echo --- the game exited with an error, so this window stays open ---
pause
exit /b 1
