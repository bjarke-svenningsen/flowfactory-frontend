@echo off
echo Testing Live API...
echo Make sure backend is running first!
echo.
cd /d "%~dp0"
node TEST-LIVE-API.js
pause
