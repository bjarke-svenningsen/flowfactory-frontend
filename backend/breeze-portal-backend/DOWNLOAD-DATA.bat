@echo off
echo ========================================
echo  DOWNLOAD DATA FRA RAILWAY
echo ========================================
echo.
echo Dette script henter dit production data
echo fra Railway PostgreSQL og gemmer det i
echo lokal SQLite database.
echo.
echo VIGTIGT: Luk backend serveren først!
echo.
pause

node DOWNLOAD-DATA-FRA-RAILWAY.js

echo.
echo ========================================
echo.
pause
