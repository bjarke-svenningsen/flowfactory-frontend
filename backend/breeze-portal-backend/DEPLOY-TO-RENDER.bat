@echo off
echo ========================================
echo DEPLOYER BACKEND TIL RENDER
echo ========================================
echo.

echo [1/3] Tilfojer backend filer til Git...
git add server.js

echo.
echo [2/3] Committer aendringer...
git commit -m "Fix: CORS configuration for Netlify frontend"

echo.
echo [3/3] Pusher til GitHub (Render deployer automatisk)...
git push origin main

echo.
echo ========================================
echo DONE! Render deployer nu automatisk!
echo ========================================
echo.
echo Vent 2-3 minutter og refresh derefter:
echo https://flowfactory-denmark.netlify.app
echo.
pause
