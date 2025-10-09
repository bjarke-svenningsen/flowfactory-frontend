@echo off
echo ================================================
echo    FlowFactory Portal - Quick Start
echo ================================================
echo.
echo Dette script starter portalen automatisk!
echo.
echo [1/4] Checker at Node.js er installeret...
node --version >nul 2>&1
if errorlevel 1 (
    echo FEJL: Node.js er ikke installeret!
    echo.
    echo Download Node.js fra: https://nodejs.org
    echo Installer og genstart derefter denne fil.
    pause
    exit
)
echo ✓ Node.js er installeret
echo.

echo [2/4] Starter backend server...
cd backend\breeze-portal-backend
start cmd /k "echo Backend Server && npm run dev"
timeout /t 3 >nul

echo [3/4] Venter på backend starter...
timeout /t 5 >nul

echo [4/4] Starter frontend server...
cd ..\..
start cmd /k "echo Frontend Server && python -m http.server 8000"
timeout /t 2 >nul

echo.
echo ================================================
echo    PORTALEN STARTER NU!
echo ================================================
echo.
echo Backend:  http://localhost:4000
echo Frontend: http://localhost:8000
echo.
echo Din browser åbner om 5 sekunder...
echo.
echo VIGTIGT: Luk IKKE de to nye vinduer der åbnede!
echo De skal køre i baggrunden.
echo.
timeout /t 5 >nul
start http://localhost:8000
echo.
echo Portalen er åben i din browser!
echo Du kan lukke DETTE vindue nu.
echo.
pause
