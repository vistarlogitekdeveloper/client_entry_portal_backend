const pool = require('../config/db');
const userService = require('../modules/user/user.service');
const { sendPushNotification } = require('../utils/notification.utils');

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
      AND (lm.final_status IS NULL OR lm.final_status NOT IN ('WON', 'LOST'))
      AND (lm.reminder_snooze_until IS NULL OR lm.reminder_snooze_until < CURRENT_DATE)
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
      sent_at = NULL
    RETURNING notified_user_id, lead_id;
  `;

  const result = await pool.query(insertSql, [weekStartDate]);
  const rows = result.rows;

  if (rows.length > 0) {
    // Group leads by owner to send a single notification summarizing their pending items
    const userLeadsMap = {};
    rows.forEach(row => {
      if (!userLeadsMap[row.notified_user_id]) {
        userLeadsMap[row.notified_user_id] = [];
      }
      userLeadsMap[row.notified_user_id].push(row.lead_id);
    });

    for (const userId of Object.keys(userLeadsMap)) {
      try {
        const user = await userService.findOne(userId);
        if (user && user.fcm_token) {
          const count = userLeadsMap[userId].length;
          await sendPushNotification(
            user.fcm_token,
            'Weekly Lead Review Reminder',
            `You have ${count} lead${count > 1 ? 's' : ''} pending review for this week. Please update them.`,
            { type: 'WEEKLY_REMINDER', week_start_date: weekStartDate }
          );

          // Update sent_at for these reminders
          await pool.query(
            `UPDATE lead_review_reminders 
             SET sent_at = CURRENT_TIMESTAMP 
             WHERE week_start_date = $1 AND notified_user_id = $2`,
            [weekStartDate, userId]
          );
        }
      } catch (err) {
        console.error(`Failed to send weekly reminder to user ${userId}:`, err.message);
      }
    }
  }

  return { weekStartDate, rowCount: rows.length };
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

