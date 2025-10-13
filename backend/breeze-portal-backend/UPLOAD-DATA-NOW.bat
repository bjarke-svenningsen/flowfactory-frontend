@echo off
echo.
echo ======================================================================
echo UPLOADER DATA TIL RAILWAY
echo ======================================================================
echo.

set DATABASE_URL=postgresql://postgres:bWBKtSXRuaoeNzdgKRbZGgWYwFUnTDLg@shortline.proxy.rlwy.net:56745/railway

node UPLOAD-NOW.cjs

pause
