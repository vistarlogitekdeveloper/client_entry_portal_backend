const pool = require('../../config/db');
const { isAdmin, isHeadOffice } = require('../../utils/role.utils');

const requireNonEmptyString = (value, field) => {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${field} is required`);
  }
  return value.trim();
};

exports.createCustomer = async (data, actor) => {
  const customer_name = requireNonEmptyString(data.customer_name, 'customer_name');
  const person_name = requireNonEmptyString(data.person_name, 'person_name');

  const email = data.email ? String(data.email).trim() : null;
  const mobile = data.mobile ? String(data.mobile).trim() : null;
  const lead_rfq_enquiry_date = data.lead_rfq_enquiry_date ?? data.received_created_date ?? null;

  const isAdminUser = actor && isAdmin(actor);
  const status = isAdminUser ? 'APPROVED' : 'PENDING';
  const approved_by = isAdminUser ? actor.id : null;

  const query = `
    INSERT INTO customer_master (
      customer_name,
      person_name,
      email,
      mobile,
      lead_rfq_enquiry_date,
      status,
      approved_by,
      approved_at,
      is_active
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, ${isAdminUser ? 'CURRENT_TIMESTAMP' : 'NULL'}, TRUE)
    RETURNING id, customer_name, person_name, email, mobile, lead_rfq_enquiry_date, status, approved_by, approved_at, is_active, created_at, updated_at
  `;

  const values = [customer_name, person_name, email, mobile, lead_rfq_enquiry_date, status, approved_by];
  const result = await pool.query(query, values);
  return result.rows[0];
};

exports.getCustomers = async (actor, search) => {
  let query = `
    SELECT id, customer_name, person_name, email, mobile, lead_rfq_enquiry_date, status, is_active, created_at, updated_at
    FROM customer_master
  `;

  const values = [];
  const where = [];

  // Non-admin can see APPROVED + PENDING (so they can track pending count).
  // REJECTED stays admin-only.
  if (!isAdmin(actor)) {
    where.push(`status IN ('APPROVED', 'PENDING')`);
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
  if (!isAdmin(actor) && !isHeadOffice(actor)) {
    throw new Error('Only Admin or Head Office can approve customers');
  }

  const query = `
    UPDATE customer_master
    SET status = 'APPROVED',
        approved_by = $1,
        approved_at = CURRENT_TIMESTAMP,
        is_active = TRUE,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = $2
    RETURNING id, customer_name, person_name, email, mobile, lead_rfq_enquiry_date, status, approved_by, approved_at, is_active, created_at, updated_at
  `;

  const result = await pool.query(query, [actor.id, id]);
  return result.rows[0] || null;
};


exports.toggleCustomerActive = async (id, isActive, actor) => {
  if (!isAdmin(actor) && !isHeadOffice(actor)) {
    throw new Error('Only Admin or Head Office can toggle customer status');
  }

  const query = `
    UPDATE customer_master
    SET is_active = CASE WHEN $1::boolean IS NULL THEN NOT is_active ELSE $1::boolean END,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = $2
    RETURNING id, customer_name, person_name, email, mobile, lead_rfq_enquiry_date, status, approved_by, approved_at, is_active, created_at, updated_at;
  `;

  const result = await pool.query(query, [isActive === undefined ? null : isActive, id]);
  return result.rows[0] || null;
};
