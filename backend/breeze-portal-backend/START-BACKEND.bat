@echo off
REM Ensure we use SQLite by unsetting DATABASE_URL
set DATABASE_URL=

echo ========================================
echo  Starting Backend with SQLite
echo ========================================
echo.
echo Database: SQLite (breeze.db)
echo Port: 4000
echo.

node server.js
