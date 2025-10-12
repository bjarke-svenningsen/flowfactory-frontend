@echo off
cd /d "%~dp0"
echo Fixing quotes table structure...
echo.
node fix-order-columns.js
echo.
echo Done! Press any key to close...
pause
