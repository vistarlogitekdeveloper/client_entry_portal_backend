/**
 * Migration runner: adds reminder_snooze_until column to lead_master.
 * Run with: node run-migration.js
 */
require('dotenv').config();
const { Pool } = require('pg');

const connectionString = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('Missing database connection string. Set SUPABASE_DB_URL or DATABASE_URL.');
}

const useSSL = String(process.env.DB_SSL || 'true').toLowerCase() !== 'false';

const pool = new Pool({
  connectionString,
  ssl: useSSL ? { rejectUnauthorized: false } : false
});

const migration = `
  ALTER TABLE lead_master
    ADD COLUMN IF NOT EXISTS reminder_snooze_until DATE NULL;

  COMMENT ON COLUMN lead_master.reminder_snooze_until IS
    'Date until which weekly review reminders are snoozed. NULL = no snooze active.';
`;

(async () => {
  const client = await pool.connect();
  try {
    console.log('Running migration: add reminder_snooze_until to lead_master...');
    await client.query(migration);
    console.log('✅ Migration applied successfully.');
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
})();
