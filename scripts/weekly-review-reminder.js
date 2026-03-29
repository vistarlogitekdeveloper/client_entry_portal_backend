require('dotenv').config();

const pool = require('../src/config/db');

// Convert current date to Monday-based week start (local time).
const getWeekStartDate = (dateInput) => {
  const d = new Date(dateInput);
  if (Number.isNaN(d.getTime())) throw new Error('Invalid date');

  const day = d.getDay(); // 0 (Sun) ... 6 (Sat)
  const mondayOffset = (day + 6) % 7; // Monday => 0

  const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() - mondayOffset);
  const y = monday.getFullYear();
  const m = String(monday.getMonth() + 1).padStart(2, '0');
  const dd = String(monday.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
};

const reminderDay = 'FRIDAY';
if (process.argv[2] && process.argv[2].toUpperCase() !== 'FRIDAY') {
  console.error('Usage: node scripts/weekly-review-reminder.js FRIDAY');
  process.exit(1);
}

(async () => {
  const weekStartDate = getWeekStartDate(new Date());

  // Missing = no lead_reviews row for that week.
  const selectMissingSql = `
    SELECT
      lm.id AS lead_id,
      lm.owner AS notified_user_id
    FROM lead_master lm
    LEFT JOIN lead_reviews lr
      ON lr.lead_id = lm.id
     AND lr.week_start_date::date = $1::date
    WHERE lr.id IS NULL
      AND lm.owner IS NOT NULL
  `;

  const insertSql = `
    WITH missing AS (
      ${selectMissingSql}
    )
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
      $2,
      lead_id,
      notified_user_id,
      'PENDING',
      NULL
    FROM missing
    ON CONFLICT (week_start_date, lead_id, notified_user_id, reminder_day)
    DO UPDATE SET
      status = 'PENDING',
      sent_at = NULL;
  `;

  try {
    const result = await pool.query(insertSql, [weekStartDate, reminderDay]);
    console.log(
      `[${reminderDay}] week_start_date=${weekStartDate} done rowCount=${result.rowCount}`
    );
  } catch (err) {
    console.error('Reminder job failed:', err.message);
    throw err;
  } finally {
    await pool.end();
  }
})();

