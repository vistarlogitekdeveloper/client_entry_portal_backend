require('dotenv').config();
const { runWeeklyReminderEmailJob } = require('../src/jobs/weekly-reminder-email.job');

async function trigger() {
  console.log('🚀 Manually triggering the Weekly Review Reminder Email...');
  try {
    await runWeeklyReminderEmailJob();
    console.log('✅ Manual trigger finished successfully.');
  } catch (err) {
    console.error('❌ Manual trigger failed:', err.message);
  } finally {
    process.exit(0);
  }
}

trigger();
