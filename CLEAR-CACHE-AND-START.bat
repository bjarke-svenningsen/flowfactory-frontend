@echo off
echo ===================================================================
echo   START PORTAL MED CLEAR CACHE (INCOGNITO MODE)
echo ===================================================================
echo.
echo Dette starter:
echo   1. Backend med korrekt database (SQLite)
echo   2. Frontend (Python http.server)
echo   3. Browser i INCOGNITO mode (ingen cache)
echo.
echo Du skal se: Novo Nordisk, Arla, 5 tilbud, 5 posts, etc.
echo.
echo ===================================================================
echo.

REM Start backend in SQLite mode
echo [1/3] Starter backend (SQLite database)...
start "Backend Server" cmd /k "cd /d backend\breeze-portal-backend && START-BACKEND-SQLITE.bat"

REM Wait for backend to start
echo Venter 3 sekunder paa backend starter...
timeout /t 3 /nobreak >nul

REM Start frontend with Python
echo [2/3] Starter frontend (Python http.server)...
start "Frontend Server" cmd /k "python -m http.server 8000"

REM Wait for frontend to start
echo Venter 2 sekunder paa frontend starter...
timeout /t 2 /nobreak >nul

REM Open Chrome in incognito mode
echo [3/3] Aabner browser i INCOGNITO mode (ingen cache)...
start chrome --incognito "http://localhost:8000/index.html?nocache=%random%"

echo.
echo ===================================================================
echo   PORTAL STARTET I INCOGNITO MODE!
echo ===================================================================
echo.
echo Backend:  http://localhost:4000
echo Frontend: http://localhost:8000
echo Browser:  Aabnet i INCOGNITO mode
echo.
echo Login:
echo   Email:    bjarke.sv@gmail.com
echo   Password: Olineersej123
echo.
echo Du skal NU se dit rigtige data:
echo   - Novo Nordisk A/S
echo   - Arla Mejericenter Chr. Feld
echo   - 5 Tilbud/Ordrer
echo   - 5 Posts
echo   - 1 Faktura
echo   - 7 Mapper
echo   - 2 Filer
echo.
echo Hvis du STADIG ikke ser data:
echo   1. Tryk F12 (Developer Tools)
echo   2. Tjek Console for fejlmeddelelser
echo   3. Send mig fejlmeddelelserne
echo.
echo Luk begge cmd-vinduer for at stoppe serverne.
echo ===================================================================
pause
