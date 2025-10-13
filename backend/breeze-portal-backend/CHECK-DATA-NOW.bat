@echo off
echo.
echo ======================================================================
echo TJEKKER DATA I RAILWAY
echo ======================================================================
echo.

set DATABASE_URL=postgresql://postgres:bWBKtSXRuaoeNzdgKRbZGgWYwFUnTDLg@shortline.proxy.rlwy.net:56745/railway

node CHECK-DATA.cjs

pause
