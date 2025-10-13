// TEST-RAILWAY-LOGIN.cjs - Test login direkte mod Railway backend
const https = require('https');

const loginData = JSON.stringify({
  email: 'bjarke.sv@gmail.com',
  password: 'admin123'
});

const options = {
  hostname: 'flowfactory-backend-production.up.railway.app',
  port: 443,
  path: '/api/auth/login',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': loginData.length
  }
};

console.log('\n🧪 TESTER RAILWAY BACKEND LOGIN');
console.log('='.repeat(80));
console.log('\nBackend URL:', 'https://flowfactory-backend-production.up.railway.app');
console.log('Endpoint:', '/api/auth/login');
console.log('Email:', 'bjarke.sv@gmail.com');
console.log('Password:', 'admin123');
console.log('\nSender request...\n');

const req = https.request(options, (res) => {
  let data = '';

  res.on('data', (chunk) => {
    data += chunk;
  });

  res.on('end', () => {
    console.log('Status Code:', res.statusCode);
    console.log('Headers:', JSON.stringify(res.headers, null, 2));
    console.log('\nResponse Body:');
    console.log(data);
    
    try {
      const json = JSON.parse(data);
      console.log('\nParsed JSON:');
      console.log(JSON.stringify(json, null, 2));
      
      if (res.statusCode === 200) {
        console.log('\n✅ SUCCESS! Login virker!');
        console.log('Token:', json.token?.substring(0, 20) + '...');
      } else {
        console.log('\n❌ LOGIN FEJLEDE!');
        console.log('Fejl:', json.error || json.message);
      }
    } catch (e) {
      console.log('\nKunne ikke parse JSON:', e.message);
    }
    
    console.log('\n' + '='.repeat(80));
  });
});

req.on('error', (error) => {
  console.error('❌ Request fejlede:', error.message);
  console.log('\nMulige årsager:');
  console.log('  - Railway backend kører ikke');
  console.log('  - Netværksforbindelse problem');
  console.log('  - Railway URL er forkert');
});

req.write(loginData);
req.end();
