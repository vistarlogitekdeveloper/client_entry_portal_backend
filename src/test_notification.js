const pool = require('./config/db');
const leadService = require('./modules/lead/lead.service');
const { runWeeklyReminderJob } = require('./jobs/weekly-reminder.job');

async function testAll() {
  try {
    console.log('--- COMPREHENSIVE NOTIFICATION TEST START ---');
    
    // 1. Setup Tokens
    const adminId = '4865fa72-b935-44e5-a0d1-5ee2d7188f84';
    const userId = 'efa04462-078a-4348-be4d-75fec24a03dd'; // User1
    
    console.log('Setting dummy tokens...');
    await pool.query('UPDATE users SET fcm_token = $1 WHERE id = $2', ['admin_test_token', adminId]);
    await pool.query('UPDATE users SET fcm_token = $1 WHERE id = $2', ['user_test_token', userId]);
    
    const actor = { id: userId, name: 'User1', role: 'BD' };

    // --- TEST 1: Lead Creation ---
    console.log('\n[1/3] Testing Lead Creation...');
    const leadData = {
      company_name: 'Ultimate Test Corp',
      contact_person: 'Jane Tester',
      email: 'jane@test.com',
      mobile: '1234567890',
      city: 'Delhi',
      region: 'NORTH',
      business_scope: 'Checking creation notifications',
      owner: adminId // Assign to Admin1
    };
    const lead = await leadService.createLead(leadData, actor);
    console.log('✅ Created Lead ID:', lead.id);

    // --- TEST 2: Status Change ---
    console.log('\n[2/3] Testing Status Change...');
    // We update the status to trigger the notification
    const updatedLead = await leadService.updateLead(lead.id, { status: 'INACTIVE' }, actor);
    console.log('✅ Updated Lead Status to:', updatedLead.status);

    // --- TEST 3: Weekly Reminder Job ---
    console.log('\n[3/3] Testing Weekly Reminder Job Execution...');
    // The job identifies leads without reviews for the week.
    // Our new lead doesn't have a review yet, so it should be picked up.
    const jobResult = await runWeeklyReminderJob();
    console.log('✅ Job Result:', jobResult);

    console.log('\n--- ALL TESTS COMPLETED ---');
    process.exit(0);
  } catch (err) {
    console.error('❌ Error during comprehensive test:', err);
    process.exit(1);
  }
}

testAll();
