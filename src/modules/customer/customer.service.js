const pool = require('../../config/db');
const { isAdmin, isHeadOffice } = require('../../utils/role.utils');

let customerMasterColumns = null;

const getCustomerMasterColumns = async () => {
  if (customerMasterColumns) return customerMasterColumns;
  const r = await pool.query(
    `SELECT column_name
     FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'customer_master'`
  );
  customerMasterColumns = new Set(r.rows.map((row) => row.column_name));
  return customerMasterColumns;
};

const customerReturningClause = (cols) => {
  const datePart = cols.has('lead_rfq_enquiry_date')
    ? 'lead_rfq_enquiry_date'
    : 'NULL::date AS lead_rfq_enquiry_date';
  const activePart = cols.has('is_active') ? 'is_active' : 'TRUE AS is_active';
  return [
    'id',
    'customer_name',
    'person_name',
    'email',
    'mobile',
    datePart,
    'status',
    'approved_by',
    'approved_at',
    activePart,
    'created_at',
    'updated_at',
  ].join(', ');
};

const customerSelectClause = (cols) => {
  const datePart = cols.has('lead_rfq_enquiry_date')
    ? 'lead_rfq_enquiry_date'
    : 'NULL::date AS lead_rfq_enquiry_date';
  const activePart = cols.has('is_active') ? 'is_active' : 'TRUE AS is_active';
  return `id, customer_name, person_name, email, mobile, ${datePart}, status, ${activePart}, created_at, updated_at`;
};

const requireNonEmptyString = (value, field) => {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${field} is required`);
  }
  return value.trim();
};

exports.createCustomer = async (data, actor) => {
  const cols = await getCustomerMasterColumns();
  const customer_name = requireNonEmptyString(data.customer_name, 'customer_name');
  const person_name = requireNonEmptyString(data.person_name, 'person_name');

  const email = data.email ? String(data.email).trim() : null;
  const mobile = data.mobile ? String(data.mobile).trim() : null;
  const lead_rfq_enquiry_date = data.lead_rfq_enquiry_date ?? data.received_created_date ?? null;

  const isAdminUser = actor && isAdmin(actor);
  const status = isAdminUser ? 'APPROVED' : 'PENDING';
  const approved_by = isAdminUser ? actor.id : null;

  const insertCols = [];
  const valueParts = [];
  const queryValues = [];

  const pushParam = (v) => {
    valueParts.push(`$${queryValues.length + 1}`);
    queryValues.push(v);
  };

  insertCols.push('customer_name');
  pushParam(customer_name);
  insertCols.push('person_name');
  pushParam(person_name);
  insertCols.push('email');
  pushParam(email);
  insertCols.push('mobile');
  pushParam(mobile);

  if (cols.has('lead_rfq_enquiry_date')) {
    insertCols.push('lead_rfq_enquiry_date');
    pushParam(lead_rfq_enquiry_date);
  }

  insertCols.push('status');
  pushParam(status);
  insertCols.push('approved_by');
  pushParam(approved_by);

  insertCols.push('approved_at');
  valueParts.push(isAdminUser ? 'CURRENT_TIMESTAMP' : 'NULL');

  if (cols.has('is_active')) {
    insertCols.push('is_active');
    valueParts.push('TRUE');
  }

  const query = `
    INSERT INTO customer_master (${insertCols.join(', ')})
    VALUES (${valueParts.join(', ')})
    RETURNING ${customerReturningClause(cols)}
  `;

  const result = await pool.query(query, queryValues);
  return result.rows[0];
};

exports.getCustomers = async (actor, search) => {
  const cols = await getCustomerMasterColumns();
  let query = `
    SELECT ${customerSelectClause(cols)}
    FROM customer_master
  `;

  const values = [];
  const where = [];

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

  const cols = await getCustomerMasterColumns();

  const query = `
    UPDATE customer_master
    SET status = 'APPROVED',
        approved_by = $1,
        approved_at = CURRENT_TIMESTAMP,
        ${cols.has('is_active') ? 'is_active = TRUE,' : ''}
        updated_at = CURRENT_TIMESTAMP
    WHERE id = $2
    RETURNING ${customerReturningClause(cols)}
  `;

  const result = await pool.query(query, [actor.id, id]);
  return result.rows[0] || null;
};

exports.toggleCustomerActive = async (id, isActive, actor) => {
  if (!isAdmin(actor) && !isHeadOffice(actor)) {
    throw new Error('Only Admin or Head Office can toggle customer status');
  }

  const cols = await getCustomerMasterColumns();
  if (!cols.has('is_active')) {
    throw new Error('customer_master.is_active is not available; migrate the database to use this feature');
  }

  const query = `
    UPDATE customer_master
    SET is_active = CASE WHEN $1::boolean IS NULL THEN NOT is_active ELSE $1::boolean END,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = $2
    RETURNING ${customerReturningClause(cols)};
  `;

  const result = await pool.query(query, [isActive === undefined ? null : isActive, id]);
  return result.rows[0] || null;
};

exports.exportToExcel = async (actor, search) => {
  const xlsx = require('xlsx');

  const customers = await exports.getCustomers(actor, search);

  const data = customers.map((c) => ({
    'Customer Name': c.customer_name,
    'Person Name': c.person_name,
    Email: c.email || 'N/A',
    Mobile: c.mobile || 'N/A',
    'Received Date': c.lead_rfq_enquiry_date ? new Date(c.lead_rfq_enquiry_date).toLocaleDateString() : 'N/A',
    Status: c.status,
    'Is Active': c.is_active ? 'YES' : 'NO',
    'Created At': new Date(c.created_at).toLocaleString(),
  }));

  const worksheet = xlsx.utils.json_to_sheet(data);
  const workbook = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(workbook, worksheet, 'Customers');

  const wscols = [
    { wch: 30 },
    { wch: 25 },
    { wch: 30 },
    { wch: 15 },
    { wch: 15 },
    { wch: 12 },
    { wch: 10 },
    { wch: 20 },
  ];
  worksheet['!cols'] = wscols;

  return xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });
};
