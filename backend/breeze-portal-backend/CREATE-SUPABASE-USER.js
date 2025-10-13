// CREATE-SUPABASE-USER.js - Create admin user directly in Supabase
import pg from 'pg';
import bcrypt from 'bcryptjs';

const { Pool } = pg;

console.log('🔐 Creating admin user in Supabase...\n');

async function createUser() {
  const pool = new Pool({
    connectionString: 'postgresql://postgres.sggdtvbkvcuufurssklb:Olineersej123@aws-1-eu-west-1.pooler.supabase.com:6543/postgres',
    ssl: { rejectUnauthorized: false }
  });

  try {
    // First, let's check what columns exist in the users table
    console.log('📋 Checking users table structure...');
    const columnsResult = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'users' 
      ORDER BY ordinal_position
    `);
    
    console.log('Available columns:');
    columnsResult.rows.forEach(col => {
      console.log(`  - ${col.column_name} (${col.data_type})`);
    });
    
    // Create password hash
    const passwordHash = bcrypt.hashSync('Olineersej123', 10);
    
    // Try to insert user with the correct columns from Supabase
    console.log('\n🔧 Creating user...');
    
    try {
      // Try with is_admin instead of is_approved
      const result = await pool.query(
        'INSERT INTO users (name, email, password_hash, is_admin) VALUES ($1, $2, $3, $4) RETURNING *',
        ['Bjarke Admin', 'admin@flowfactory.dk', passwordHash, 1]
      );
      
      console.log('✅ User created successfully!');
      console.log('\n📋 User details:');
      console.log('  Name:', result.rows[0].name);
      console.log('  Email:', result.rows[0].email);
      console.log('  ID:', result.rows[0].id);
      console.log('\n🎉 You can now login at: https://flowfactory-denmark.netlify.app');
      console.log('  Email: admin@flowfactory.dk');
      console.log('  Password: Olineersej123\n');
      
    } catch (insertError) {
      console.log('❌ Failed to insert user:', insertError.message);
      console.log('\n💡 Trying with encrypted_password column...');
      
      // Try with 'encrypted_password' (Supabase auth column)
      try {
        const result = await pool.query(
          'INSERT INTO users (name, email, encrypted_password, is_admin) VALUES ($1, $2, $3, $4) RETURNING *',
          ['Bjarke Admin', 'admin@flowfactory.dk', passwordHash, 1]
        );
        
        console.log('✅ User created successfully with encrypted_password!');
        console.log('\n📋 User details:');
        console.log('  Name:', result.rows[0].name);
        console.log('  Email:', result.rows[0].email);
        console.log('  ID:', result.rows[0].id);
        console.log('\n🎉 You can now login at: https://flowfactory-denmark.netlify.app');
        console.log('  Email: admin@flowfactory.dk');
        console.log('  Password: Olineersej123\n');
        
      } catch (altError) {
        console.log('❌ That didn\'t work either:', altError.message);
        console.log('\n� Last attempt - minimal columns only...');
        
        // Try with absolute minimum - just name and email
        try {
          const result = await pool.query(
            'INSERT INTO users (name, email) VALUES ($1, $2) RETURNING *',
            ['Bjarke Admin', 'admin@flowfactory.dk']
          );
          
          console.log('✅ User created with minimal columns!');
          console.log('⚠️  WARNING: User created without password! You\'ll need to set password manually.');
          console.log('\n📋 User details:');
          console.log('  Name:', result.rows[0].name);
          console.log('  Email:', result.rows[0].email);
          console.log('  ID:', result.rows[0].id);
          
        } catch (minError) {
          console.log('❌ Even minimal insert failed:', minError.message);
          console.log('\n🔍 This is very unusual. The table structure might be locked or have required fields.');
          console.log('Please share this error with me!');
        }
      }
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await pool.end();
  }
}

createUser();
