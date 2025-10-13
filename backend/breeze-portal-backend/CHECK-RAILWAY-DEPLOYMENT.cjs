// CHECK-RAILWAY-DEPLOYMENT.cjs - Check if Railway has the updated server.js
const https = require('https');

const BACKEND_URL = 'https://flowfactory-backend-production.up.railway.app';

console.log('\n🔍 TJEKKER RAILWAY DEPLOYMENT STATUS');
console.log('='.repeat(80));

// Test a simple endpoint to see if backend is running
const options = {
  hostname: 'flowfactory-backend-production.up.railway.app',
  path: '/',
  method: 'GET'
};

const req = https.request(options, (res) => {
  console.log('\n✓ Railway backend er tilgængelig');
  console.log(`  Status Code: ${res.statusCode}`);
  console.log(`  Server: ${res.headers.server || 'unknown'}`);
  console.log(`  Date: ${res.headers.date || 'unknown'}`);
  
  let data = '';
  res.on('data', (chunk) => {
    data += chunk;
  });
  
  res.on('end', () => {
    console.log(`\n  Response: ${data}`);
    
    console.log('\n📊 ANALYSE:');
    console.log('  Hvis Railway viser gammel dato, har den ikke deployed endnu.');
    console.log('  Gå til Railway dashboard og tjek deployment logs.');
    console.log('\n='.repeat(80));
  });
});

req.on('error', (error) => {
  console.error('\n❌ Kunne ikke forbinde til Railway:', error.message);
});

req.end();
