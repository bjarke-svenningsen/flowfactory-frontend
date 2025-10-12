// Make user admin via Railway API
const https = require('https');

const email = 'bjarke.sv@gmail.com';
const backendUrl = 'flowfactory-backend-production.up.railway.app';

// Approve and make admin
const data = JSON.stringify({ email });

const options = {
  hostname: backendUrl,
  path: '/api/admin/approve-first-user',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': data.length
  }
};

const req = https.request(options, (res) => {
  let response = '';
  
  res.on('data', (chunk) => {
    response += chunk;
  });
  
  res.on('end', () => {
    console.log('Response:', response);
    if (res.statusCode === 200) {
      console.log('✅ Du er nu admin! Prøv at logge ind nu!');
    } else {
      console.log('❌ Fejl:', res.statusCode);
      console.log('Prøv at bruge admin panel på Railway i stedet.');
    }
  });
});

req.on('error', (error) => {
  console.error('Fejl:', error);
  console.log('\n📝 ALTERNATIV LØSNING:');
  console.log('1. Gå til: https://railway.app/project/YOUR_PROJECT');
  console.log('2. Klik på din database');
  console.log('3. Klik "Data" tab');
  console.log('4. Find users tabellen');
  console.log(`5. Find rækken med email: ${email}`);
  console.log('6. Sæt approved = 1 og is_admin = 1');
});

req.write(data);
req.end();
