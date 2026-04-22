require('dotenv').config();
const leadService = require('../src/modules/lead/lead.service');
const pool = require('../src/config/db');

async function triggerTestLead() {
  console.log('🚀 Triggering a test lead creation to verify emails...');

  try {
    // 1. Find a valid user to act as the "Creator"
    const userRes = await pool.query("SELECT id, name, role FROM users WHERE email = 'Flutter.developer@vistarlogitek.com' LIMIT 1");
    const testUser = userRes.rows[0];

    if (!testUser) {
      console.error('❌ Could not find the test user in DB.');
      return;
    }

    console.log(`👤 Acting as user: ${testUser.name} (${testUser.role})`);

    const testLeadData = {
      company_name: "TEST NOTIFICATION CORP",
      contact_person: "MR. TESTER",
      email: "test@example.com",
      mobile: "1234567890",
      region: "NORTH",
      city: "DELHI",
      business_scope: "TESTING NOTIFICATIONS",
      lead_received_date: new Date().toISOString().split('T')[0]
    };

    // 2. Call the real service method
    const lead = await leadService.createLead(testLeadData, { id: testUser.id, role: testUser.role });
    
    console.log('✅ Lead created successfully in DB!');
    console.log('📧 The email should be arriving in your inbox now.');
    console.log(`Lead ID: ${lead.id}`);

  } catch (err) {
    console.error('❌ Failed to trigger test lead:', err.message);
  } finally {
    process.exit();
  }
}

triggerTestLead();
