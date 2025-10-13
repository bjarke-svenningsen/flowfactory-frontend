@echo off
echo.
echo ======================================================================
echo DROPPER GAMLE TABELLER OG GENOPRETTER MED KORREKT STRUKTUR
echo ======================================================================
echo.

set DATABASE_URL=postgresql://postgres:bWBKtSXRuaoeNzdgKRbZGgWYwFUnTDLg@shortline.proxy.rlwy.net:56745/railway

node RECREATE-TABLES.cjs

pause
