const pool = require('./src/config/db');
const service = require('./src/modules/dashboard/dashboard.service');

async function test() {
    try {
        console.log('--- Testing Default (No params, should be All Time) ---');
        // Simulating controller call with no params
        const defaultRes = await service.getDashboardStats({ role: 'ADMIN' }, 0, 0);
        console.log('Total Leads (Default):', defaultRes.kpi.total_leads);
        
        console.log('\n--- Testing Current Month (April 2026) ---');
        const currentRes = await service.getDashboardStats({ role: 'ADMIN' }, 4, 2026);
        console.log('Total Leads (Filtered):', currentRes.kpi.total_leads);
        
        console.log('\n--- KPI Object Structure ---');
        console.log(JSON.stringify(defaultRes.kpi, null, 2));
        
        if (defaultRes.kpi.total_leads === 176 && currentRes.kpi.total_leads === 23 && !defaultRes.kpi.grand_total_leads) {
            console.log('\n✅ Verification Successful!');
        } else {
            console.log('\n❌ Verification Failed.');
            console.log('Default Leads:', defaultRes.kpi.total_leads, '(Expected 176)');
            console.log('Filtered Leads:', currentRes.kpi.total_leads, '(Expected 23)');
            console.log('Grand Total field exists:', !!defaultRes.kpi.grand_total_leads, '(Expected false)');
        }

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

test();
