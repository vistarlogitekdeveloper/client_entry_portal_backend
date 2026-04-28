require('dotenv').config();
const { Client } = require('pg');

const sourceUrl = process.env.RENDER_DB_URL;
const targetUrl = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;

if (!sourceUrl) {
  throw new Error('Missing source DB URL. Set RENDER_DB_URL.');
}

const quoteIdent = (value) => `"${String(value).replace(/"/g, '""')}"`;

async function run() {
  console.log('COUNT_CHECK_START');
  const source = new Client({ connectionString: sourceUrl, ssl: { rejectUnauthorized: false } });
  const target = new Client({ connectionString: targetUrl, ssl: { rejectUnauthorized: false } });

  try {
    await source.connect();
    console.log('CONNECTED_SOURCE');
    await target.connect();
    console.log('CONNECTED_TARGET');
    console.log('CONNECTED_BOTH');

    const tableRows = await source.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ORDER BY table_name;
    `);

    for (const { table_name } of tableRows.rows) {
      const sourceCount = (
        await source.query(`SELECT COUNT(*)::int AS count FROM public.${quoteIdent(table_name)};`)
      ).rows[0].count;

      const existsInTarget = (
        await target.query('SELECT to_regclass($1) AS table_ref;', [`public.${table_name}`])
      ).rows[0].table_ref;

      if (!existsInTarget) {
        console.log(`COUNT ${table_name}: source=${sourceCount}, target=MISSING`);
        continue;
      }

      const targetCount = (
        await target.query(`SELECT COUNT(*)::int AS count FROM public.${quoteIdent(table_name)};`)
      ).rows[0].count;

      console.log(`COUNT ${table_name}: source=${sourceCount}, target=${targetCount}`);
    }
  } catch (error) {
    console.error(`COUNT_CHECK_FAIL: ${error.message}`);
    process.exitCode = 1;
  } finally {
    await source.end().catch(() => {});
    await target.end().catch(() => {});
  }
}

run();
