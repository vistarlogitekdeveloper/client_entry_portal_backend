const admin = require('firebase-admin');
const path = require('path');

// NOTE: You must place your firebase-service-account.json in this directory
const serviceAccountPath = path.join(__dirname, 'cliententryapp-firebase-adminsdk-fbsvc-7ee89ae757.json');

try {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccountPath),
  });
  console.log('Firebase Admin initialized successfully');
} catch (error) {
  console.error('Firebase Admin initialization failed:', error.message);
  console.error('Make sure src/config/firebase-service-account.json exists');
}

module.exports = {
  messaging: admin.messaging(),
};
