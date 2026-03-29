const pool = require('../../config/db');

const bcrypt = require('bcrypt');

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

exports.getAllUsersAdmin = async () => {
  const query = `
    SELECT id, name, email, role, created_at
    FROM users
    ORDER BY created_at DESC
  `;
  const result = await pool.query(query);
  return result.rows;
};

exports.createUser = async (data) => {
  const { name, email, password, role } = data;
  
  if (!name || !email || !password || !role) {
    throw new Error('All fields are required');
  }

  const hashedPassword = await bcrypt.hash(password, 10);
  
  const query = `
    INSERT INTO users (name, email, password, role)
    VALUES ($1, $2, $3, $4)
    RETURNING id, name, email, role, created_at
  `;
  
  const values = [name, email, hashedPassword, role];
  const result = await pool.query(query, values);
  return result.rows[0];
};

exports.updateUser = async (id, data) => {
  const { name, email, password, role } = data;
  
  const setParts = [];
  const values = [];
  let i = 1;

  if (name) {
    setParts.push(`name = $${i++}`);
    values.push(name);
  }
  if (email) {
    setParts.push(`email = $${i++}`);
    values.push(email);
  }
  if (role) {
    setParts.push(`role = $${i++}`);
    values.push(role);
  }
  if (password) {
    const hashedPassword = await bcrypt.hash(password, 10);
    setParts.push(`password = $${i++}`);
    values.push(hashedPassword);
  }

  if (setParts.length === 0) {
    throw new Error('No fields provided to update');
  }

  const query = `
    UPDATE users
    SET ${setParts.join(', ')}
    WHERE id = $${i}
    RETURNING id, name, email, role;
  `;
  
  values.push(id);
  const result = await pool.query(query, values);
  return result.rows[0];
};

exports.deleteUser = async (id) => {
  const query = `DELETE FROM users WHERE id = $1 RETURNING id`;
  const result = await pool.query(query, [id]);
  return result.rows[0];
};
