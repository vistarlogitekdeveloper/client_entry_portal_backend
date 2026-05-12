require('dotenv').config();
const app = require('./app');
const pool = require('./config/db');
const initDb = require('./config/initDb');
const { startWeeklyReminderScheduler } = require('./jobs/weekly-reminder.job');
const { startHOScheduler } = require('./jobs/ho-expiry-reminder.job');
const { startLeadReportScheduler } = require('./jobs/lead-report.job');
const { startWeeklyReminderEmailScheduler } = require('./jobs/weekly-reminder-email.job');

const PORT = process.env.PORT || 5000;
const SHOULD_RUN_MIGRATIONS = String(process.env.RUN_MIGRATIONS || 'false').toLowerCase() === 'true';

const startSchedulers = () => {
  startWeeklyReminderScheduler();
  startHOScheduler();
  startLeadReportScheduler();
  startWeeklyReminderEmailScheduler();
};

const prewarmPool = async () => {
  try {
    await pool.query('SELECT 1');
  } catch (err) {
    console.error('DB prewarm failed:', err.message);
  }
};

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);

  prewarmPool();

  const migrationStep = SHOULD_RUN_MIGRATIONS
    ? initDb().catch((err) => console.error('DB init error (continuing anyway):', err.message))
    : Promise.resolve();

  migrationStep.finally(startSchedulers);
});
