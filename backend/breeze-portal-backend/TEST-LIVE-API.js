// TEST-LIVE-API.js
// Test live API endpoints to see what they actually return
import fetch from 'node-fetch';

const API_URL = 'http://localhost:4000';

console.log('\n🔍 Testing Live API Endpoints');
console.log('='.repeat(80));

async function testAPI() {
  try {
    // First login to get token
    console.log('\n1️⃣ Testing login...');
    const loginRes = await fetch(`${API_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'bjarke.sv@gmail.com',
        password: 'Olineersej123'
      })
    });
    
    if (!loginRes.ok) {
      throw new Error(`Login failed: ${loginRes.status}`);
    }
    
    const loginData = await loginRes.json();
    console.log('✓ Login successful');
    console.log('  User:', loginData.user.name);
    console.log('  Token:', loginData.token.substring(0, 20) + '...');
    
    const token = loginData.token;
    const headers = {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    };
    
    // Test customers endpoint
    console.log('\n2️⃣ Testing /api/customers...');
    const customersRes = await fetch(`${API_URL}/api/customers`, { headers });
    const customers = await customersRes.json();
    console.log(`✓ Found ${customers.length} customers:`);
    customers.forEach(c => {
      console.log(`  - ${c.company_name} (ID: ${c.id})`);
    });
    
    // Test posts endpoint
    console.log('\n3️⃣ Testing /api/posts...');
    const postsRes = await fetch(`${API_URL}/api/posts`, { headers });
    const posts = await postsRes.json();
    console.log(`✓ Found ${posts.length} posts`);
    
    // Test quotes endpoint
    console.log('\n4️⃣ Testing /api/quotes...');
    const quotesRes = await fetch(`${API_URL}/api/quotes`, { headers });
    const quotes = await quotesRes.json();
    console.log(`✓ Found ${quotes.length} quotes:`);
    quotes.forEach(q => {
      console.log(`  - Order ${q.order_number}: ${q.title}`);
    });
    
    // Test invoices endpoint
    console.log('\n5️⃣ Testing /api/invoices...');
    const invoicesRes = await fetch(`${API_URL}/api/invoices`, { headers });
    const invoices = await invoicesRes.json();
    console.log(`✓ Found ${invoices.length} invoices`);
    
    // Test folders endpoint
    console.log('\n6️⃣ Testing /api/folders...');
    const foldersRes = await fetch(`${API_URL}/api/folders`, { headers });
    const folders = await foldersRes.json();
    console.log(`✓ Found ${folders.length} folders`);
    
    // Test files endpoint
    console.log('\n7️⃣ Testing /api/files...');
    const filesRes = await fetch(`${API_URL}/api/files`, { headers });
    const files = await filesRes.json();
    console.log(`✓ Found ${files.length} files`);
    
    console.log('\n' + '='.repeat(80));
    console.log('🎉 API TEST COMPLETE');
    console.log('='.repeat(80));
    console.log(`✓ ${customers.length} customers from API`);
    console.log(`✓ ${posts.length} posts from API`);
    console.log(`✓ ${quotes.length} quotes from API`);
    console.log(`✓ ${invoices.length} invoices from API`);
    console.log(`✓ ${folders.length} folders from API`);
    console.log(`✓ ${files.length} files from API`);
    console.log('='.repeat(80));
    
    if (customers.length === 0) {
      console.log('\n⚠️  WARNING: API returned 0 customers but database has 2!');
      console.log('   The server is using a different/wrong database file!');
    } else {
      console.log('\n✅ API is returning data correctly!');
      console.log('   If user still sees no data, the problem is in the frontend.');
    }
    
  } catch (error) {
    console.error('\n❌ Error testing API:', error.message);
    console.log('\n💡 Make sure backend server is running with:');
    console.log('   START-BACKEND-SQLITE.bat');
  }
}

testAPI();
