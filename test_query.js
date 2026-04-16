const pool = require('./src/config/db');

async function testQuery() {
  console.log('Testing Expiry Query with Creator Email...');
  const query = `
    SELECT 'AGREEMENT' AS doc_type, a.id, a.agreement_name AS name, a.expiry_date, u.email AS creator_email
    FROM ho_agreements a
    LEFT JOIN users u ON a.created_by = u.id
    WHERE a.status = 'ACTIVE' 
    -- Removing date filter for testing so we see any results
    LIMIT 5;
  `;
  try {
    const result = await pool.query(query);
    console.log(`Found ${result.rows.length} agreements:`);
    result.rows.forEach(row => {
      console.log(`- ${row.name} (Creator: ${row.creator_email || 'NONE'})`);
    });
  } catch (error) {
    console.error('❌ Query failed:', error.message);
  } finally {
    pool.end();
  }
}

testQuery();
