@echo off
echo ========================================
echo   AUTO-FIX: GØR ALT KLAR
echo ========================================
echo.

REM 1. Kill all node processes
echo [1/4] Stopper gamle processer...
taskkill /F /IM node.exe 2>nul
taskkill /F /IM python.exe 2>nul
timeout /t 2 /nobreak >nul

REM 2. Clear DATABASE_URL environment variable
echo [2/4] Fjerner DATABASE_URL...
set DATABASE_URL=
timeout /t 1 /nobreak >nul

REM 3. Start backend
echo [3/4] Starter backend (SQLite mode)...
start "Backend Server" cmd /k "cd /d backend\breeze-portal-backend && set DATABASE_URL= && node server.js"
timeout /t 4 /nobreak >nul

REM 4. Start frontend  
echo [4/4] Starter frontend...
start "Frontend Server" cmd /k "python -m http.server 8000"
timeout /t 3 /nobreak >nul

REM 5. Open browser
start http://localhost:8000

echo.
echo ========================================
echo   KLAR! Browser åbner nu!
echo ========================================
echo.
echo Login:
echo   Email: bjarke.sv@gmail.com
echo   Password: Olineersej123
echo.
echo Du skulle nu se dine kunder:
echo   - Novo Nordisk A/S
echo   - Arla Mejericenter Chr. Feld
echo.
pause
