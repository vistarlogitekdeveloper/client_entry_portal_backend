const pool = require('../../config/db');
const { isAdmin } = require('../../utils/role.utils');

const requireNonEmptyString = (value, field) => {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${field} is required`);
  }
  return value.trim();
};

exports.createCustomer = async (data) => {
  const customer_name = requireNonEmptyString(data.customer_name, 'customer_name');
  const person_name = requireNonEmptyString(data.person_name, 'person_name');

  const email = data.email ? String(data.email).trim() : null;
  const mobile = data.mobile ? String(data.mobile).trim() : null;

  const query = `
    INSERT INTO customer_master (
      customer_name,
      person_name,
      email,
      mobile,
      status
    )
    VALUES ($1, $2, $3, $4, 'PENDING')
    RETURNING id, customer_name, person_name, email, mobile, status, approved_by, approved_at, created_at, updated_at
  `;

  const values = [customer_name, person_name, email, mobile];
  const result = await pool.query(query, values);
  return result.rows[0];
};

exports.getCustomers = async (actor, search) => {
  let query = `
    SELECT id, customer_name, person_name, email, mobile, status, created_at, updated_at
    FROM customer_master
  `;

  const values = [];
  const where = [];

  // Only admin can see PENDING/REJECTED.
  if (!isAdmin(actor)) {
    where.push(`status = 'APPROVED'`);
  }

  if (search) {
    const s = `%${String(search).trim()}%`;
    where.push(`(customer_name ILIKE $${where.length + 1} OR person_name ILIKE $${where.length + 1} OR email ILIKE $${where.length + 1})`);
    values.push(s);
  }

  if (where.length > 0) {
    query += ` WHERE ` + where.join(' AND ');
  }

  query += ` ORDER BY created_at DESC`;

  const result = await pool.query(query, values);
  return result.rows;
};

exports.approveCustomer = async (id, actor) => {
  if (!isAdmin(actor)) {
    throw new Error('Only admin can approve customers');
  }

  const query = `
    UPDATE customer_master
    SET status = 'APPROVED',
        approved_by = $1,
        approved_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = $2
    RETURNING id, customer_name, person_name, email, mobile, status, approved_by, approved_at, created_at, updated_at
  `;

  const result = await pool.query(query, [actor.id, id]);
  return result.rows[0] || null;
};

