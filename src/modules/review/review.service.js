const pool = require('../../config/db');
const { isBD } = require('../../utils/role.utils');

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const normalizeUuidOrNull = (value, fieldName) => {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') throw new Error(`${fieldName} must be a UUID string or null`);
  const trimmed = value.trim();
  if (trimmed === '' || trimmed.toUpperCase() === 'UUID') return null;
  if (!UUID_REGEX.test(trimmed)) throw new Error(`${fieldName} must be a UUID or null`);
  return trimmed;
};

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

const normalizeWeekStartDate = (data) => {
  if (data.week_start_date) return getWeekStartDate(data.week_start_date);
  if (data.review_date) return getWeekStartDate(data.review_date);
  return null;
};

const canAccessLead = async (leadId, actor, db = pool) => {
  if (!isBD(actor)) return true;

  const result = await db.query(
    `SELECT 1
     FROM lead_master
     WHERE id = $1
       AND owner = $2
     LIMIT 1`,
    [leadId, actor.id]
  );

  return result.rows.length > 0;
};

exports.addReview = async (data, actor) => {
  const weekStartDate = normalizeWeekStartDate(data);

  if (!data.lead_id) throw new Error('lead_id is required');
  if (!weekStartDate) throw new Error('week_start_date or review_date is required');

  const hasLeadAccess = await canAccessLead(data.lead_id, actor);
  if (!hasLeadAccess) throw new Error('Lead not found');

  const allowedStatuses = new Set(['UPDATED', 'SKIPPED']);
  const reviewStatus = (data.review_status || data.status || 'UPDATED').toUpperCase();
  if (!allowedStatuses.has(reviewStatus)) {
    throw new Error('Invalid review_status (use UPDATED or SKIPPED)');
  }

  const createdBy = normalizeUuidOrNull(actor?.id || data.created_by, 'created_by');

  const upsertReviewSql = `
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
      updated_at = CURRENT_TIMESTAMP
    RETURNING
      id,
      lead_id,
      week_start_date::date AS week_start_date,
      review_status,
      remarks,
      created_by,
      created_at,
      updated_at;
  `;

  const values = [
    data.lead_id,
    weekStartDate,
    reviewStatus,
    data.remarks ?? null,
    createdBy
  ];

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const result = await client.query(upsertReviewSql, values);
    const review = result.rows[0];

    await client.query(
      `UPDATE lead_review_reminders
       SET status = $1,
           sent_at = COALESCE(sent_at, CURRENT_TIMESTAMP)
       WHERE lead_id = $2
         AND week_start_date::date = $3::date
         AND status = 'PENDING'`,
      [reviewStatus, data.lead_id, weekStartDate]
    );

    await client.query('COMMIT');
    return review;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

exports.getReviewsByLead = async (leadId, actor) => {
  const values = [leadId];
  let ownerFilter = '';

  if (isBD(actor)) {
    ownerFilter = 'AND lm.owner = $2';
    values.push(actor.id);
  }

  const result = await pool.query(
    `SELECT
      lr.id,
      lr.lead_id,
      lr.week_start_date::date AS week_start_date,
      lr.review_status,
      lr.remarks,
      lr.created_by,
      lr.created_at,
      lr.updated_at
     FROM lead_reviews lr
     INNER JOIN lead_master lm ON lm.id = lr.lead_id
     WHERE lr.lead_id = $1
       ${ownerFilter}
     ORDER BY lr.week_start_date DESC, lr.updated_at DESC`,
    values
  );

  return result.rows;
};

exports.getPendingReminders = async (userId, weekStartDate, status) => {
  const normalizedWeekStartDate = weekStartDate
    ? getWeekStartDate(String(weekStartDate).slice(0, 10))
    : getWeekStartDate(new Date());

  const normalizedStatus = status ? String(status).trim().toUpperCase() : 'PENDING';

  const result = await pool.query(
    `SELECT
      lm.id AS lead_id,
      lm.company_name,
      lm.contact_person,
      lm.mobile,
      lm.email,
      lm.city,
      lm.region,
      lm.priority,
      lm.status AS lead_status,
      lm.reminder_snooze_until,
      TO_CHAR($2::date, 'YYYY-MM-DD') AS week_start_date,
      (
        SELECT r.status
        FROM lead_review_reminders r
        WHERE r.lead_id = lm.id
          AND r.notified_user_id = $1
          AND r.week_start_date::date = $2::date
          AND r.status = $3
        ORDER BY r.created_at DESC
        LIMIT 1
      ) AS status
     FROM lead_master lm
     LEFT JOIN lead_reviews lr
       ON lr.lead_id = lm.id
      AND lr.week_start_date::date = $2::date
     WHERE lm.owner = $1
       AND lr.id IS NULL
       AND EXISTS (
         SELECT 1
         FROM lead_review_reminders r
         WHERE r.lead_id = lm.id
           AND r.notified_user_id = $1
           AND r.week_start_date::date = $2::date
           AND r.status = $3
       )
     ORDER BY lm.created_at DESC`,
    [userId, normalizedWeekStartDate, normalizedStatus]
  );

  return result.rows;
};
