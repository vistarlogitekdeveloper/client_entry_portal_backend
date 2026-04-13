const pool = require('./config/db');
const initDb = require('./config/initDb');
const { runHODocumentExpiryJob } = require('./jobs/ho-expiry-reminder.job');

async function verify() {
  try {
    console.log('--- HO MODULE VERIFICATION START ---');
    
    // Initialize DB tables
    await initDb();

    // 1. Setup dummy HO user if not exists
    const userCheck = await pool.query("SELECT id FROM users WHERE role = 'HEAD OFFICE' LIMIT 1");
    let userId;
    if (userCheck.rows.length === 0) {
      console.log('Creating dummy Head Office user...');
      const res = await pool.query(`
        INSERT INTO users (name, email, password, role, fcm_token)
        VALUES ('HO Test', 'ho@test.com', 'nopass', 'HEAD OFFICE', 'dummy_token')
        RETURNING id
      `);
      userId = res.rows[0].id;
    } else {
      userId = userCheck.rows[0].id;
    }

    // 2. Insert dummy agreements
    console.log('Inserting dummy agreements and cost sheets...');
    const now = new Date();
    const exp7 = new Date(now); exp7.setDate(now.getDate() + 7);
    const exp30 = new Date(now); exp30.setDate(now.getDate() + 30);

    const agRes = await pool.query(`
      INSERT INTO ho_agreements (agreement_name, expiry_date, status, created_by)
      VALUES 
        ('Test Agreement 7 Days', $1, 'ACTIVE', $3),
        ('Test Agreement 30 Days', $2, 'ACTIVE', $3)
      RETURNING id, agreement_name, expiry_date
    `, [exp7, exp30, userId]);
    
    console.table(agRes.rows);

    const csRes = await pool.query(`
      INSERT INTO ho_cost_sheets (sheet_name, expiry_date, status, created_by)
      VALUES 
        ('Test Cost Sheet 7 Days', $1, 'ACTIVE', $2)
      RETURNING id, sheet_name, expiry_date
    `, [exp7, userId]);
    
    console.table(csRes.rows);

    // 3. Run the Job
    console.log('\nRunning expiry reminder job...');
    await runHODocumentExpiryJob();

    // 4. Verify Notifications table
    const notes = await pool.query(`
      SELECT n.status, n.message, n.retry_count, a.agreement_name, cs.sheet_name
      FROM ho_notifications n
      LEFT JOIN ho_agreements a ON n.agreement_id = a.id
      LEFT JOIN ho_cost_sheets cs ON n.cost_sheet_id = cs.id
      ORDER BY n.scheduled_at DESC
      LIMIT 10
    `);

    console.log('\nNotification Logs:');
    console.table(notes.rows);

    console.log('\n--- HO MODULE VERIFICATION END ---');
    process.exit(0);
  } catch (err) {
    console.error('Verification failed:', err);
    process.exit(1);
  }
}

verify();
