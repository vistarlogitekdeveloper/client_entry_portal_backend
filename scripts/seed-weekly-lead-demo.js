require('dotenv').config();

const pool = require('../src/config/db');

const toDateOnlyString = (d) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
};

// Monday-start (local time) week_start_date string: YYYY-MM-DD
const getWeekStartDate = (dateInput) => {
  const d = new Date(dateInput);
  if (Number.isNaN(d.getTime())) throw new Error('Invalid date');
  const day = d.getDay(); // 0 (Sun) ... 6 (Sat)
  const mondayOffset = (day + 6) % 7; // Monday => 0
  const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() - mondayOffset);
  return monday;
};

const addDays = (d, days) => {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
};

const mode = (process.argv[2] || 'all').toLowerCase(); // all | missing-current

(async () => {
  const userRes = await pool.query(
    `SELECT id, name
     FROM users
     WHERE role IN ('BD', 'MANAGER')
     ORDER BY name ASC
     LIMIT 1`
  );

  if (userRes.rows.length === 0) {
    throw new Error('No eligible user found in users table (role in BD, MANAGER)');
  }

  const user = userRes.rows[0];

  // Lead received date: "last month" approx = 30 days back
  const now = new Date();
  const lastMonth = addDays(now, -30);

  const weekStartCursor = getWeekStartDate(lastMonth);
  const currentWeekStart = getWeekStartDate(now);

  // Create a demo lead
  const leadInsertSql = `
    INSERT INTO lead_master (
      company_name,
      contact_person,
      email,
      mobile,
      status,
      priority,
      project_location,
      city,
      region,
      business_scope,
      lead_received_date,
      rfq_submission_date,
      lead_by,
      owner,
      study_status,
      commercial_status,
      projected_value,
      projected_month,
      progress_status,
      final_status
    )
    VALUES (
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
      $11,$12,$13,$14,$15,$16,$17,$18,$19,$20
    )
    RETURNING id;
  `;

  // Using owner/lead_by as UUID of the selected user.
  // If your DB uses text for owner/lead_by, tell me and I’ll adjust.
  const leadName = `Demo Lead ${Date.now()}`;
  const leadRes = await pool.query(leadInsertSql, [
    leadName,
    'Test Contact',
    `demo${Date.now()}@mail.com`,
    '9999999999',
    'ACTIVE',
    'MEDIUM',
    null,
    'Bangalore',
    'South',
    'In-plant stores management',
    now.toISOString(), // lead_received_date
    now.toISOString(),
    user.id,
    user.id,
    'NOT_STARTED',
    'NOT_STARTED',
    null,
    null,
    'PLANNING',
    'ONGOING'
  ]);

  const leadId = leadRes.rows[0].id;

  // Insert weekly remarks/history
  const insertReviewSql = `
    INSERT INTO lead_reviews (
      lead_id,
      week_start_date,
      review_status,
      remarks,
      created_by
    )
    VALUES ($1, $2::date, $3, $4, $5)
    ON CONFLICT (lead_id, week_start_date)
    DO UPDATE SET
      review_status = EXCLUDED.review_status,
      remarks = EXCLUDED.remarks,
      created_by = EXCLUDED.created_by,
      updated_at = CURRENT_TIMESTAMP;
  `;

  let cursor = new Date(weekStartCursor);
  while (cursor <= currentWeekStart) {
    const weekStartStr = toDateOnlyString(cursor);

    // In "missing-current" mode we skip current week so reminders remain pending.
    const isCurrentWeek = toDateOnlyString(cursor) === toDateOnlyString(currentWeekStart);
    if (mode === 'missing-current' && isCurrentWeek) {
      cursor = addDays(cursor, 7);
      continue;
    }

    const reviewStatus = 'UPDATED';
    const remarks = `Weekly update for week starting ${weekStartStr}`;

    await pool.query(insertReviewSql, [
      leadId,
      weekStartStr,
      reviewStatus,
      remarks,
      user.id
    ]);

    cursor = addDays(cursor, 7);
  }

  console.log(JSON.stringify({
    success: true,
    lead_id: leadId,
    owner_user_id: user.id,
    week_start_from: toDateOnlyString(weekStartCursor),
    week_start_to: toDateOnlyString(currentWeekStart),
    mode
  }, null, 2));

  await pool.end();
})().catch((err) => {
  console.error(JSON.stringify({ success: false, message: err.message }, null, 2));
  process.exit(1);
});

