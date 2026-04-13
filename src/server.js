require('dotenv').config();
const app = require('./app');
const initDb = require('./config/initDb');
const { startWeeklyReminderScheduler } = require('./jobs/weekly-reminder.job');
const { startHOScheduler } = require('./jobs/ho-expiry-reminder.job');

const PORT = process.env.PORT || 5000;

initDb()
  .catch((err) => console.error('⚠️ DB init error (continuing anyway):', err.message))
  .finally(() => {
    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
      startWeeklyReminderScheduler();
      startHOScheduler();
    });
  });
