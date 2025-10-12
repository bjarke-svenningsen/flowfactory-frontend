@echo off
echo Pusher backend opdatering til Railway...
cd temp-backend
git add server.js
git commit -m "Add approve-first endpoint for initial admin setup"
git push
echo.
echo FÆRDIG! Railway deployer nu automatisk!
echo Vent 2 minutter og prøv approve-bjarke.html igen!
pause
