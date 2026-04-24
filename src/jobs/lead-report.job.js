const cron = require('node-cron');
const path = require('path');
const leadService = require('../modules/lead/lead.service');
const userService = require('../modules/user/user.service');
const { sendEmail } = require('../utils/email.utils');

/**
 * Generates a professional HTML template for the weekly lead report email.
 */
const generateLeadReportEmailHtml = () => {
  const dateStr = new Date().toLocaleDateString('en-IN', { 
    day: 'numeric', 
    month: 'long', 
    year: 'numeric' 
  });
  
  const logoUrl = 'cid:logo'; 

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
        .container { max-width: 600px; margin: 20px auto; border: 1px solid #eee; border-top: 8px solid #2E4057; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 10px rgba(0,0,0,0.05); }
        .header { background-color: #f8f8f8; padding: 25px; text-align: center; border-bottom: 1px solid #eee; }
        .logo { max-height: 80px; margin-bottom: 10px; }
        .content { padding: 30px; }
        .badge { display: inline-block; padding: 6px 15px; background-color: #2E4057; color: white; font-weight: bold; border-radius: 20px; font-size: 12px; margin-bottom: 20px; text-transform: uppercase; letter-spacing: 1px; }
        h2 { margin-top: 0; color: #2c3e50; font-size: 22px; }
        .info-box { background-color: #f1f4f9; border-left: 4px solid #2E4057; padding: 15px; margin: 20px 0; border-radius: 4px; }
        .footer { background-color: #f8f8f8; padding: 20px; text-align: center; font-size: 12px; color: #888; border-top: 1px solid #eee; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <img src="${logoUrl}" alt="Vistar Logitek" class="logo">
          <div style="font-size: 14px; color: #666; font-weight: 600;">Client Entry Portal</div>
        </div>
        <div class="content">
          <div class="badge">Weekly Report</div>
          <h2>Weekly Lead Export</h2>
          <p>Hello Team,</p>
          <p>Please find attached the comprehensive leads report for the week ending <strong>${dateStr}</strong>.</p>
          
          <div class="info-box">
            <strong>Attachment Includes:</strong><br>
            - Full Lead Details<br>
            - Current Status & Priority<br>
            - Commercial & Study Progress<br>
            - Projected Values
          </div>

          <p>This report contains all current leads data as exported from the Vistar Logitek Portal.</p>
          
          <p style="margin-top: 30px; font-size: 13px; color: #777;">
            Note: This is an automatically generated report sent to all BD and Admin users.
          </p>
        </div>
        <div class="footer">
          &copy; ${new Date().getFullYear()} Vistar Logitek Private Limited. All rights reserved.<br>
          This is an automated system message.
        </div>
      </div>
    </body>
    </html>
  `;
};

const runLeadReportJob = async () => {
  console.log('[lead-report] Generating weekly lead report...');
  
  try {
    // 1. Generate Excel Buffer
    // Passing empty filters and null actor to get ALL leads (as per current app logic)
    const excelBuffer = await leadService.exportLeadsToExcel({}, null);
    
    // 2. Fetch Recipient Emails (BD and ADMIN)
    const recipients = await userService.getBDAndAdminEmails();
    
    if (recipients.length === 0) {
      console.log('[lead-report] No BD or Admin users found to receive the report.');
      return;
    }

    // 3. Prepare Email
    const subject = `Weekly Leads Report - ${new Date().toLocaleDateString()}`;
    const htmlBody = generateLeadReportEmailHtml();
    
    const attachments = [
      {
        filename: `Leads_Report_${new Date().toISOString().split('T')[0]}.xlsx`,
        content: excelBuffer
      },
      {
        filename: 'logo.png',
        path: path.join(process.cwd(), 'assets', 'logo.png'),
        cid: 'logo'
      }
    ];

    // 4. Send Email
    await sendEmail(recipients, subject, 'Please find the weekly leads report attached.', htmlBody, null, attachments);
    
    console.log(`[lead-report] Report successfully sent to ${recipients.length} users.`);
  } catch (err) {
    console.error('[lead-report] Failed to generate or send weekly report:', err.message);
  }
};

const startLeadReportScheduler = () => {
  // Every Friday at 5:00 PM (17:00)
  // Cron format: 'minute hour day-of-month month day-of-week'
  // 5 is Friday
  cron.schedule('0 17 * * 5', runLeadReportJob, {
    timezone: "Asia/Kolkata"
  });

  console.log('[lead-report] Weekly lead report scheduler started (Every Friday at 17:00 Asia/Kolkata)');
};

module.exports = {
  startLeadReportScheduler,
  runLeadReportJob
};
