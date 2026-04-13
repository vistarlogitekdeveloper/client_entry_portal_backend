const pool = require('../config/db');
const userService = require('../modules/user/user.service');
const { sendMulticastNotification } = require('../utils/notification.utils');
const { sendEmail } = require('../utils/email.utils');

/**
 * Finds documents expiring in exactly 30, 15, 7, and 1 day(s).
 */
const findExpiringDocuments = async () => {
  const query = `
    SELECT 'AGREEMENT' AS doc_type, id, agreement_name AS name, expiry_date
    FROM ho_agreements
    WHERE status = 'ACTIVE' 
      AND expiry_date IN (CURRENT_DATE + 30, CURRENT_DATE + 15, CURRENT_DATE + 7, CURRENT_DATE + 1)
    
    UNION ALL
    
    SELECT 'COST_SHEET' AS doc_type, id, sheet_name AS name, expiry_date
    FROM ho_cost_sheets
    WHERE status = 'ACTIVE'
      AND expiry_date IN (CURRENT_DATE + 30, CURRENT_DATE + 15, CURRENT_DATE + 7, CURRENT_DATE + 1);
  `;
  const result = await pool.query(query);
  return result.rows;
};

/**
 * Sends notifications to all Head Office users and logs them.
 */
const processNotifications = async (documents) => {
  if (documents.length === 0) return;

  const tokens = await userService.getHeadOfficeTokens();
  if (tokens.length === 0) {
    console.log('[ho-expiry] No Head Office users with FCM tokens found.');
    return;
  }

  // Get all Head Office user IDs to log notifications
  const hoUsers = await pool.query("SELECT id FROM users WHERE role = 'HEAD OFFICE'");
  const hoUserIds = hoUsers.rows.map(u => u.id);

  // Get emails for email notifications
  const emails = await userService.getHeadOfficeEmails();

  for (const doc of documents) {
    const title = `Expiry Alert: ${doc.doc_type}`;
    const message = `The ${doc.doc_type.toLowerCase()} "${doc.name}" will expire on ${doc.expiry_date.toISOString().split('T')[0]}.`;
    
    // Send Push Notifications
    try {
      if (tokens.length > 0) {
        await sendMulticastNotification(tokens, title, message, {
          type: `HO_${doc.doc_type}_EXPIRY`,
          doc_id: doc.id,
          expiry_date: doc.expiry_date.toISOString().split('T')[0]
        });
      }

      // Send Email Notifications
      if (emails.length > 0) {
        await sendEmail(emails, title, message);
      }

      // Log success for each HO user
      for (const userId of hoUserIds) {
        await pool.query(
          `INSERT INTO ho_notifications (agreement_id, cost_sheet_id, notified_user_id, message, status, sent_at)
           VALUES ($1, $2, $3, $4, 'SENT', CURRENT_TIMESTAMP)`,
          [doc.doc_type === 'AGREEMENT' ? doc.id : null, doc.doc_type === 'COST_SHEET' ? doc.id : null, userId, message]
        );
      }
    } catch (err) {
      console.error(`[ho-expiry] Failed to send notification for ${doc.name}:`, err.message);
      // Log failure for retry
      for (const userId of hoUserIds) {
        await pool.query(
          `INSERT INTO ho_notifications (agreement_id, cost_sheet_id, notified_user_id, message, status, retry_count, next_retry_at)
           VALUES ($1, $2, $3, $4, 'PENDING_RETRY', 0, CURRENT_TIMESTAMP + INTERVAL '1 hour')`,
          [doc.doc_type === 'AGREEMENT' ? doc.id : null, doc.doc_type === 'COST_SHEET' ? doc.id : null, userId, message]
        );
      }
    }
  }
};

/**
 * Retries failed notifications.
 */
const retryFailedNotifications = async () => {
  const query = `
    SELECT n.*, u.fcm_token
    FROM ho_notifications n
    JOIN users u ON n.notified_user_id = u.id
    WHERE n.status = 'PENDING_RETRY' 
      AND n.retry_count < 3
      AND (n.next_retry_at <= CURRENT_TIMESTAMP OR n.next_retry_at IS NULL)
  `;
  const result = await pool.query(query);
  const failedNotes = result.rows;

  for (const note of failedNotes) {
    if (!note.fcm_token) continue;

    try {
      await sendMulticastNotification([note.fcm_token], 'Retry: Expiry Alert', note.message);
      
      await pool.query(
        `UPDATE ho_notifications SET status = 'SENT', sent_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [note.id]
      );
    } catch (err) {
      const nextRetry = new Date();
      nextRetry.setHours(nextRetry.getHours() + Math.pow(2, note.retry_count + 1)); // Exponential backoff

      await pool.query(
        `UPDATE ho_notifications 
         SET retry_count = retry_count + 1, 
             next_retry_at = $1,
             status = $2
         WHERE id = $3`,
        [nextRetry, note.retry_count + 1 >= 3 ? 'FAILED' : 'PENDING_RETRY', note.id]
      );
    }
  }
};

const runHODocumentExpiryJob = async () => {
  console.log('[ho-expiry] Running daily expiry check...');
  const documents = await findExpiringDocuments();
  await processNotifications(documents);
  console.log(`[ho-expiry] Processed ${documents.length} expiring documents.`);
};

const startHOScheduler = () => {
  // Run daily at midnight for expiry checks
  cron.schedule('0 0 * * *', runHODocumentExpiryJob);

  // Run every hour for retries
  cron.schedule('0 * * * *', async () => {
    console.log('[ho-expiry] Checking for failed notifications to retry...');
    await retryFailedNotifications();
  });

  console.log('[ho-expiry] Head Office scheduler started (Daily at 00:00, Retries hourly)');
};

module.exports = {
  startHOScheduler,
  runHODocumentExpiryJob,
  retryFailedNotifications
};
