require('dotenv').config();
const userService = require('../src/modules/user/user.service');

async function debugRecipients() {
  console.log('🧪 Debugging Email Recipient Logic...');
  
  try {
    const admins = await userService.getAdminEmails();
    console.log('Found ADMIN emails in DB:', admins);
    
    if (admins.length === 0) {
      console.log('❌ NO ADMINS FOUND! This is why emails were not sending.');
    } else {
      console.log('✅ ADMINS FOUND. Emails should be sent to these addresses.');
    }
    
    // Check for a specific user to see if findOne works
    // (Using a random ID or just checking the first user)
    const allUsers = await userService.getAllUsersAdmin();
    if (allUsers.length > 0) {
      const firstUser = allUsers[0];
      const found = await userService.findOne(firstUser.id);
      console.log(`Checking findOne for ${firstUser.name}:`, found ? '✅ Found' : '❌ Not Found');
    }

  } catch (err) {
    console.error('❌ Error during debug:', err.message);
  } finally {
    process.exit();
  }
}

debugRecipients();
