@echo off
echo ========================================
echo   FlowFactory Portal - Production Deploy
echo ========================================
echo.

echo Trin 1: Checking git status...
git status
echo.

echo Trin 2: Adding all changed files...
git add .
echo.

echo Trin 3: Committing changes...
git commit -m "Update URLs for production deployment - 117 URLs opdateret i 17 filer"
echo.

echo Trin 4: Pushing to GitHub...
git push origin main
echo.

echo ========================================
echo   DEPLOYMENT STARTER AUTOMATISK!
echo ========================================
echo.
echo Netlify (Frontend): https://flowfactory-denmark.netlify.app
echo Railway (Backend):  https://flowfactory-backend-production.up.railway.app
echo.
echo Vent 2-3 minutter, og test derefter din portal!
echo.
echo Naeste trin: Tjek DEPLOYMENT-GUIDE.md for test og troubleshooting
echo.
pause
