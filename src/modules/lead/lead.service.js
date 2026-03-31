const pool = require('../../config/db');
const { isBD } = require('../../utils/role.utils');

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

// ✅ CREATE
exports.createLead = async (data, actor) => {
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

  return lead;
};

// ✅ GET WITH FILTERS
exports.getLeads = async (filters, actor) => {
  let query = `SELECT * FROM lead_master WHERE 1=1`;
  let values = [];
  let i = 1;

  if (isBD(actor)) {
    query += ` AND owner = $${i++}`;
    values.push(actor.id);
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
exports.updateLead = async (id, data, actor) => {
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

  let query = `
    UPDATE lead_master
    SET ${setParts.join(', ')}
    WHERE id = $${i}
  `;

  if (isBD(actor)) {
    query += ` AND owner = $${i + 1}`;
  }

  query += `
    RETURNING *;
  `;

  values.push(id);
  if (isBD(actor)) {
    values.push(actor.id);
  }

  const result = await pool.query(query, values);
  return result.rows[0];
};

// ✅ DELETE LEADS
exports.deleteLead = async (id, actor) => {
  // Only called by ADMIN via middleware, but just in case:
  let query = `DELETE FROM lead_master WHERE id = $1 RETURNING *`;
  const values = [id];

  const result = await pool.query(query, values);
  return result.rows[0];
};
