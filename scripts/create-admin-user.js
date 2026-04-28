require('dotenv').config();
const bcrypt = require('bcrypt');
const { Client } = require('pg');

async function main() {
  const connectionString = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('Missing DB URL. Set SUPABASE_DB_URL or DATABASE_URL.');
  }

  const email = process.env.ADMIN_EMAIL || 'admin@cliententry.com';
  const name = process.env.ADMIN_NAME || 'Super Admin';
  const tempPassword = process.env.ADMIN_PASSWORD || 'Admin@12345';

  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false }
  });

  await client.connect();
  try {
    const existing = await client.query(
      'SELECT id, email FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1',
      [email]
    );

    if (existing.rowCount > 0) {
      await client.query(
        `UPDATE users
         SET role = $1,
             name = $2,
             updated_at = NOW()
         WHERE id = $3`,
        ['ADMIN', name, existing.rows[0].id]
      );
      console.log(`ADMIN_EXISTS_UPDATED ${existing.rows[0].email}`);
      console.log('PASSWORD_UNCHANGED');
      return;
    }

    const hashedPassword = await bcrypt.hash(tempPassword, 10);
    await client.query(
      `INSERT INTO users (name, email, password, role)
       VALUES ($1, $2, $3, $4)`,
      [name, email, hashedPassword, 'ADMIN']
    );

    console.log(`ADMIN_CREATED ${email}`);
    console.log(`TEMP_PASSWORD ${tempPassword}`);
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(`ADMIN_CREATE_FAIL ${error.message}`);
  process.exit(1);
});
