require('dotenv').config();
const pool = require('../src/config/db');
const { sendEmail } = require('../src/utils/email.utils');
const userService = require('../src/modules/user/user.service');

// Utility to get the current week's Monday
const getWeekStartDate = (dateInput) => {
  const d = new Date(dateInput);
  if (Number.isNaN(d.getTime())) throw new Error('Invalid date');
  const day = d.getDay();
  const mondayOffset = (day + 6) % 7;
  const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() - mondayOffset);
  const y = monday.getFullYear();
  const m = String(monday.getMonth() + 1).padStart(2, '0');
  const dd = String(monday.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
};

const generateReminderHtml = (userName, pendingLeads) => {
  const leadListHtml = pendingLeads.map(lead => `
    <li style="margin-bottom: 8px; color: #333;">
      <strong>${lead.company_name}</strong> ${lead.city ? `(${lead.city})` : ''}
    </li>
  `).join('');

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: 'Segoe UI', Arial, sans-serif; line-height: 1.6; color: #444; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 10px; }
        .header { background-color: #f8f9fa; padding: 15px; text-align: center; border-bottom: 3px solid #dc3545; border-radius: 10px 10px 0 0; }
        .content { padding: 20px; }
        .footer { font-size: 12px; color: #888; text-align: center; margin-top: 20px; border-top: 1px solid #eee; padding-top: 10px; }
        .urgent { color: #dc3545; font-weight: bold; }
        ul { padding-left: 20px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h2 style="margin: 0; color: #dc3545;">Weekly Review Reminder</h2>
        </div>
        <div class="content">
          <p>Hi <strong>${userName}</strong>,</p>
          <p>This is a reminder that the following leads are <span class="urgent">pending</span> their weekly updates for this week:</p>
          <ul>
            ${leadListHtml}
          </ul>
          <p><strong>Please add your weekly updates in the portal before the scheduled meeting.</strong></p>
          <p>Your timely updates help the management track project progress effectively.</p>
        </div>
        <div class="footer">
          &copy; ${new Date().getFullYear()} Vistar Logitek Private Limited. All rights reserved.<br>
          This is an automated reminder.
        </div>
      </div>
    </body>
    </html>
  `;
};

async function runFridayReminders() {
  console.log('📅 Starting Friday Weekly Review Reminder Job...');
  
  const weekStartDate = getWeekStartDate(new Date());
  
  try {
    // 1. Fetch all pending leads grouped by owner
    const pendingLeadsResult = await pool.query(`
      SELECT 
        lm.id, 
        lm.company_name, 
        lm.city,
        lm.owner,
        u.name as owner_name,
        u.email as owner_email,
        u.role as owner_role
      FROM lead_master lm
      JOIN users u ON lm.owner = u.id
      LEFT JOIN lead_reviews lr ON lr.lead_id = lm.id AND lr.week_start_date::date = $1::date
      WHERE lr.id IS NULL AND lm.status = 'ACTIVE'
      ORDER BY u.id
    `, [weekStartDate]);

    const pendingLeads = pendingLeadsResult.rows;
    if (pendingLeads.length === 0) {
      console.log('✅ No pending reviews found for this week. Great job everyone!');
      return;
    }

    // 2. Fetch Admin emails for CC
    const adminEmails = await userService.getAdminEmails();
    const ccRecipients = [...new Set([...adminEmails, 'Flutter.developer@vistarlogitek.com'])];

    // 3. Group by Owner ID
    const groupedByOwner = {};
    pendingLeads.forEach(lead => {
      if (!groupedByOwner[lead.owner]) {
        groupedByOwner[lead.owner] = {
          name: lead.owner_name,
          email: lead.owner_email,
          leads: []
        };
      }
      groupedByOwner[lead.owner].leads.push(lead);
    });

    // 4. Send Emails
    console.log(`📡 Grouped into ${Object.keys(groupedByOwner).length} users. Sending emails...`);
    
    for (const ownerId in groupedByOwner) {
      const { name, email, leads } = groupedByOwner[ownerId];
      
      if (!email) {
        console.warn(`⚠️ Skipping user ${name} (${ownerId}) - No email found.`);
        continue;
      }

      const subject = `Urgent: Pending Weekly Review - ${leads.length} Leads`;
      const text = `Hi ${name}, you have ${leads.length} leads pending for weekly updates: ${leads.map(l => l.company_name).join(', ')}. Please update them before the meeting.`;
      const html = generateReminderHtml(name, leads);

      try {
        await sendEmail(email, subject, text, html, ccRecipients);
        console.log(`✅ Sent reminder to ${name} (${email}) for ${leads.length} leads.`);
      } catch (sendErr) {
        console.error(`❌ Failed to send email to ${email}:`, sendErr.message);
      }
    }

    console.log('🎉 Friday Reminder Job completed successfully.');
  } catch (err) {
    console.error('❌ Error during Friday Reminder Job:', err.message);
  } finally {
    process.exit();
  }
}

runFridayReminders();
