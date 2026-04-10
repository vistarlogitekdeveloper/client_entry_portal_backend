const { messaging } = require('./config/firebase');
const pool = require('./config/db');

async function testToken() {
  try {
    const admin = await pool.query("SELECT fcm_token FROM users WHERE name = 'Admin1'");
    const token = admin.rows[0].fcm_token;
    
    if (!token) {
      console.error('❌ Admin1 has no token in DB.');
      process.exit(1);
    }
    
    console.log('--- FCM TOKEN TEST ---');
    console.log('Target Token:', token);
    
    const message = {
      notification: {
        title: 'Direct Test Connection',
        body: 'If you see this, the notification system is working perfectly!'
      },
      token: token
    };

    const response = await messaging.send(message);
    console.log('✅ Successfully sent message:', response);
    process.exit(0);
  } catch (err) {
    console.error('❌ FCM Error:', err.message);
    if (err.code) console.error('Error Code:', err.code);
    process.exit(1);
  }
}

testToken();
