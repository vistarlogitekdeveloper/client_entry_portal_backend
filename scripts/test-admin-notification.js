require('dotenv').config();
const { sendMulticastNotification } = require('../src/utils/notification.utils');
const userService = require('../src/modules/user/user.service');

async function testNotification() {
  console.log('🧪 Starting manual push notification test for ADMINs...');

  try {
    const adminTokens = await userService.getAdminManagerTokens();
    
    if (adminTokens.length === 0) {
      console.log('⚠️ No active FCM tokens found for ADMIN/MANAGER users in the database.');
      console.log('Please ensure you are logged in on the mobile app with an ADMIN or MANAGER account.');
    } else {
      console.log(`📡 Found ${adminTokens.length} active tokens. Sending notification...`);
      
      const result = await sendMulticastNotification(
        adminTokens,
        'Admin Test Notification',
        'This is a manual test notification from the backend to verify FCM connectivity.',
        { type: 'TEST', timestamp: new Date().toISOString() }
      );

      console.log('✅ Notification process complete.');
      console.log(`Success count: ${result.successCount}`);
      console.log(`Failure count: ${result.failureCount}`);
    }
  } catch (err) {
    console.error('❌ Failed to send test notification:');
    console.error(err);
  } finally {
    process.exit();
  }
}

testNotification();
