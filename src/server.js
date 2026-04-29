require('dotenv').config();
const app = require('./app');
const initDb = require('./config/initDb');
const { startWeeklyReminderScheduler } = require('./jobs/weekly-reminder.job');
const { startHOScheduler } = require('./jobs/ho-expiry-reminder.job');
const { startLeadReportScheduler } = require('./jobs/lead-report.job');
const { startWeeklyReminderEmailScheduler } = require('./jobs/weekly-reminder-email.job');

const PORT = process.env.PORT || 5000;

const startSchedulers = () => {
  startWeeklyReminderScheduler();
  startHOScheduler();
  startLeadReportScheduler();
  startWeeklyReminderEmailScheduler();
};

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);

  initDb()
    .catch((err) => console.error('DB init error (continuing anyway):', err.message))
    .finally(startSchedulers);
});
