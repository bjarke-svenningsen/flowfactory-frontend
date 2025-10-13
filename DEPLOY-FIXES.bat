@echo off
echo ========================================
echo DEPLOYER FRONTEND FIXES TIL NETLIFY
echo ========================================
echo.

echo [1/3] Tilfojer filer til Git...
git add js/dashboard.js js/videocall.js js/quotes/quotes-invoices.js js/admin.js

echo.
echo [2/3] Committer aendringer...
git commit -m "Fix: Chat, video call, invoices, admin panel - Supabase migration complete"

echo.
echo [3/3] Pusher til GitHub (Netlify deployer automatisk)...
git push origin main

echo.
echo ========================================
echo DONE! Netlify deployer nu automatisk!
echo ========================================
echo.
echo Aabn https://flowfactory-denmark.netlify.app om 1-2 min
echo.
pause
