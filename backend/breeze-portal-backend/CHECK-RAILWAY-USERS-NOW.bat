@echo off
echo.
echo ======================================================================
echo TJEKKER RAILWAY USERS
echo ======================================================================
echo.

set DATABASE_URL=postgresql://postgres:bWBKtSXRuaoeNzdgKRbZGgWYwFUnTDLg@shortline.proxy.rlwy.net:56745/railway

node CHECK-RAILWAY-USERS.cjs

pause
