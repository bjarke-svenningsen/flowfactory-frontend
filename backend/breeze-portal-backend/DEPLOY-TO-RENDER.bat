@echo off
echo ========================================
echo DEPLOYER BACKEND TIL RENDER
echo ========================================
echo.

echo [1/3] Tilfojer backend filer til Git...
git add server.js email-service.js

echo.
echo [2/3] Committer aendringer...
git commit -m "Emergency fix: Remove automatic migration causing out of memory crash"

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
