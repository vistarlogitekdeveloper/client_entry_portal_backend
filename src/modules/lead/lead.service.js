const pool = require('../../config/db');
const { isBD } = require('../../utils/role.utils');
const userService = require('../user/user.service');
const { sendMulticastNotification, sendPushNotification } = require('../../utils/notification.utils');

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
      projected_value, projected_month, progress_status, final_status
    )
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
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
    data.final_status ?? null
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

  // Push Notifications for ADMIN/MANAGER, Owner, and Creator on new lead
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
        `A new lead for "${lead.company_name}" has been created.`,
        { lead_id: lead.id, type: 'NEW_LEAD' }
      );
    }
  } catch (err) {
    console.error('Failed to send new lead notifications:', err.message);
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
  return result.rows;
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
    query += ` AND owner = $2`;
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
    final_status: 'final_status'
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
      selectQuery += ` AND owner = $2`;
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
      updateQuery += ` AND owner = $${idParamIndex + 1}`;
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
    ownerFilter = ` AND lm.owner = $2`;
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
  const xlsx = require('xlsx');

  // Reuse getLeads logic
  const leads = await exports.getLeads(filters, actor);

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

  const data = leads.map((l) => ({
    'Company Name': l.company_name,
    'Contact Person': l.contact_person,
    Email: l.email || 'N/A',
    Mobile: l.mobile || 'N/A',
    Status: l.status,
    Region: l.region,
    City: l.city || 'N/A',
    'Business Scope': l.business_scope || 'N/A',
    'Lead Received Date': l.lead_received_date ? new Date(l.lead_received_date).toLocaleDateString() : 'N/A',
    'RFQ Submission Date': l.rfq_submission_date ? new Date(l.rfq_submission_date).toLocaleDateString() : 'N/A',
    'Commercial Status': l.commercial_status,
    'Projected Value': l.projected_value || 0,
    'Created At': new Date(l.created_at).toLocaleString(),
    'Weekly Comments': reviewsMap[l.id] ? reviewsMap[l.id].join('\\n') : 'N/A',
  }));

  const worksheet = xlsx.utils.json_to_sheet(data);
  const workbook = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(workbook, worksheet, 'Leads');

  // Column widths
  const wscols = [
    { wch: 30 }, // Company Name
    { wch: 25 }, // Contact Person
    { wch: 30 }, // Email
    { wch: 15 }, // Mobile
    { wch: 12 }, // Status
    { wch: 15 }, // Region
    { wch: 15 }, // City
    { wch: 20 }, // Business Scope
    { wch: 18 }, // Lead Received Date
    { wch: 18 }, // RFQ Submission Date
    { wch: 18 }, // Commercial Status
    { wch: 15 }, // Projected Value
    { wch: 20 }, // Created At
    { wch: 40 }, // Weekly Comments
  ];
  worksheet['!cols'] = wscols;

  return xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });
};
