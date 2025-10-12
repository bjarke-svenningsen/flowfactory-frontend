@echo off
echo ============================================
echo   FINAL FIX - Komplet Cleanup
echo ============================================
echo.

echo [1/5] Stopping all Node processes...
taskkill /F /IM node.exe >nul 2>&1
timeout /t 3 >nul

echo [2/5] Deleting ALL database files...
del breeze.db >nul 2>&1
del backend\breeze-portal-backend\breeze.db >nul 2>&1
del backend\breeze-portal-backend\breeze.db-shm >nul 2>&1
del backend\breeze-portal-backend\breeze.db-wal >nul 2>&1
timeout /t 2 >nul

echo [3/5] Creating fresh admin user...
cd backend\breeze-portal-backend
node QUICK-FIX-ADMIN.js
timeout /t 2 >nul

echo [4/5] Starting backend...
start cmd /k "npm run dev"
timeout /t 12 >nul

echo [5/5] Testing login...
cd ..\..
node test-api.js

echo.
echo ============================================
echo If you see "LOGIN SUCCESSFUL" above:
echo Go to: http://localhost:8000
echo Email: bjarke.sv@gmail.com
echo Password: Olineersej123
echo ============================================
echo.
pause
