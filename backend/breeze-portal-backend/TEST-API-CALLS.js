// Test API calls directly
import fetch from 'node-fetch';

const API_URL = 'http://localhost:4000';

async function testAPI() {
  console.log('\n═══════════════════════════════════════');
  console.log('🧪 TEST API ENDPOINTS');
  console.log('═══════════════════════════════════════\n');

  try {
    // 1. Test login to get token
    console.log('1️⃣ Testing login...\n');
    const loginResponse = await fetch(`${API_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'bjarke.sv@gmail.com',
        password: 'Olineersej123'
      })
    });
    
    const loginData = await loginResponse.json();
    
    if (!loginResponse.ok) {
      console.log('❌ Login failed:', loginData);
      return;
    }
    
    console.log('✅ Login successful!');
    console.log('User:', loginData.user.name);
    console.log('Token:', loginData.token.substring(0, 20) + '...\n');
    
    const token = loginData.token;
    
    // 2. Test customers endpoint
    console.log('2️⃣ Testing /api/customers...\n');
    const customersResponse = await fetch(`${API_URL}/api/customers`, {
      headers: { 
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    
    const customersData = await customersResponse.json();
    
    if (!customersResponse.ok) {
      console.log('❌ Customers API failed:', customersData);
    } else {
      console.log(`✅ Customers API success! Found ${customersData.length} customers`);
      customersData.forEach(c => {
        console.log(`   - ${c.company_name} (${c.contact_person})`);
      });
    }
    console.log('');
    
    // 3. Test quotes endpoint
    console.log('3️⃣ Testing /api/quotes...\n');
    const quotesResponse = await fetch(`${API_URL}/api/quotes`, {
      headers: { 
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    
    const quotesData = await quotesResponse.json();
    
    if (!quotesResponse.ok) {
      console.log('❌ Quotes API failed:', quotesData);
    } else {
      console.log(`✅ Quotes API success! Found ${quotesData.length} quotes`);
      quotesData.forEach(q => {
        console.log(`   - Ordre ${q.order_number}: ${q.title} (${q.status})`);
      });
    }
    console.log('');
    
    console.log('═══════════════════════════════════════');
    console.log('✅ API TEST COMPLETE');
    console.log('═══════════════════════════════════════\n');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error('\nEr backend kørende? Tjek at http://localhost:4000 virker.\n');
  }
}

testAPI();
