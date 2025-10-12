// Test login API
const email = 'bjarke.sv@gmail.com';
const password = 'Olineersej123';

console.log('Testing login API...\n');
console.log('Email:', email);
console.log('Password:', password);
console.log('\nSending request to http://localhost:4000/api/auth/login\n');

fetch('http://localhost:4000/api/auth/login', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({ email, password })
})
.then(res => {
  console.log('Status:', res.status);
  return res.json();
})
.then(data => {
  console.log('\nResponse:');
  console.log(JSON.stringify(data, null, 2));
  
  if (data.token) {
    console.log('\n✅ LOGIN SUCCESSFUL!');
    console.log('Token:', data.token.substring(0, 20) + '...');
  } else {
    console.log('\n❌ LOGIN FAILED!');
    console.log('Error:', data.error);
  }
})
.catch(error => {
  console.log('\n❌ REQUEST FAILED!');
  console.log('Error:', error.message);
});
