const pool = require('../src/config/db');

async function migrate() {
  console.log('Starting migration: adding fcm_token to users table...');
  try {
    await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS fcm_token TEXT;');
    console.log('✅ Migration successful: fcm_token column is ready.');
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
  } finally {
    process.exit();
  }
}

migrate();
