@echo off
echo ========================================
echo   FINAL START - FORCE SQLITE MODE
echo ========================================
echo.

REM Kill everything first
taskkill /F /IM node.exe 2>nul
taskkill /F /IM python.exe 2>nul
timeout /t 2 /nobreak >nul

echo [1/3] Starter backend (FORCE SQLite)...
start "Backend Server" cmd /k "set DATABASE_URL= && cd /d %~dp0backend\breeze-portal-backend && node server.js"
timeout /t 4 /nobreak >nul

echo [2/3] Starter frontend...
start "Frontend Server" cmd /k "cd /d %~dp0 && python -m http.server 8000"
timeout /t 3 /nobreak >nul

echo [3/3] Åbner browser...
start http://localhost:8000

echo.
echo ========================================
echo   KLAR! Login nu!
echo ========================================
echo.
echo   Email: bjarke.sv@gmail.com
echo   Password: Olineersej123
echo.
pause
