@echo off
echo Running database test...
cd /d "%~dp0"
node TEST-WHAT-API-RETURNS.js > test-output.txt 2>&1
type test-output.txt
pause
