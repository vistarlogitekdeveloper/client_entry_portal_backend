require('dotenv').config();
const { runLeadReportJob } = require('../src/jobs/lead-report.job');

async function trigger() {
  console.log('🚀 Manually triggering the Weekly Lead Report...');
  try {
    await runLeadReportJob();
    console.log('✅ Manual trigger finished successfully.');
  } catch (err) {
    console.error('❌ Manual trigger failed:', err.message);
  } finally {
    process.exit(0);
  }
}

trigger();
