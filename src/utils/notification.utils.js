const { messaging } = require('../config/firebase');

/**
 * Sends a push notification to a specific device.
 * @param {string} token - The FCM registration token of the device.
 * @param {string} title - The title of the notification.
 * @param {string} body - The body text of the notification.
 * @param {Object} data - Additional data to send (optional).
 */
async function sendPushNotification(token, title, body, data = {}) {
  if (!token) return;

  // Ensure all data values are strings for FCM
  const stringData = {};
  Object.keys(data).forEach(key => {
    stringData[key] = String(data[key]);
  });

  // Add standard click action for Flutter
  stringData.click_action = 'FLUTTER_NOTIFICATION_CLICK';

  const message = {
    notification: {
      title,
      body,
    },
    data: stringData,
    token,
  };

  try {
    const response = await messaging.send(message);
    console.log('Successfully sent message:', response);
    return response;
  } catch (error) {
    console.error('Error sending message:', error);
    // If token is invalid/expired, we should probably remove it from the database
    if (error.code === 'messaging/registration-token-not-registered') {
      console.warn('Token is no longer valid. Should be removed from DB.');
    }
    throw error;
  }
}

/**
 * Sends a push notification to multiple devices.
 * @param {string[]} tokens - Array of FCM registration tokens.
 * @param {string} title - The title of the notification.
 * @param {string} body - The body text of the notification.
 * @param {Object} data - Additional data to send (optional).
 */
async function sendMulticastNotification(tokens, title, body, data = {}) {
  const validTokens = tokens.filter(t => t && t.trim() !== '');
  if (validTokens.length === 0) return;

  // Ensure all data values are strings for FCM
  const stringData = {};
  Object.keys(data).forEach(key => {
    stringData[key] = String(data[key]);
  });

  // Add standard click action for Flutter
  stringData.click_action = 'FLUTTER_NOTIFICATION_CLICK';

  const message = {
    notification: {
      title,
      body,
    },
    data: stringData,
    tokens: validTokens,
  };

  try {
    const response = await messaging.sendEachForMulticast(message);
    console.log(`${response.successCount} messages were sent successfully`);
    return response;
  } catch (error) {
    console.error('Error sending multicast message:', error);
    throw error;
  }
}

module.exports = {
  sendPushNotification,
  sendMulticastNotification,
};
