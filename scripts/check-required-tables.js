require('dotenv').config();
const { Client } = require('pg');

async function run() {
  const client = new Client({
    connectionString: process.env.SUPABASE_DB_URL || process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  const requiredTables = [
    'lead_reviews',
    'lead_review_reminders',
    'lead_change_events',
    'lead_change_event_fields',
    'tasks'
  ];

  await client.connect();
  try {
    for (const tableName of requiredTables) {
      const result = await client.query('SELECT to_regclass($1) AS table_ref', [`public.${tableName}`]);
      console.log(`${tableName}: ${result.rows[0].table_ref ? 'EXISTS' : 'MISSING'}`);
    }
  } finally {
    await client.end();
  }
}

run().catch((error) => {
  console.error(`CHECK_TABLES_FAIL: ${error.message}`);
  process.exit(1);
});
