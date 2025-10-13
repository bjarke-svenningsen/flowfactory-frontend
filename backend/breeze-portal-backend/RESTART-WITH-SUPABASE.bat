@echo off
echo ========================================
echo RESTARTING BACKEND WITH SUPABASE
echo ========================================
echo.

cd /d "%~dp0"

echo Stopping old backend...
taskkill /F /IM node.exe 2>nul
timeout /t 2 /nobreak >nul

echo.
echo Starting backend with Supabase...
echo.
echo OUTPUT:
echo ========================================
echo.

npm start

echo.
echo ========================================
echo BACKEND STOPPED
echo ========================================
pause
