@echo off
echo Killing all Node processes...
taskkill /F /IM node.exe >nul 2>&1

echo Waiting 3 seconds...
timeout /t 3 >nul

echo Starting backend...
cd backend\breeze-portal-backend
start cmd /k "echo Backend Server && npm run dev"

echo.
echo Backend is starting...
echo Wait 5 seconds then test login!
echo.
pause
