@echo off
echo.
echo ======================================================================
echo OPRETTER ALLE TABELLER I RAILWAY
echo ======================================================================
echo.

set DATABASE_URL=postgresql://postgres:bWBKtSXRuaoeNzdgKRbZGgWYwFUnTDLg@shortline.proxy.rlwy.net:56745/railway

node CREATE-ALL-TABLES.cjs

pause
