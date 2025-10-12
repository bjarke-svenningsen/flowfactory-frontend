@echo off
cd /d "%~dp0"
echo Creating customer_contacts table...
echo.
node create-customer-contacts-table.js
echo.
echo Done! Press any key to close...
pause
