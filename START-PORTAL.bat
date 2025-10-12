@echo off
echo ========================================
echo   STARTER BREEZE PORTAL (LOKAL)
echo ========================================
echo.

REM Start backend in SQLite mode
echo [1/2] Starter backend (SQLite database)...
start "Backend Server" cmd /k "cd /d backend\breeze-portal-backend && START-BACKEND.bat"

REM Wait for backend to start
echo Venter 3 sekunder på at backend starter...
timeout /t 3 /nobreak >nul

REM Start frontend
echo [2/2] Starter frontend...
start "Frontend Server" cmd /k "python -m http.server 8000"

REM Wait a bit more for frontend to start
timeout /t 2 /nobreak >nul

REM Open browser
echo [3/3] Åbner browser...
start http://localhost:8000

echo.
echo ========================================
echo   PORTAL ER STARTET!
echo ========================================
echo.
echo Backend:  http://localhost:4000
echo Frontend: http://localhost:8000
echo Browser:  Åbnet automatisk
echo.
echo Login:
echo   Email: bjarke.sv@gmail.com
echo   Password: Olineersej123
echo.
echo TJEK at backend vinduet viser:
echo   "Database Mode: SQLite (Development)"
echo.
echo Luk begge vinduer for at stoppe serverne.
echo.
pause
