require('dotenv').config();
const { sendEmail } = require('./src/utils/email.utils');

async function testCcEmail() {
  console.log('Testing Email with CC field...');
  try {
    const to = ['manager.commercial@vistarlogitek.com'];
    const cc = ['prashant.tamhankar@vistarlogitek.com', 'Flutter.developer@vistarlogitek.com'];
    const subject = 'Test Expiry Alert with CC';
    const text = 'This is a test email to verify the CC functionality for document expiry alerts.';
    
    console.log(`Sending to: ${to.join(', ')}`);
    console.log(`CC to: ${cc.join(', ')}`);
    
    const info = await sendEmail(to, subject, text, null, cc);
    console.log('✅ Email sent successfully!');
    console.log('Message ID:', info.messageId);
  } catch (error) {
    console.error('❌ Failed to send test email:', error.message);
  }
}

testCcEmail();
