@echo off
echo ========================================
echo TESTING SUPABASE CONNECTION
echo ========================================
echo.

cd /d "%~dp0"

echo Testing connection...
node -e "import('pg').then(pg => { const { Pool } = pg.default; const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } }); pool.query('SELECT NOW()').then(res => { console.log('SUCCESS! Connected to Supabase!'); console.log('Server time:', res.rows[0].now); pool.end(); }).catch(err => { console.error('ERROR:', err.message); pool.end(); process.exit(1); }); });"

echo.
echo ========================================
echo TEST COMPLETE
echo ========================================
pause
