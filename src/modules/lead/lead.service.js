const pool = require('../../config/db');
const { isBD } = require('../../utils/role.utils');
const path = require('path');
const userService = require('../user/user.service');
const { sendMulticastNotification, sendPushNotification } = require('../../utils/notification.utils');
const { sendEmail } = require('../../utils/email.utils');

// Monday (start) week_start_date in LOCAL time.
const getWeekStartDate = (dateInput) => {
  const d = new Date(dateInput);
  if (Number.isNaN(d.getTime())) throw new Error('Invalid date');

  const day = d.getDay(); // 0 (Sun) ... 6 (Sat) in local time
  const mondayOffset = (day + 6) % 7; // Monday => 0

  const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() - mondayOffset);
  const y = monday.getFullYear();
  const m = String(monday.getMonth() + 1).padStart(2, '0');
  const dd = String(monday.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
};

/**
 * Utility to convert string values in lead data to UPPERCASE,
 * excluding technically sensitive fields like email and IDs.
 */
const capitalizeLeadData = (data) => {
  if (!data) return data;
  const exclude = ['email', 'owner', 'lead_by'];
  const result = { ...data };
  for (const key of Object.keys(result)) {
    if (!exclude.includes(key) && typeof result[key] === 'string') {
      result[key] = result[key].toUpperCase();
    }
  }
  return result;
};

/**
 * Generates a professional HTML template for a new lead notification.
 */
const generateNewLeadEmailHtml = (lead, creatorName) => {
  const logoUrl = 'cid:logo'; 

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
        .container { max-width: 600px; margin: 20px auto; border: 1px solid #eee; border-top: 8px solid #28A745; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 10px rgba(0,0,0,0.05); }
        .header { background-color: #f8f8f8; padding: 25px; text-align: center; border-bottom: 1px solid #eee; }
        .logo { max-height: 80px; margin-bottom: 10px; }
        .content { padding: 30px; }
        .success-badge { display: inline-block; padding: 6px 15px; background-color: #28A745; color: white; font-weight: bold; border-radius: 20px; font-size: 12px; margin-bottom: 20px; text-transform: uppercase; letter-spacing: 1px; }
        h2 { margin-top: 0; color: #2c3e50; font-size: 22px; }
        .details-table { width: 100%; border-collapse: collapse; margin-top: 20px; background-color: #fafafa; border-radius: 6px; }
        .details-table td { padding: 12px 15px; border-bottom: 1px solid #eee; }
        .label { font-weight: bold; color: #666; width: 40%; }
        .value { color: #222; font-weight: 500; }
        .footer { background-color: #f8f8f8; padding: 20px; text-align: center; font-size: 12px; color: #888; border-top: 1px solid #eee; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <div style="font-size: 14px; color: #666; font-weight: 600;">Client Entry Portal</div>
        </div>
        <div class="content">
          <div class="success-badge">New Lead Alert</div>
          <h2>Lead Successfully Created</h2>
          <p>A new lead has been registered in the portal by <strong>${creatorName}</strong>.</p>
          
          <table class="details-table">
            <tr>
              <td class="label">Company Name</td>
              <td class="value">${lead.company_name}</td>
            </tr>
            <tr>
              <td class="label">Contact Person</td>
              <td class="value">${lead.contact_person}</td>
            </tr>
            <tr>
              <td class="label">Region / City</td>
              <td class="value">${lead.region} / ${lead.city || 'N/A'}</td>
            </tr>
            <tr>
              <td class="label">Business Scope</td>
              <td class="value">${lead.business_scope || 'N/A'}</td>
            </tr>
          </table>

          <p style="margin-top: 30px; font-size: 13px; color: #777;">
            Please log in to the portal to view full details and manage the lead.
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

// ✅ CREATE
exports.createLead = async (inputData, actor) => {
  const data = capitalizeLeadData(inputData);
  const owner = isBD(actor) ? actor.id : (data.owner ?? null);
  const leadBy = data.lead_by ?? actor?.id ?? null;

  const query = `
    INSERT INTO lead_master (
      company_name, contact_person, email, mobile,
      status, priority, project_location,
      city, region, business_scope,
      lead_received_date, rfq_submission_date, lead_by, owner,
      study_status, commercial_status,
      projected_value, projected_month, progress_status, final_status,
      commercial_status_reason, final_status_reason, progress_status_reason, study_status_reason
    )
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24)
    RETURNING *;
  `;

  const values = [
    data.company_name,
    data.contact_person,
    data.email,
    data.mobile,
    data.status ?? 'ACTIVE',
    data.priority ?? null,
    data.project_location ?? null,
    data.city,
    data.region,
    data.business_scope,
    data.lead_received_date,
    data.rfq_submission_date ?? null,
    leadBy,
    owner,
    data.study_status ?? null,
    data.commercial_status ?? 'NOT_STARTED',
    data.projected_value ?? null,
    data.projected_month ?? null,
    data.progress_status ?? null,
    data.final_status ?? null,
    data.commercial_status_reason ?? null,
    data.final_status_reason ?? null,
    data.progress_status_reason ?? null,
    data.study_status_reason ?? null
  ];

  const result = await pool.query(query, values);
  const lead = result.rows[0];

  // TEST/DEMO FLOW: create pending weekly reminders immediately on lead creation.
  // The reminder list will later disappear automatically once a weekly remark is added,
  // because the reminders API excludes rows that already have a matching lead_reviews entry.
  if (lead?.id && lead?.owner) {
    const weekStartDate = getWeekStartDate(new Date());

    const reminderInsertSql = `
      INSERT INTO lead_review_reminders (
        week_start_date,
        reminder_day,
        lead_id,
        notified_user_id,
        status,
        sent_at
      )
      SELECT
        $1::date,
        'FRIDAY',
        $2,
        $3,
        'PENDING',
        NULL
      ON CONFLICT (week_start_date, lead_id, notified_user_id, reminder_day)
      DO UPDATE SET
        status = 'PENDING',
        sent_at = NULL;
    `;

    try {
      await pool.query(reminderInsertSql, [weekStartDate, lead.id, lead.owner]);
    } catch (err) {
      // Don't block lead creation if owner type doesn't match notified_user_id type.
      console.error('Reminder insert failed:', err.message);
    }
  }

  // Consolidate user lookups for notifications
  let creatorProfile = null;
  try {
    creatorProfile = await userService.findOne(actor.id);
  } catch (err) {
    console.warn('Could not fetch creator profile for notifications:', err.message);
  }
  const creatorName = creatorProfile?.name || 'Unknown';

  // 1. Push Notifications for ADMIN/MANAGER, Owner, and Creator
  try {
    const notifyUserIds = [];
    if (lead.owner) notifyUserIds.push(lead.owner);
    if (lead.lead_by) notifyUserIds.push(lead.lead_by);

    const [adminTokens, otherTokens] = await Promise.all([
      userService.getAdminManagerTokens(),
      userService.getUserTokens(notifyUserIds)
    ]);

    const allTokens = [...new Set([...adminTokens, ...otherTokens])];

    if (allTokens.length > 0) {
      await sendMulticastNotification(
        allTokens,
        'New Lead Created',
        `A new lead for "${lead.company_name}" has been created by ${creatorName}.`,
        { lead_id: lead.id, type: 'NEW_LEAD' }
      );
    }
  } catch (err) {
    console.error('Failed to send new lead push notifications:', err.message);
  }

  // 2. Real-time Email Notifications for ADMINs, Creator (cc), and Dev (cc)
  try {
    const admins = await userService.getAdminEmails();

    // Combined recipient list: Admins + Flutter Dev (backup)
    const toRecipients = (admins.length > 0 ? admins : ['Flutter.developer@vistarlogitek.com'])
      .filter(email => email && typeof email === 'string' && email.includes('@'));
    
    const ccRecipients = [];
    if (creatorProfile?.email) {
      ccRecipients.push(creatorProfile.email);
    }
    if (admins.length > 0) {
      ccRecipients.push('Flutter.developer@vistarlogitek.com');
    }
    
    const filteredCc = ccRecipients.filter(email => email && typeof email === 'string' && email.includes('@'));

    console.log(`📧 Attempting to send email. TO: ${toRecipients.join(', ')} | CC: ${filteredCc.join(', ')}`);

    if (toRecipients.length > 0) {
      const subject = `New Lead Created: ${lead.company_name} (by ${creatorName})`;
      const htmlTemplate = generateNewLeadEmailHtml(lead, creatorName);
      
      await sendEmail(toRecipients, subject, `New lead: ${lead.company_name}`, htmlTemplate, filteredCc);
      console.log('✅ Email sent successfully according to lead service.');
    } else {
      console.warn('⚠️ No valid TO recipients found for lead creation email.');
    }
  } catch (err) {
    console.error('❌ Failed to send new lead email notification:', err.message);
  }

  return lead;
};

// ✅ GET WITH FILTERS
exports.getLeads = async (filters, actor) => {
  let query = `SELECT * FROM lead_master WHERE 1=1`;
  let values = [];
  let i = 1;

  // REMOVED built-in owner access restriction, but we allow filtering by owner explicitly
  if (filters.owner) {
    query += ` AND owner = $${i++}`;
    values.push(filters.owner);
  }

  if (filters.region) {
    query += ` AND region = $${i++}`;
    values.push(filters.region);
  }

  if (filters.status) {
    query += ` AND status = $${i++}`;
    values.push(filters.status);
  }

  if (filters.priority) {
    query += ` AND priority = $${i++}`;
    values.push(filters.priority);
  }

  if (filters.search) {
    query += ` AND company_name ILIKE $${i++}`;
    values.push(`%${filters.search}%`);
  }

  query += ` ORDER BY created_at DESC`;

  const result = await pool.query(query, values);
  const leads = result.rows;

  const stats = {
    total: leads.length,
    myLeads: leads.filter(l => l.owner === actor?.id).length,
    active: leads.filter(l => l.status === 'ACTIVE').length,
    won: leads.filter(l => l.final_status === 'WON').length,
    lost: leads.filter(l => l.final_status === 'LOST').length,
  };

  return { leads, stats };
};

// ✅ DISTINCT customer (company) names — one row per unique name after trim
exports.getUniqueCompanyNames = async (actor) => {
  let query = `
    SELECT DISTINCT TRIM(company_name) AS company_name
    FROM lead_master
    WHERE company_name IS NOT NULL
      AND TRIM(company_name) <> ''
  `;
  const values = [];
  let i = 1;

  if (isBD(actor)) {
    query += ` AND owner = $${i++}`;
    values.push(actor.id);
  }

  query += ` ORDER BY company_name ASC`;

  const result = await pool.query(query, values);
  return result.rows.map((r) => r.company_name);
};

// ✅ GET ONE BY ID
exports.getLeadById = async (id, actor) => {
  let query = `SELECT * FROM lead_master WHERE id = $1`;
  const values = [id];

  if (isBD(actor)) {
    // BD users can view leads they own OR leads they sourced (lead_by)
    query += ` AND (owner = $2 OR lead_by = $2)`;
    values.push(actor.id);
  }

  const result = await pool.query(query, values);
  return result.rows[0] || null;
};

// ✅ UPDATE (SAFE, supports setting fields to null)
// Updates only keys present in `data` (even if value is null).
exports.updateLead = async (id, inputData, actor) => {
  const data = capitalizeLeadData(inputData);
  const allowedFields = {
    status: 'status',
    priority: 'priority',
    project_location: 'project_location',
    company_name: 'company_name',
    contact_person: 'contact_person',
    email: 'email',
    mobile: 'mobile',
    city: 'city',
    region: 'region',
    business_scope: 'business_scope',
    lead_received_date: 'lead_received_date',
    rfq_submission_date: 'rfq_submission_date',
    lead_by: 'lead_by',
    owner: 'owner',
    study_status: 'study_status',
    commercial_status: 'commercial_status',
    projected_value: 'projected_value',
    projected_month: 'projected_month',
    progress_status: 'progress_status',
    final_status: 'final_status',
    commercial_status_reason: 'commercial_status_reason',
    final_status_reason: 'final_status_reason',
    progress_status_reason: 'progress_status_reason',
    study_status_reason: 'study_status_reason'
  };

  const setParts = [];
  const values = [];
  let i = 1;

  for (const [field, column] of Object.entries(allowedFields)) {
    if (Object.prototype.hasOwnProperty.call(data, field)) {
      setParts.push(`${column} = $${i++}`);
      values.push(data[field]);
    }
  }

  if (setParts.length === 0) {
    throw new Error('No valid fields provided for update');
  }

  if (isBD(actor) && Object.prototype.hasOwnProperty.call(data, 'owner') && data.owner !== actor.id) {
    throw new Error('BD users can only assign leads to themselves');
  }

  // DATE+NUMERIC columns need normalization for correct diffing/logging.
  const dateOnlyColumns = new Set(['lead_received_date', 'rfq_submission_date', 'projected_month']);
  const numericColumns = new Set(['projected_value']);

  const normalizeForCompare = (column, v) => {
    if (v === undefined || v === null) return null;

    if (numericColumns.has(column)) {
      const n = typeof v === 'number' ? v : parseFloat(String(v));
      return Number.isNaN(n) ? String(v) : String(n);
    }

    if (dateOnlyColumns.has(column)) {
      if (typeof v === 'string') {
        const m = v.trim().match(/^(\d{4}-\d{2}-\d{2})/);
        if (m) return m[1];
      }
      if (v instanceof Date) return v.toISOString().slice(0, 10);
      const d = new Date(v);
      return Number.isNaN(d.getTime()) ? String(v) : d.toISOString().slice(0, 10);
    }

    return String(v);
  };

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Fetch old lead row (with same BD access rules) so we can compute field-level diffs.
    let selectQuery = `SELECT * FROM lead_master WHERE id = $1`;
    const selectValues = [id];
    if (isBD(actor)) {
      // BD users can edit leads they own OR leads they sourced (lead_by)
      selectQuery += ` AND (owner = $2 OR lead_by = $2)`;
      selectValues.push(actor.id);
    }

    const oldLeadRes = await client.query(selectQuery, selectValues);
    const oldLead = oldLeadRes.rows[0];

    if (!oldLead) {
      await client.query('ROLLBACK');
      return null;
    }

    const fieldChanges = [];
    for (const [field, column] of Object.entries(allowedFields)) {
      if (!Object.prototype.hasOwnProperty.call(data, field)) continue;

      const oldNorm = normalizeForCompare(column, oldLead[column]);
      const newNorm = normalizeForCompare(column, data[field]);

      if (oldNorm !== newNorm) {
        fieldChanges.push({
          field_name: column,
          old_value: oldNorm,
          new_value: newNorm
        });
      }
    }

    // If the PUT request didn't actually change any field value,
    // skip both update + audit insert (prevents misleading "updated" history).
    if (fieldChanges.length === 0) {
      await client.query('ROLLBACK');
      return oldLead;
    }

    // Update lead row.
    const idParamIndex = i; // i is 1 + numberOfUpdatedFields

    let updateQuery = `
      UPDATE lead_master
      SET ${setParts.join(', ')}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $${idParamIndex}
    `;

    if (isBD(actor)) {
      // BD users can update leads they own OR leads they sourced (lead_by)
      updateQuery += ` AND (owner = $${idParamIndex + 1} OR lead_by = $${idParamIndex + 1})`;
    }

    updateQuery += ` RETURNING *;`;

    const updateValues = [...values, id];
    if (isBD(actor)) {
      updateValues.push(actor.id);
    }

    const updatedRes = await client.query(updateQuery, updateValues);
    const updatedLead = updatedRes.rows[0];

    // Insert audit event + per-field diffs.
    const changedAt = new Date();
    const eventRes = await client.query(
      `INSERT INTO lead_change_events (lead_id, changed_by, changed_at)
       VALUES ($1, $2, $3)
       RETURNING id`,
      [id, actor?.id ?? null, changedAt]
    );
    const eventId = eventRes.rows[0]?.id;

    if (eventId) {
      const fieldValuePlaceholders = [];
      const fieldValues = [];
      let p = 1;

      for (const fc of fieldChanges) {
        fieldValuePlaceholders.push(`($${p++}, $${p++}, $${p++}, $${p++})`);
        fieldValues.push(eventId, fc.field_name, fc.old_value, fc.new_value);
      }

      await client.query(
        `INSERT INTO lead_change_event_fields (event_id, field_name, old_value, new_value)
         VALUES ${fieldValuePlaceholders.join(', ')}`,
        fieldValues
      );
    }

    await client.query('COMMIT');

    // Push Notifications for Owner, Creator, and Admins if status changed
    const statusChange = fieldChanges.find(f => f.field_name === 'status');
    if (statusChange) {
      try {
        const notifyUserIds = [];
        if (updatedLead.owner) notifyUserIds.push(updatedLead.owner);
        if (updatedLead.lead_by) notifyUserIds.push(updatedLead.lead_by);

        const [adminTokens, otherTokens] = await Promise.all([
          userService.getAdminManagerTokens(),
          userService.getUserTokens(notifyUserIds)
        ]);

        const allTokens = [...new Set([...adminTokens, ...otherTokens])];

        if (allTokens.length > 0) {
          await sendMulticastNotification(
            allTokens,
            'Lead Status Updated',
            `Lead "${updatedLead.company_name}" status has been changed to ${updatedLead.status}.`,
            { lead_id: updatedLead.id, type: 'STATUS_CHANGE' }
          );
        }
      } catch (err) {
        console.error('Failed to send status update notification:', err.message);
      }
    }

    return updatedLead;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

// ✅ GET LEAD FIELD CHANGE HISTORY
exports.getLeadChanges = async (id, actor) => {
  const values = [id];
  let ownerFilter = '';

  if (isBD(actor)) {
    // BD users can view change history for leads they own OR leads they sourced (lead_by)
    ownerFilter = ` AND (lm.owner = $2 OR lm.lead_by = $2)`;
    values.push(actor.id);
  }

  const result = await pool.query(
    `
      SELECT
        e.id AS event_id,
        e.changed_at,
        e.changed_by,
        u.name AS changed_by_name,
        f.field_name,
        f.old_value,
        f.new_value
      FROM lead_change_events e
      INNER JOIN lead_master lm ON lm.id = e.lead_id
      INNER JOIN lead_change_event_fields f ON f.event_id = e.id
      LEFT JOIN users u ON u.id = e.changed_by
      WHERE e.lead_id = $1
        ${ownerFilter}
      ORDER BY e.changed_at DESC, f.field_name ASC
    `,
    values
  );

  // Group by "event" so UI can show: "At time X user Y changed these fields..."
  const byEvent = new Map();
  for (const row of result.rows) {
    if (!byEvent.has(row.event_id)) {
      byEvent.set(row.event_id, {
        event_id: row.event_id,
        changed_at: row.changed_at,
        changed_by: row.changed_by,
        changed_by_name: row.changed_by_name ?? null,
        fields: []
      });
    }

    byEvent.get(row.event_id).fields.push({
      field_name: row.field_name,
      old_value: row.old_value,
      new_value: row.new_value
    });
  }

  return Array.from(byEvent.values());
};

// ✅ DELETE LEADS
exports.deleteLead = async (id, actor) => {
  // Only called by ADMIN via middleware, but just in case:
  let query = `DELETE FROM lead_master WHERE id = $1 RETURNING *`;
  const values = [id];

  const result = await pool.query(query, values);
  return result.rows[0];
};

exports.exportLeadsToExcel = async (filters, actor) => {
  const ExcelJS = require('exceljs');

  // Reuse getLeads logic
  const { leads } = await exports.getLeads(filters, actor);

  // Fetch weekly comments (reviews) for these leads
  const leadIds = leads.map(l => l.id);
  let reviewsMap = {};
  if (leadIds.length > 0) {
    const reviewsRes = await pool.query(`
      SELECT lead_id, week_start_date, remarks
      FROM lead_reviews
      WHERE lead_id = ANY($1) AND remarks IS NOT NULL AND remarks <> ''
      ORDER BY week_start_date DESC
    `, [leadIds]);

    for (const row of reviewsRes.rows) {
      if (!reviewsMap[row.lead_id]) reviewsMap[row.lead_id] = [];
      const dateStr = new Date(row.week_start_date).toISOString().slice(0, 10);
      reviewsMap[row.lead_id].push(`[${dateStr}] ${row.remarks}`);
    }
  }

  // Find duplicates across all leads to process formatting later
  const counts = { company: {}, contact: {}, email: {}, mobile: {} };
  
  const norm = (str) => String(str || '').toLowerCase().trim();
  
  leads.forEach(l => {
    const c = norm(l.company_name);
    const p = norm(l.contact_person);
    const e = norm(l.email);
    const m = norm(l.mobile);

    if (c) counts.company[c] = (counts.company[c] || 0) + 1;
    if (p) counts.contact[p] = (counts.contact[p] || 0) + 1;
    if (e && e !== 'n/a') counts.email[e] = (counts.email[e] || 0) + 1;
    if (m && m !== 'n/a') counts.mobile[m] = (counts.mobile[m] || 0) + 1;
  });

  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Leads');

  worksheet.columns = [
    { header: 'Company Name', key: 'company', width: 30 },
    { header: 'Contact Person', key: 'contact', width: 25 },
    { header: 'Email', key: 'email', width: 30 },
    { header: 'Mobile', key: 'mobile', width: 15 },
    { header: 'Status', key: 'status', width: 12 },
    { header: 'Region', key: 'region', width: 15 },
    { header: 'City', key: 'city', width: 15 },
    { header: 'Business Scope', key: 'scope', width: 20 },
    { header: 'Lead Received Date', key: 'received', width: 18 },
    { header: 'RFQ Submission Date', key: 'rfq', width: 18 },
    { header: 'Commercial Status', key: 'commercial', width: 18 },
    { header: 'Projected Value', key: 'value', width: 15 },
    { header: 'Created At', key: 'created', width: 20 },
    { header: 'Weekly Comments', key: 'comments', width: 40 },
  ];

  leads.forEach(l => {
    worksheet.addRow({
      company: l.company_name,
      contact: l.contact_person,
      email: l.email || 'N/A',
      mobile: l.mobile || 'N/A',
      status: l.status,
      region: l.region,
      city: l.city || 'N/A',
      scope: l.business_scope || 'N/A',
      received: l.lead_received_date ? new Date(l.lead_received_date).toLocaleDateString() : 'N/A',
      rfq: l.rfq_submission_date ? new Date(l.rfq_submission_date).toLocaleDateString() : 'N/A',
      commercial: l.commercial_status,
      value: l.projected_value || 0,
      created: new Date(l.created_at).toLocaleString(),
      comments: reviewsMap[l.id] ? reviewsMap[l.id].join('\\n') : 'N/A',
    });
  });

  worksheet.eachRow((row, rowNumber) => {
    // Word wrap and dynamic height alignment for all text
    row.eachCell((cell) => {
      cell.alignment = { wrapText: true, vertical: 'top', horizontal: 'left' };
    });

    if (rowNumber === 1) {
      row.font = { bold: true };
      return; 
    }

    const highlightCell = (cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFC7CE' } };
      cell.font = { color: { argb: 'FF9C0006' } };
    };

    const cCell = row.getCell('company');
    if (counts.company[norm(cCell.value)] > 1) highlightCell(cCell);

    const pCell = row.getCell('contact');
    if (counts.contact[norm(pCell.value)] > 1) highlightCell(pCell);

    const eCell = row.getCell('email');
    if (norm(eCell.value) !== 'n/a' && counts.email[norm(eCell.value)] > 1) highlightCell(eCell);

    const mCell = row.getCell('mobile');
    if (norm(mCell.value) !== 'n/a' && counts.mobile[norm(mCell.value)] > 1) highlightCell(mCell);
  });

  const buffer = await workbook.xlsx.writeBuffer();
  return buffer;
};
