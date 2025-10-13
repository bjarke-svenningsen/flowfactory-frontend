@echo off
echo ========================================
echo DEPLOYING SUPABASE FIXES TO RAILWAY
echo ========================================
echo.

cd /d "%~dp0\backend\breeze-portal-backend"

echo Step 1: Adding all files...
git add -A

echo.
echo Step 2: Committing changes...
git commit -m "COMPLETE SUPABASE MIGRATION - Backend now uses Supabase PostgreSQL"

echo.
echo Step 3: Pushing to GitHub...
git push origin main --force

echo.
echo ========================================
echo SUCCESS! 
echo ========================================
echo.
echo Railway will automatically detect the new code
echo and redeploy within 2-3 minutes.
echo.
echo Then go to: https://flowfactory-denmark.netlify.app
echo Login and everything should work!
echo.
echo ========================================
pause
