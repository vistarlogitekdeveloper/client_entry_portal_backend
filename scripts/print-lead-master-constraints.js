require('dotenv').config();

const pool = require('../src/config/db');

(async () => {
  const result = await pool.query(
    `SELECT c.conname,
            pg_get_constraintdef(c.oid) AS def
     FROM pg_constraint c
     JOIN pg_class t ON t.oid = c.conrelid
     WHERE t.relname = 'lead_master'
       AND c.contype = 'c'
     ORDER BY c.conname ASC`
  );

  for (const row of result.rows) {
    console.log(row.conname, row.def);
  }

  await pool.end();
})().catch(async (e) => {
  console.error(e.message);
  try {
    await pool.end();
  } catch {}
  process.exit(1);
});

