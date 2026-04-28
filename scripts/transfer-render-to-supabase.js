require('dotenv').config();
const { Client } = require('pg');

const sourceUrl = process.env.RENDER_DB_URL;
const targetUrl = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;

if (!sourceUrl) {
  throw new Error('Missing source DB URL. Set RENDER_DB_URL.');
}

if (!targetUrl) {
  throw new Error('Missing target DB URL. Set SUPABASE_DB_URL (or DATABASE_URL).');
}

const quoteIdent = (value) => `"${String(value).replace(/"/g, '""')}"`;

async function transfer() {
  const source = new Client({
    connectionString: sourceUrl,
    ssl: { rejectUnauthorized: false }
  });
  const target = new Client({
    connectionString: targetUrl,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await source.connect();
    await target.connect();
    console.log('Connected to Render and Supabase');

    const tablesResult = await source.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_type = 'BASE TABLE'
      ORDER BY table_name;
    `);

    const tables = tablesResult.rows.map((row) => row.table_name);
    if (tables.length === 0) {
      console.log('No public tables found in source DB.');
      return;
    }

    console.log(`Found ${tables.length} tables.`);

    await target.query('BEGIN');

    try {
      await target.query("SET session_replication_role = 'replica';");
    } catch (error) {
      console.log('Could not set session_replication_role; proceeding normally.');
    }

    const truncateSQL = `TRUNCATE TABLE ${tables
      .map((name) => `public.${quoteIdent(name)}`)
      .join(', ')} RESTART IDENTITY CASCADE;`;
    await target.query(truncateSQL);
    console.log('Target tables truncated.');

    for (const tableName of tables) {
      const selectSQL = `SELECT * FROM public.${quoteIdent(tableName)};`;
      const rows = (await source.query(selectSQL)).rows;

      if (rows.length === 0) {
        console.log(`${tableName}: 0 rows`);
        continue;
      }

      const columns = Object.keys(rows[0]);
      const columnsSQL = columns.map(quoteIdent).join(', ');
      const batchSize = 200;

      for (let offset = 0; offset < rows.length; offset += batchSize) {
        const batch = rows.slice(offset, offset + batchSize);
        const values = [];
        const params = [];
        let placeholderIndex = 1;

        for (const row of batch) {
          const placeholders = [];
          for (const column of columns) {
            params.push(row[column]);
            placeholders.push(`$${placeholderIndex}`);
            placeholderIndex += 1;
          }
          values.push(`(${placeholders.join(', ')})`);
        }

        const insertSQL = `INSERT INTO public.${quoteIdent(tableName)} (${columnsSQL}) VALUES ${values.join(', ')};`;
        await target.query(insertSQL, params);
      }

      console.log(`${tableName}: ${rows.length} rows copied`);
    }

    try {
      await target.query("SET session_replication_role = 'origin';");
    } catch (error) {
      // Ignore restore failure; transaction completion is still the priority.
    }

    await target.query('COMMIT');
    console.log('TRANSFER_OK');

    const verifyTables = [
      'users',
      'lead_master',
      'customer_master',
      'ho_customers',
      'ho_agreements',
      'ho_cost_sheets',
      'ho_certifications',
      'tasks'
    ].filter((name) => tables.includes(name));

    for (const tableName of verifyTables) {
      const sourceCount = (
        await source.query(`SELECT COUNT(*)::int AS count FROM public.${quoteIdent(tableName)};`)
      ).rows[0].count;
      const targetCount = (
        await target.query(`SELECT COUNT(*)::int AS count FROM public.${quoteIdent(tableName)};`)
      ).rows[0].count;
      console.log(
        `COUNT ${tableName}: source=${sourceCount}, target=${targetCount}, status=${
          sourceCount === targetCount ? 'OK' : 'MISMATCH'
        }`
      );
    }
  } catch (error) {
    try {
      await target.query('ROLLBACK');
    } catch (rollbackError) {
      // Ignore rollback failures after transfer failure.
    }
    console.error(`TRANSFER_FAIL: ${error.message}`);
    process.exitCode = 1;
  } finally {
    await source.end().catch(() => {});
    await target.end().catch(() => {});
  }
}

transfer();
