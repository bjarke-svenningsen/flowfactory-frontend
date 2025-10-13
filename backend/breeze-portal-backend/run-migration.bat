@echo off
echo ========================================
echo MIGRATING DATA TO SUPABASE
echo ========================================
echo.
echo This will copy ALL data from your local
echo SQLite database to Supabase PostgreSQL.
echo.
echo This includes:
echo - All users
echo - All posts and messages
echo - All customers, quotes, invoices
echo - All files and folders
echo - Everything else!
echo.
pause
echo.
echo Starting migration...
echo.

cd /d "%~dp0"

node MIGRATE-TO-SUPABASE.js

echo.
echo ========================================
echo MIGRATION COMPLETE!
echo ========================================
echo.
echo Now go to: https://flowfactory-denmark.netlify.app
echo Login and ALL your data should be there!
echo.
pause
