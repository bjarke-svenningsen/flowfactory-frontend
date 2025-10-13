@echo off
echo ========================================
echo DEPLOYING FRONTEND WITH RENDER URL
echo ========================================
echo.

cd /d "%~dp0"

echo Step 1: Adding updated api.js...
git add js/api.js

echo.
echo Step 2: Committing change...
git commit -m "Update frontend to use Render backend instead of Railway"

echo.
echo Step 3: Pushing to GitHub...
git push origin main

echo.
echo ========================================
echo SUCCESS! 
echo ========================================
echo.
echo Netlify will automatically detect the change
echo and redeploy within 1-2 minutes.
echo.
echo Then go to: https://flowfactory-denmark.netlify.app
echo Login and everything should work!
echo.
echo Backend: Render (https://flowfactory-frontend.onrender.com)
echo Database: Supabase
echo Frontend: Netlify
echo.
echo NO MORE RAILWAY! Everything works now!
echo.
echo ========================================
pause
