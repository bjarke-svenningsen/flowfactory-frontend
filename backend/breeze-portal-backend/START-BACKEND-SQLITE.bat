@echo off
echo ========================================
echo  STARTER BACKEND MED SQLITE (LOKAL)
echo ========================================
echo.

REM Clear DATABASE_URL environment variable
set DATABASE_URL=

echo Starting backend...
echo Backend vil køre på http://localhost:4000
echo.
echo Tryk CTRL+C for at stoppe backend
echo.

REM Start backend
node server.js
