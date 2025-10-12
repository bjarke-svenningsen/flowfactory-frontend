@echo off
echo Starting backend...
cd backend\breeze-portal-backend
start /B npm run dev

echo Waiting 10 seconds for backend to start...
timeout /t 10 >nul

cd ..\..
echo.
echo Testing API...
node test-api.js

echo.
echo If login worked, go to: http://localhost:8000
echo Email: bjarke.sv@gmail.com
echo Password: Olineersej123
echo.
pause
