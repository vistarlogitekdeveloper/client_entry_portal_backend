const pool = require('./config/db');

async function checkUsers() {
  try {
    const res = await pool.query('SELECT id, name, role, fcm_token FROM users WHERE role ILIKE \'%head%\' OR role ILIKE \'%ho%\'');
    console.table(res.rows);
    process.exit(0);
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
}

checkUsers();
