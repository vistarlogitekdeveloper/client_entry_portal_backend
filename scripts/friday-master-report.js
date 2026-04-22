require('dotenv').config();
const pool = require('../src/config/db');
const { sendEmail } = require('../src/utils/email.utils');
const userService = require('../src/modules/user/user.service');
const leadService = require('../src/modules/lead/lead.service');

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

const generateReminderHtml = (userName, pendingLeads, hasExcel) => {
  const leadListHtml = pendingLeads.length > 0 ? `
    <p>This is a reminder that the following leads are <span style="color: #dc3545; font-weight: bold;">pending</span> their weekly updates for this week:</p>
    <ul>
      ${pendingLeads.map(lead => `<li style="margin-bottom: 8px;"><strong>${lead.company_name}</strong></li>`).join('')}
    </ul>
    <p><strong>Please add your weekly updates in the portal.</strong></p>
  ` : `<p>Great job! You have no pending updates for this week.</p>`;

  const excelNote = hasExcel ? `<p style="background: #f8f9fa; padding: 10px; border-left: 4px solid #28a745;"><strong>📎 Attachment:</strong> I have attached the full Lead Export Excel file for your review, containing all leads and weekly updates.</p>` : '';

  return `
    <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #eee; padding: 20px; border-radius: 10px;">
      <h2 style="color: #2c3e50; border-bottom: 2px solid #eee; padding-bottom: 10px;">Weekly Lead Summary & Reminder</h2>
      <p>Hi <strong>${userName}</strong>,</p>
      ${leadListHtml}
      ${excelNote}
      <p style="font-size: 12px; color: #888; margin-top: 30px; border-top: 1px solid #eee; padding-top: 10px;">
        &copy; ${new Date().getFullYear()} Vistar Logitek Private Limited. All rights reserved.
      </p>
    </div>
  `;
};

async function runFridayMasterJob() {
  console.log('📅 Starting Friday Master Job (Reminders + Excel Export)...');
  const weekStartDate = getWeekStartDate(new Date());

  try {
    // 1. Generate the Excel Report (All Leads)
    console.log('📊 Generating Master Excel Report...');
    const excelBuffer = await leadService.exportLeadsToExcel({}, { role: 'ADMIN' }); // Use ADMIN role to get all leads
    const attachment = {
      filename: `Weekly_Leads_Report_${weekStartDate}.xlsx`,
      content: excelBuffer
    };

    // 2. Fetch Pending Leads for Reminders
    const pendingLeadsResult = await pool.query(`
      SELECT lm.company_name, lm.owner, u.name as owner_name, u.email as owner_email
      FROM lead_master lm
      JOIN users u ON lm.owner = u.id
      LEFT JOIN lead_reviews lr ON lr.lead_id = lm.id AND lr.week_start_date::date = $1::date
      WHERE lr.id IS NULL AND lm.status = 'ACTIVE'
    `, [weekStartDate]);

    // Group pending leads by owner
    const groupedPending = {};
    pendingLeadsResult.rows.forEach(row => {
      if (!groupedPending[row.owner]) {
        groupedPending[row.owner] = { name: row.owner_name, email: row.owner_email, leads: [] };
      }
      groupedPending[row.owner].leads.push(row);
    });

    // 3. Fetch all BD and Admin emails
    const adminEmails = await userService.getAdminEmails();
    const bdEmailsResult = await pool.query("SELECT email, name, id FROM users WHERE role = 'BD'");
    const bdUsers = bdEmailsResult.rows;

    const allAdminEmails = [...new Set([...adminEmails, 'Flutter.developer@vistarlogitek.com'])];

    // 4. Send Emails to BDs
    console.log(`📡 Sending emails to ${bdUsers.length} BDs...`);
    for (const user of bdUsers) {
      if (!user.email) continue;
      const pending = groupedPending[user.id]?.leads || [];
      const html = generateReminderHtml(user.name, pending, true);
      const subject = `Weekly Lead Update ${pending.length > 0 ? '(Pending Action Required)' : '(Summary Report)'}`;
      
      await sendEmail(user.email, subject, '', html, null, [attachment]);
      console.log(`✅ Sent to BD: ${user.name}`);
    }

    // 5. Send Email to Admins (One summary per admin)
    console.log(`📡 Sending emails to ${adminEmails.length} Admins...`);
    for (const adminEmail of adminEmails) {
      const adminResult = await pool.query("SELECT name FROM users WHERE email = $1", [adminEmail]);
      const adminName = adminResult.rows[0]?.name || 'Admin';
      
      const html = generateReminderHtml(adminName, [], true); // Admins get the general report
      const subject = `Friday Master Lead Export - ${weekStartDate}`;

      await sendEmail(adminEmail, subject, '', html, null, [attachment]);
      console.log(`✅ Sent to Admin: ${adminName}`);
    }

    console.log('🎉 Friday Master Job completed successfully.');
  } catch (err) {
    console.error('❌ Error during Friday Master Job:', err.message);
  } finally {
    process.exit();
  }
}

runFridayMasterJob();
