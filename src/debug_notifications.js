const pool = require('./config/db');

async function debug() {
  try {
    console.log('--- DEBUG START ---');
    
    // Check Leads
    const leads = await pool.query('SELECT id, company_name, created_at FROM lead_master ORDER BY created_at DESC LIMIT 5');
    console.log('Last 5 Leads:');
    console.table(leads.rows);
    
    // Check Admins
    const admins = await pool.query("SELECT id, name, role, fcm_token FROM users WHERE role IN ('ADMIN', 'MANAGER')");
    console.log('\nAdmins and Tokens:');
    console.table(admins.rows);
    
    // Check if any admin has a token starting with "dummy" (from my previous test)
    const dummyCheck = admins.rows.find(a => a.fcm_token && a.fcm_token.startsWith('dummy'));
    if (dummyCheck) {
      console.log('\n⚠️ WARNING: An admin still has a "dummy_test_token". They MUST log in via the app to get a real token.');
    }
    
    console.log('--- DEBUG END ---');
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

debug();
