const pool = require('../../config/db');

exports.create = async (data) => {
  const { customer_name, contact_person, email, mobile, department, status } = data;
  const query = `
    INSERT INTO ho_customers (customer_name, contact_person, email, mobile, department, status)
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING *;
  `;
  const values = [customer_name, contact_person, email, mobile, department, status || 'ACTIVE'];
  const result = await pool.query(query, values);
  return result.rows[0];
};

exports.findAll = async (filters = {}) => {
  let query = 'SELECT * FROM ho_customers WHERE 1=1';
  const values = [];
  let i = 1;

  if (filters.search) {
    query += ` AND (customer_name ILIKE $${i} OR contact_person ILIKE $${i} OR email ILIKE $${i})`;
    values.push(`%${filters.search}%`);
    i++;
  }

  if (filters.department) {
    query += ` AND department = $${i}`;
    values.push(filters.department);
    i++;
  }

  if (filters.status) {
    query += ` AND status = $${i}`;
    values.push(filters.status);
    i++;
  }

  query += ' ORDER BY created_at DESC';
  const result = await pool.query(query, values);
  return result.rows;
};

exports.findOne = async (id) => {
  const query = 'SELECT * FROM ho_customers WHERE id = $1';
  const result = await pool.query(query, [id]);
  return result.rows[0];
};

exports.update = async (id, data) => {
  const { customer_name, contact_person, email, mobile, department, status } = data;
  const query = `
    UPDATE ho_customers
    SET customer_name = $1, contact_person = $2, email = $3, mobile = $4, department = $5, status = $6, updated_at = CURRENT_TIMESTAMP
    WHERE id = $7
    RETURNING *;
  `;
  const values = [customer_name, contact_person, email, mobile, department, status, id];
  const result = await pool.query(query, values);
  return result.rows[0];
};

exports.delete = async (id) => {
  const query = 'DELETE FROM ho_customers WHERE id = $1 RETURNING *';
  const result = await pool.query(query, [id]);
  return result.rows[0];
};
