require('dotenv').config();
const { sendEmail } = require('../src/utils/email.utils');
const path = require('path');

async function testMail() {
  console.log('🧪 Starting manual email test...');
  console.log('SMTP Config:', {
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT,
    user: process.env.SMTP_USER,
    from: process.env.SMTP_FROM_NAME
  });

  const to = 'Flutter.developer@vistarlogitek.com';
  const subject = 'Test Lead Notification - Manual Trigger';
  const text = 'This is a test email to verify that the SMTP configuration is working correctly.';
  const html = `
    <div style="font-family: sans-serif; padding: 20px; border: 1px solid #eee; border-radius: 8px;">
      <h2 style="color: #28A745;">SMTP Test Successful</h2>
      <p>This is a manual test email from the Client Entry Portal backend.</p>
      <p><strong>Recipient:</strong> ${to}</p>
      <p><strong>Timestamp:</strong> ${new Date().toLocaleString()}</p>
    </div>
  `;

  try {
    const result = await sendEmail(to, subject, text, html);
    console.log('✅ Email sent successfully!');
    console.log('Message ID:', result.messageId);
  } catch (err) {
    console.error('❌ Failed to send test email:');
    console.error(err);
  } finally {
    process.exit();
  }
}

testMail();
