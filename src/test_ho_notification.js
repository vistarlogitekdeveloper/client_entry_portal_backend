const { messaging } = require('./config/firebase');
const pool = require('./config/db');

async function testHeadOfficeNotification() {
  try {
    // Look up users with the role 'HEADOFFICE' that have an FCM token
    const result = await pool.query("SELECT id, name, fcm_token FROM users WHERE role = 'HEAD OFFICE' AND fcm_token IS NOT NULL");
    
    if (result.rows.length === 0) {
      console.error('❌ No HeadOffice users found with a registered FCM token.');
      process.exit(1);
    }
    
    console.log(`Found ${result.rows.length} HeadOffice users with FCM tokens.`);
    
    for (const user of result.rows) {
      const token = user.fcm_token;
      console.log(`Sending notification to ${user.name} (ID: ${user.id})...`);
      
      const message = {
        notification: {
          title: 'Head Office Test Notification',
          body: 'This is a test notification for the head office role.'
        },
        token: token
      };

      try {
        const response = await messaging.send(message);
        console.log(`✅ Successfully sent to ${user.name}:`, response);
      } catch (sendErr) {
        console.error(`❌ Failed to send to ${user.name}:`, sendErr.message);
      }
    }
    
    process.exit(0);
  } catch (err) {
    console.error('❌ Error testing HeadOffice notification:', err.message);
    process.exit(1);
  }
}

testHeadOfficeNotification();
