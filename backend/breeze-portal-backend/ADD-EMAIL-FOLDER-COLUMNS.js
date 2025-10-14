// ADD-EMAIL-FOLDER-COLUMNS.js - Migration to add folder_id to emails and sort_order to email_folders
import { db } from './database-config.js';

async function migrate() {
  console.log('🔧 Running migration: Add folder_id and sort_order columns...');
  
  try {
    // Add folder_id column to emails table if it doesn't exist
    try {
      await db.run(`ALTER TABLE emails ADD COLUMN folder_id INTEGER`);
      console.log('✅ Added folder_id column to emails table');
    } catch (error) {
      if (error.message.includes('duplicate column') || error.message.includes('already exists')) {
        console.log('ℹ️  folder_id column already exists in emails table');
      } else {
        throw error;
      }
    }
    
    // Add sort_order column to email_folders table if it doesn't exist
    try {
      await db.run(`ALTER TABLE email_folders ADD COLUMN sort_order INTEGER DEFAULT 0`);
      console.log('✅ Added sort_order column to email_folders table');
    } catch (error) {
      if (error.message.includes('duplicate column') || error.message.includes('already exists')) {
        console.log('ℹ️  sort_order column already exists in email_folders table');
      } else {
        throw error;
      }
    }
    
    console.log('✅ Migration completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

migrate();
