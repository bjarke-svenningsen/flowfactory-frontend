import Database from 'better-sqlite3';
const db = new Database('breeze.db');

console.log('Testing invoices query...\n');

try {
  // Test if invoices table exists
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='invoices'").all();
  console.log('Invoices table exists:', tables.length > 0);
  
  if (tables.length > 0) {
    // Check table structure
    const columns = db.prepare("PRAGMA table_info(invoices)").all();
    console.log('\nInvoices table columns:');
    columns.forEach(col => console.log(`  - ${col.name} (${col.type})`));
  }
  
  // Try the actual query from server.js
  console.log('\nTrying actual query...');
  const invoices = db.prepare(`
    SELECT i.*, q.order_number, q.title as order_title, 
           c.company_name as customer_name, u.name as created_by_name
    FROM invoices i
    JOIN quotes q ON i.order_id = q.id
    JOIN customers c ON q.customer_id = c.id
    JOIN users u ON i.created_by = u.id
    ORDER BY i.id DESC
  `).all();
  
  console.log('SUCCESS! Found', invoices.length, 'invoices');
  if (invoices.length > 0) {
    console.log('\nFirst invoice:');
    console.log(invoices[0]);
  }
  
} catch (error) {
  console.error('\nERROR:', error.message);
  console.error('Stack:', error.stack);
}

db.close();
