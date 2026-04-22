const pool = require('./db');

const migratePlanning = async () => {
  let client;
  try {
    client = await pool.connect();
    console.log('🚀 Starting planning migration...');

    await client.query('BEGIN');

    // 1. Create lead_planning table
    await client.query(`
      CREATE TABLE IF NOT EXISTS lead_planning (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        lead_id UUID NOT NULL REFERENCES lead_master(id) ON DELETE CASCADE,
        week_start_date DATE NOT NULL,
        plan_content TEXT NOT NULL,
        created_by UUID REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (lead_id, week_start_date)
      );
    `);
    console.log('✅ lead_planning table created');

    // 2. Check if next_week_plan column exists in lead_reviews
    const checkCol = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'lead_reviews' AND column_name = 'next_week_plan'
    `);

    if (checkCol.rows.length > 0) {
      console.log('📦 Found next_week_plan column, migrating data...');
      const existingData = await client.query(`
        SELECT lead_id, week_start_date, next_week_plan, created_by 
        FROM lead_reviews 
        WHERE next_week_plan IS NOT NULL AND next_week_plan != ''
      `);

      for (const row of existingData.rows) {
        await client.query(`
          INSERT INTO lead_planning (lead_id, week_start_date, plan_content, created_by)
          VALUES ($1, $2, $3, $4)
          ON CONFLICT (lead_id, week_start_date) DO NOTHING
        `, [row.lead_id, row.week_start_date, row.next_week_plan, row.created_by]);
      }
      console.log(`✅ Migrated ${existingData.rows.length} records to lead_planning`);
      
      // Optional: Drop column if you want to be clean
      // await client.query('ALTER TABLE lead_reviews DROP COLUMN IF EXISTS next_week_plan');
    } else {
      console.log('ℹ️ next_week_plan column not found in lead_reviews, skipping data migration.');
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

migratePlanning();
