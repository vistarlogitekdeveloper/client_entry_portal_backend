const pool = require('./db');

const addStatusReasons = async () => {
  let client;
  try {
    client = await pool.connect();
    console.log('🚀 Starting status reasons migration...');

    await client.query('BEGIN');

    const columns = [
      'commercial_status_reason',
      'final_status_reason',
      'progress_status_reason',
      'study_status_reason'
    ];

    for (const col of columns) {
      await client.query(`ALTER TABLE lead_master ADD COLUMN IF NOT EXISTS ${col} TEXT`);
      console.log(`✅ Column ${col} added`);
    }

    await client.query('COMMIT');
    console.log('🎉 Migration complete!');
  } catch (err) {
    if (client) await client.query('ROLLBACK');
    console.error('❌ Migration failed:', err.message);
  } finally {
    if (client) client.release();
    process.exit();
  }
};

addStatusReasons();
