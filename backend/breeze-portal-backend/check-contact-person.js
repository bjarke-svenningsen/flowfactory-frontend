import Database from 'better-sqlite3';

const db = new Database('breeze.db');

console.log('\n=== Checking Contact Person Implementation ===\n');

// Check latest quotes
console.log('Latest 5 quotes with contact_person_id:');
const quotes = db.prepare(`
  SELECT id, quote_number, title, customer_id, contact_person_id 
  FROM quotes 
  ORDER BY id DESC 
  LIMIT 5
`).all();

quotes.forEach(q => {
  console.log(`  Quote #${q.quote_number}: Customer ${q.customer_id}, Contact Person ID: ${q.contact_person_id || 'NULL'}`);
});

// Check if customer_contacts table exists
console.log('\nChecking customer_contacts table:');
const contacts = db.prepare(`
  SELECT COUNT(*) as count FROM customer_contacts
`).get();
console.log(`  Total contacts: ${contacts.count}`);

if (contacts.count > 0) {
  const sampleContacts = db.prepare(`
    SELECT id, customer_id, name, is_primary 
    FROM customer_contacts 
    LIMIT 3
  `).all();
  
  console.log('  Sample contacts:');
  sampleContacts.forEach(c => {
    console.log(`    ID: ${c.id}, Customer: ${c.customer_id}, Name: ${c.name}, Primary: ${c.is_primary ? 'YES' : 'NO'}`);
  });
}

db.close();
console.log('\n=== Check Complete ===\n');
