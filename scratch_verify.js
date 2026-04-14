const pool = require('./src/config/db');
const service = require('./src/modules/dashboard/dashboard.service');

async function test() {
    try {
        console.log('--- Testing Current Month (April 2026) ---');
        const currentRes = await service.getDashboardStats({ role: 'ADMIN' }, 4, 2026);
        console.log('Total Leads (Filtered):', currentRes.kpi.total_leads);
        console.log('Grand Total Leads:', currentRes.kpi.grand_total_leads);
        
        console.log('\n--- Testing All Time (month=0, year=0) ---');
        const allTimeRes = await service.getDashboardStats({ role: 'ADMIN' }, 0, 0);
        console.log('Total Leads (Unfiltered):', allTimeRes.kpi.total_leads);
        console.log('Grand Total Leads:', allTimeRes.kpi.grand_total_leads);
        
        if (allTimeRes.kpi.total_leads === 176 && currentRes.kpi.total_leads === 23) {
            console.log('\n✅ Verification Successful!');
        } else {
            console.log('\n❌ Verification Failed. Expected 176/23, got ' + allTimeRes.kpi.total_leads + '/' + currentRes.kpi.total_leads);
        }

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

test();
