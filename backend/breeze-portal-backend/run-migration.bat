@echo off
echo ========================================
echo RUNNING EMAIL FOLDER MIGRATION
echo ========================================
echo.
echo This will update all old emails from INBOX to inbox
echo.
pause
echo.
echo Calling migration endpoint...
curl -X POST https://flowfactory-frontend.onrender.com/api/admin/migrate-email-folders ^
  -H "Authorization: Bearer %1" ^
  -H "Content-Type: application/json"
echo.
echo.
echo ========================================
echo MIGRATION COMPLETE!
echo ========================================
pause
