const pool = require('../../config/db');

const MONTHS = [
  'apr', 'may', 'jun', 'jul', 'aug', 'sep',
  'oct', 'nov', 'dec', 'jan', 'feb', 'mar',
];

/**
 * Upsert a row for (userId, fiscalYear).
 * `data` is an object whose keys may be any of the 24 month columns.
 */
exports.upsertRow = async (userId, fiscalYear, data) => {
  // Build SET clause from allowed month columns only
  const allowed = new Set(
    MONTHS.flatMap((m) => [`${m}_plan`, `${m}_actual`]),
  );

  const setClauses = [];
  const values = [];
  let i = 1;

  for (const [key, val] of Object.entries(data)) {
    if (allowed.has(key)) {
      setClauses.push(`${key} = $${i++}`);
      values.push(val);
    }
  }

  if (setClauses.length === 0) {
    throw new Error('No valid month fields provided.');
  }

  // Always update updated_at
  setClauses.push(`updated_at = NOW()`);

  // Step 1: Ensure the row exists (insert skeleton if missing)
  await pool.query(
    `INSERT INTO sales_plan (user_id, fiscal_year)
     VALUES ($1, $2)
     ON CONFLICT (user_id, fiscal_year) DO NOTHING`,
    [userId, fiscalYear],
  );

  // Step 2: Update only the supplied columns
  values.push(userId, fiscalYear);
  const updateSql = `
    UPDATE sales_plan
    SET ${setClauses.join(', ')}
    WHERE user_id = $${values.length - 1}
      AND fiscal_year = $${values.length}
    RETURNING *
  `;
  const result = await pool.query(updateSql, values);
  return result.rows[0];
};

/**
 * Get all rows for a fiscal year (Admin view).
 * Joins with users table to include name.
 */
exports.getAllForYear = async (fiscalYear) => {
  const result = await pool.query(
    `SELECT sp.*, u.name AS user_name, u.role AS user_role
     FROM sales_plan sp
     JOIN users u ON u.id = sp.user_id
     WHERE sp.fiscal_year = $1
     ORDER BY u.name ASC`,
    [fiscalYear],
  );
  return result.rows;
};

/**
 * Get the row for a specific user in a fiscal year.
 */
exports.getRowForUser = async (userId, fiscalYear) => {
  const result = await pool.query(
    `SELECT sp.*, u.name AS user_name, u.role AS user_role
     FROM sales_plan sp
     JOIN users u ON u.id = sp.user_id
     WHERE sp.user_id = $1 AND sp.fiscal_year = $2`,
    [userId, fiscalYear],
  );
  return result.rows[0] || null;
};

/**
 * Delete a row for (userId, fiscalYear). Returns true if a row was deleted.
 */
exports.deleteRow = async (userId, fiscalYear) => {
  const result = await pool.query(
    `DELETE FROM sales_plan WHERE user_id = $1 AND fiscal_year = $2`,
    [userId, fiscalYear],
  );
  return result.rowCount > 0;
};

/**
 * Get all BD/MANAGER users (for Admin to seed rows or display names).
 */
exports.getSalesUsers = async () => {
  const result = await pool.query(
    `SELECT id, name, role FROM users WHERE role IN ('BD', 'MANAGER', 'ADMIN') ORDER BY name ASC`,
  );
  return result.rows;
};
