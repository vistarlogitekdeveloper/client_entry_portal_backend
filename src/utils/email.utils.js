const nodemailer = require('nodemailer');

/**
 * Creates an SMTP transporter using environment variables.
 */
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT) || 587,
  secure: process.env.SMTP_SECURE === 'true', // true for 465, false for other ports
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

/**
 * Sends an email notification.
 * @param {string|string[]} to - Recipient email(s)
 * @param {string} subject - Email subject
 * @param {string} text - Plain text body
 * @param {string} html - HTML body (optional)
 */
const sendEmail = async (to, subject, text, html = null) => {
  try {
    const info = await transporter.sendMail({
      from: `"${process.env.SMTP_FROM_NAME || 'Portal Alerts'}" <${process.env.SMTP_USER}>`,
      to: typeof to === 'array' ? to.join(', ') : to,
      subject,
      text,
      html: html || text,
    });
    console.log('[Email] Sent: %s', info.messageId);
    return info;
  } catch (error) {
    console.error('[Email] Failed to send:', error.message);
    throw error;
  }
};

module.exports = {
  sendEmail,
};
