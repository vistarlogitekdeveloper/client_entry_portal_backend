const cron = require('node-cron');
const pool = require('../config/db');
const path = require('path');
const userService = require('../modules/user/user.service');
const { sendMulticastNotification } = require('../utils/notification.utils');
const { sendEmail } = require('../utils/email.utils');

/**
 * Finds documents expiring in exactly 30, 15, 7, and 1 day(s).
 */
const findExpiringDocuments = async () => {
  const query = `
    SELECT 'AGREEMENT' AS doc_type, a.id, a.agreement_name AS name, a.expiry_date, u.email AS creator_email
    FROM ho_agreements a
    LEFT JOIN users u ON a.created_by = u.id
    WHERE a.status = 'ACTIVE' 
      AND a.expiry_date IN (CURRENT_DATE + 30, CURRENT_DATE + 15, CURRENT_DATE + 7, CURRENT_DATE + 1)
    
    UNION ALL
    
    SELECT 'COST_SHEET' AS doc_type, cs.id, cs.sheet_name AS name, cs.expiry_date, u.email AS creator_email
    FROM ho_cost_sheets cs
    LEFT JOIN users u ON cs.created_by = u.id
    WHERE cs.status = 'ACTIVE'
      AND cs.expiry_date IN (CURRENT_DATE + 30, CURRENT_DATE + 15, CURRENT_DATE + 7, CURRENT_DATE + 1)

    UNION ALL
    
    SELECT 'CERTIFICATION' AS doc_type, cert.id, cert.certification_name AS name, cert.expiry_date, u.email AS creator_email
    FROM ho_certifications cert
    LEFT JOIN users u ON cert.created_by = u.id
    WHERE cert.status = 'ACTIVE'
      AND cert.expiry_date IN (CURRENT_DATE + 30, CURRENT_DATE + 15, CURRENT_DATE + 7, CURRENT_DATE + 1);
  `;
  const result = await pool.query(query);
  return result.rows;
};

/**
 * Generates a professional HTML template for the expiry email.
 */
const generateHOExpiryEmailHtml = (doc) => {
  const expiryDateStr = doc.expiry_date.toISOString().split('T')[0];
  const today = new Date();
  const diffDays = Math.ceil((doc.expiry_date - today) / (1000 * 60 * 60 * 24));

  // Decide color based on urgency
  const isCritical = diffDays <= 7;
  const themeColor = isCritical ? '#D32F2F' : '#F57C00'; // Red for critical, Orange for warning
  const urgencyText = isCritical ? 'CRITICAL ALERT' : 'EXPIRY WARNING';

  // LOGO CID - We use the local logo from assets/logo.png
  const logoUrl = 'cid:logo';

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
        .container { max-width: 600px; margin: 20px auto; border: 1px solid #eee; border-top: 8px solid ${themeColor}; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 10px rgba(0,0,0,0.05); }
        .header { background-color: #f8f8f8; padding: 25px; text-align: center; border-bottom: 1px solid #eee; }
        .logo { max-height: 60px; margin-bottom: 10px; }
        .content { padding: 30px; }
        .alert-badge { display: inline-block; padding: 6px 15px; background-color: ${themeColor}; color: white; font-weight: bold; border-radius: 20px; font-size: 12px; margin-bottom: 20px; text-transform: uppercase; letter-spacing: 1px; }
        h2 { margin-top: 0; color: #2c3e50; font-size: 22px; }
        .details-table { width: 100%; border-collapse: collapse; margin-top: 20px; background-color: #fafafa; border-radius: 6px; }
        .details-table td { padding: 12px 15px; border-bottom: 1px solid #eee; }
        .label { font-weight: bold; color: #666; width: 40%; }
        .value { color: #222; font-weight: 500; }
        .footer { background-color: #f8f8f8; padding: 20px; text-align: center; font-size: 12px; color: #888; border-top: 1px solid #eee; }
        .btn { display: inline-block; padding: 12px 25px; background-color: #2E4057; color: white !important; text-decoration: none; border-radius: 5px; font-weight: bold; margin-top: 25px; font-size: 14px; }
        .expiry-highlight { color: ${themeColor}; font-weight: bold; font-size: 18px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <!-- Vistar Logitek Logo -->
          <img src="${logoUrl}" alt="Vistar Logitek" class="logo" onerror="this.src='https://via.placeholder.com/200x60?text=Vistar+Logitek'">
          <div style="font-size: 14px; color: #666; font-weight: 600;">Document Expiry Alert</div>
        </div>
        <div class="content">
          <div class="alert-badge">${urgencyText}</div>
          <h2>Document Expiry Notification</h2>
          <p>This is an automated reminder that a <strong>${doc.doc_type.replace('_', ' ')}</strong> is approaching its expiration date.</p>
          
          <table class="details-table">
            <tr>
              <td class="label">Document Type</td>
              <td class="value">${doc.doc_type.replace('_', ' ')}</td>
            </tr>
            <tr>
              <td class="label">Document Name</td>
              <td class="value">${doc.name}</td>
            </tr>
            <tr>
              <td class="label">Expiration Date</td>
              <td class="value expiry-highlight">${expiryDateStr}</td>
            </tr>
            <tr>
              <td class="label">Days Remaining</td>
              <td class="value">${diffDays} day${diffDays !== 1 ? 's' : ''}</td>
            </tr>
          </table>

          <p style="margin-top: 30px; font-size: 13px; color: #777;">
            Please ensure that necessary renewal actions are initiated to avoid service interruptions.
          </p>
        </div>
        <div class="footer">
          &copy; ${new Date().getFullYear()} Vistar Logitek Private Limited. All rights reserved.<br>
          This is an automated system message. Please do not reply directly to this email.
        </div>
      </div>
    </body>
    </html>
  `;
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
      const toRecipients = ['manager.commercial@vistarlogitek.com'];
      if (doc.creator_email) {
        toRecipients.push(doc.creator_email);
      }

      const ccRecipients = [
        'prashant.tamhankar@vistarlogitek.com',
        'Flutter.developer@vistarlogitek.com'
      ];

      const htmlTemplate = generateHOExpiryEmailHtml(doc);

      const attachments = [
        {
          filename: 'logo.png',
          path: path.join(process.cwd(), 'assets', 'logo.png'),
          cid: 'logo' // same cid value as in the html
        }
      ];

      await sendEmail(toRecipients, title, message, htmlTemplate, ccRecipients, attachments);

      // Log success for each HO user
      for (const userId of hoUserIds) {
        await pool.query(
          `INSERT INTO ho_notifications (agreement_id, cost_sheet_id, certification_id, notified_user_id, message, status, sent_at)
           VALUES ($1, $2, $3, $4, $5, 'SENT', CURRENT_TIMESTAMP)`,
          [
            doc.doc_type === 'AGREEMENT' ? doc.id : null,
            doc.doc_type === 'COST_SHEET' ? doc.id : null,
            doc.doc_type === 'CERTIFICATION' ? doc.id : null,
            userId,
            message
          ]
        );
      }
    } catch (err) {
      console.error(`[ho-expiry] Failed to send notification for ${doc.name}:`, err.message);
      // Log failure for retry
      for (const userId of hoUserIds) {
        await pool.query(
          `INSERT INTO ho_notifications (agreement_id, cost_sheet_id, certification_id, notified_user_id, message, status, retry_count, next_retry_at)
           VALUES ($1, $2, $3, $4, $5, 'PENDING_RETRY', 0, CURRENT_TIMESTAMP + INTERVAL '1 hour')`,
          [
            doc.doc_type === 'AGREEMENT' ? doc.id : null,
            doc.doc_type === 'COST_SHEET' ? doc.id : null,
            doc.doc_type === 'CERTIFICATION' ? doc.id : null,
            userId,
            message
          ]
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
  cron.schedule('0 10 * * *', runHODocumentExpiryJob);

  // Run every hour for retries
  cron.schedule('0 * * * *', async () => {
    console.log('[ho-expiry] Checking for failed notifications to retry...');
    await retryFailedNotifications();
  });

  console.log('[ho-expiry] Head Office scheduler started (Daily at 10:00, Retries hourly)');
};

module.exports = {
  startHOScheduler,
  runHODocumentExpiryJob,
  retryFailedNotifications
};
