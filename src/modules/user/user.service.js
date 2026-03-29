const pool = require('../../config/db');

exports.getUsers = async (search) => {
  const values = ['BD', 'MANAGER'];
  let query = `
    SELECT id, name
    FROM users
    WHERE role IN ($1, $2)
  `;

  if (search) {
    query += ` AND name ILIKE $3`;
    values.push(`%${search}%`);
  }

  query += ` ORDER BY name ASC`;

  const result = await pool.query(query, values);
  return result.rows;
};

