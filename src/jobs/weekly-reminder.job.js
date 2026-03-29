const pool = require('../config/db');

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

const localDateKey = (d) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
};

const runWeeklyReminderJob = async () => {
  const weekStartDate = getWeekStartDate(new Date());

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
      'FRIDAY',
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

  const result = await pool.query(insertSql, [weekStartDate]);
  return { weekStartDate, rowCount: result.rowCount };
};

const startWeeklyReminderScheduler = () => {
  const enabled = String(process.env.ENABLE_WEEKLY_REMINDER_SCHEDULER || 'true').toLowerCase() !== 'false';
  if (!enabled) {
    console.log('[weekly-reminder] scheduler disabled by env');
    return;
  }

  let lastRunDate = null;

  const tryRun = async () => {
    const now = new Date();
    const isFriday = now.getDay() === 5;
    if (!isFriday) return;

    const today = localDateKey(now);
    if (lastRunDate === today) return;

    try {
      const result = await runWeeklyReminderJob();
      lastRunDate = today;
      console.log(
        `[weekly-reminder] auto-run success week_start=${result.weekStartDate} rowCount=${result.rowCount}`
      );
    } catch (err) {
      console.error(`[weekly-reminder] auto-run failed: ${err.message}`);
    }
  };

  // Try immediately at startup (if it's Friday), then poll every 30 minutes.
  tryRun();
  setInterval(tryRun, 30 * 60 * 1000);
  console.log('[weekly-reminder] scheduler started (checks every 30 minutes, Friday only)');
};

module.exports = {
  runWeeklyReminderJob,
  startWeeklyReminderScheduler
};

