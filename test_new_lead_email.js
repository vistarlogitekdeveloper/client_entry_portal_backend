require('dotenv').config();
const path = require('path');
const leadService = require('./src/modules/lead/lead.service');

async function testNewLeadNotification() {
  console.log('Testing real-time new lead email notification...');
  
  // Mock data for a new lead
  const testLeadData = {
    company_name: 'TEST NOTIFICATION CORP',
    contact_person: 'John Doe',
    email: 'test@example.com',
    mobile: '9876543210',
    region: 'NORTH',
    city: 'PUNE',
    business_scope: 'LOGISTICS AUTOMATION',
    status: 'ACTIVE',
    priority: 'HIGH'
  };

  // Mock actor (ADMIN user)
  const mockActor = {
    id: 'f9d98344-935f-4d92-bf3e-6029199d2551', // Replace with a valid Admin UUID if possible, or any valid user ID
    role: 'ADMIN'
  };

  try {
    console.log('Creating test lead...');
    const lead = await leadService.createLead(testLeadData, mockActor);
    console.log(`✅ Lead created with ID: ${lead.id}`);
    console.log('Check logs to verify if email was sent.');
  } catch (err) {
    console.error('❌ Test failed:', err.message);
  }
}

testNewLeadNotification().catch(console.error);
