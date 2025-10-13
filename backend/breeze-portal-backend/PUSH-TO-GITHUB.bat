@echo off
echo ========================================
echo PUSHING CODE TO GITHUB
echo ========================================
echo.

cd /d "%~dp0"

echo Adding all files...
git add -A

echo Committing changes...
git commit -m "COMPLETE POSTGRESQL FIX - All async patterns + safe array handling"

echo Pushing to GitHub...
git push origin main --force

echo.
echo ========================================
echo DONE! Check Railway in 2 minutes!
echo ========================================
pause
