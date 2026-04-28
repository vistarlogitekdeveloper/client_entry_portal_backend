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

pool.connect()
  .then(() => console.log('✅ PostgreSQL Connected'))
  .catch(err => console.error('❌ DB Connection Error:', err));

module.exports = pool;