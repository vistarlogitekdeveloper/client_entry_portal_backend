require('dotenv').config();
const pool = require('./src/config/db');
const leadService = require('./src/modules/lead/lead.service');

async function testWithValidUser() {
  try {
    const userRes = await pool.query("SELECT id, name, role FROM users WHERE role = 'ADMIN' LIMIT 1");
    if (userRes.rows.length === 0) {
      console.log('No Admin user found in database to test with.');
      return;
    }
    const admin = userRes.rows[0];
    console.log(`Testing with Admin: ${admin.name} (${admin.id})`);

    const testLeadData = {
      company_name: 'RELIANCE LOGISTICS TEST',
      contact_person: 'Mukesh Ambani',
      email: 'mukesh@rworld.com',
      mobile: '9999999999',
      region: 'WEST',
      city: 'MUMBAI',
      business_scope: 'RETAIL LOGISTICS',
      status: 'ACTIVE',
      priority: 'HIGH'
    };

    const lead = await leadService.createLead(testLeadData, admin);
    console.log(`✅ Lead created successfully with ID: ${lead.id}`);
    console.log('Notification email should have been sent to Admins and CC-ed to creator.');
  } catch (err) {
    console.error('❌ Test failed:', err.message);
  } finally {
    process.exit();
  }
}

testWithValidUser();
