// Move documents from wrong order (id=5) to correct order (id=1)
import 'dotenv/config';
import { db } from './database-config.js';

async function moveDocuments() {
  try {
    console.log('🔍 Checking documents...');
    
    // Check current state
    const allDocs = await db.all('SELECT * FROM order_documents');
    console.log('📄 All documents:', allDocs);
    
    // Move documents from order 5 to order 1
    const result = await db.run('UPDATE order_documents SET order_id = 1 WHERE order_id = 5');
    console.log('✅ Moved documents from order 5 to order 1');
    console.log('   Rows affected:', result.changes);
    
    // Verify
    const docsForOrder1 = await db.all('SELECT * FROM order_documents WHERE order_id = 1');
    console.log('📄 Documents now in order 1:', docsForOrder1);
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

moveDocuments();
