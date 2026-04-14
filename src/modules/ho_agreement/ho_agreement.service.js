const pool = require('../../config/db');
const XLSX = require('xlsx');
const { sendMulticastNotification } = require('../../utils/notification.utils');
const { sendEmail } = require('../../utils/email.utils');
const userService = require('../user/user.service');

const sendInstantHONotification = async (docName, expiryDate) => {
  try {
    const title = 'Near Expiry Alert';
    const message = `The document "${docName}" is expiring soon on ${expiryDate}.`;

    // Send Push Notification
    const tokens = await userService.getHeadOfficeTokens();
    if (tokens.length > 0) {
      await sendMulticastNotification(
        tokens,
        title,
        message,
        { type: 'HO_NEAR_EXPIRY', doc_name: docName, expiry_date: expiryDate }
      );
    }

    // Send Email Notification
    const emails = await userService.getHeadOfficeEmails();
    if (emails.length > 0) {
      await sendEmail(emails, title, message);
    }
  } catch (err) {
    console.error('Failed to send instant HO notification:', err.message);
  }
};

exports.create = async (data, creatorId) => {
  const { 
    agreement_name, 
    vendor_name, 
    agreement_type, 
    start_date, 
    expiry_date, 
    responsible_person, 
    location_project, 
    status, 
    remarks,
    // optional fields
    customer_id    = null,
    renewal_frequency = null,
    department     = null
  } = data;
  
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const query = `
      INSERT INTO ho_agreements (
        agreement_name, customer_id, vendor_name, agreement_type, 
        start_date, expiry_date, renewal_frequency, responsible_person, 
        department, location_project, status, remarks, created_by
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING *;
    `;
    const result = await client.query(query, [
      agreement_name, customer_id, vendor_name, agreement_type, 
      start_date, expiry_date, renewal_frequency, responsible_person, 
      department, location_project, (status || 'ACTIVE').toUpperCase(), remarks, creatorId
    ]);
    const agreement = result.rows[0];

    // Check for instant notification (within 7 days)
    const expiry = new Date(expiry_date);
    const today = new Date();
    const diffDays = Math.ceil((expiry - today) / (1000 * 60 * 60 * 24));
    
    if (diffDays <= 7) {
      await sendInstantHONotification(agreement_name, expiry_date);
    }

    await client.query('COMMIT');
    return agreement;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

exports.findAll = async (filters = {}) => {
  let query = `
    SELECT a.*, c.customer_name 
    FROM ho_agreements a
    LEFT JOIN ho_customers c ON a.customer_id = c.id
    WHERE 1=1
  `;
  const values = [];
  let i = 1;

  if (filters.search) {
    query += ` AND (
      a.agreement_name ILIKE $${i} OR 
      c.customer_name ILIKE $${i} OR 
      a.vendor_name ILIKE $${i} OR 
      a.responsible_person ILIKE $${i} OR 
      a.department ILIKE $${i} OR 
      a.location_project ILIKE $${i}
    )`;
    values.push(`%${filters.search}%`);
    i++;
  }

  if (filters.department) {
    query += ` AND a.department = $${i}`;
    values.push(filters.department);
    i++;
  }

  if (filters.status) {
    query += ` AND a.status = $${i}`;
    values.push(filters.status);
    i++;
  }

  if (filters.expiry_start && filters.expiry_end) {
    query += ` AND a.expiry_date BETWEEN $${i} AND $${i+1}`;
    values.push(filters.expiry_start, filters.expiry_end);
    i += 2;
  } else if (filters.expiry_days) {
    query += ` AND a.expiry_date > CURRENT_DATE AND a.expiry_date <= CURRENT_DATE + CAST($${i} || ' days' AS INTERVAL)`;
    values.push(filters.expiry_days);
    i++;
  }

  if (filters.vendor_name) {
    query += ` AND a.vendor_name ILIKE $${i}`;
    values.push(`%${filters.vendor_name}%`);
    i++;
  }

  if (filters.responsible_person) {
    query += ` AND a.responsible_person ILIKE $${i}`;
    values.push(`%${filters.responsible_person}%`);
    i++;
  }

  if (filters.location_project) {
    query += ` AND a.location_project ILIKE $${i}`;
    values.push(`%${filters.location_project}%`);
    i++;
  }

  query += ' ORDER BY a.expiry_date ASC';
  const result = await pool.query(query, values);
  return result.rows;
};

exports.findOne = async (id) => {
  const query = `
    SELECT a.*, c.customer_name 
    FROM ho_agreements a
    LEFT JOIN ho_customers c ON a.customer_id = c.id
    WHERE a.id = $1
  `;
  const result = await pool.query(query, [id]);
  return result.rows[0];
};

exports.update = async (id, data) => {
  const { 
    agreement_name, 
    vendor_name, 
    agreement_type, 
    start_date, 
    expiry_date, 
    responsible_person, 
    location_project, 
    status, 
    remarks,
    // optional fields
    customer_id       = null,
    renewal_frequency = null,
    department        = null
  } = data;

  const query = `
    UPDATE ho_agreements
    SET 
      agreement_name = $1, 
      customer_id = $2, 
      vendor_name = $3, 
      agreement_type = $4, 
      start_date = $5, 
      expiry_date = $6, 
      renewal_frequency = $7, 
      responsible_person = $8, 
      department = $9, 
      location_project = $10, 
      status = $11, 
      remarks = $12, 
      updated_at = CURRENT_TIMESTAMP
    WHERE id = $13
    RETURNING *;
  `;
  const result = await pool.query(query, [
    agreement_name, 
    customer_id, 
    vendor_name, 
    agreement_type, 
    start_date, 
    expiry_date, 
    renewal_frequency, 
    responsible_person, 
    department, 
    location_project, 
    (status || 'ACTIVE').toUpperCase(), 
    remarks, 
    id
  ]);
  
  if (result.rows[0]) {
    const expiry = new Date(expiry_date);
    const today = new Date();
    const diffDays = Math.ceil((expiry - today) / (1000 * 60 * 60 * 24));
    if (diffDays <= 7) {
      await sendInstantHONotification(agreement_name, expiry_date);
    }
  }
  
  return result.rows[0];
};

exports.delete = async (id) => {
  const query = 'DELETE FROM ho_agreements WHERE id = $1 RETURNING *';
  const result = await pool.query(query, [id]);
  return result.rows[0];
};

exports.exportToExcel = async (filters = {}) => {
  const agreements = await exports.findAll(filters);

  const data = agreements.map(a => ({
    'Agreement Name': a.agreement_name,
    'Vendor Name': a.vendor_name || 'N/A',
    'Agreement Type': a.agreement_type || 'N/A',
    'Location / Project': a.location_project || 'N/A',
    'Responsible Person': a.responsible_person || 'N/A',
    'Status': a.status,
    'Start Date': a.start_date ? new Date(a.start_date).toLocaleDateString() : 'N/A',
    'Expiry Date': a.expiry_date ? new Date(a.expiry_date).toLocaleDateString() : 'N/A',
    'Remarks': a.remarks || ''
  }));

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(data);

  // Set column widths
  const wscols = [
    { wch: 30 }, // Agreement Name
    { wch: 25 }, // Vendor Name
    { wch: 20 }, // Agreement Type
    { wch: 25 }, // Location / Project
    { wch: 20 }, // Responsible Person
    { wch: 12 }, // Status
    { wch: 15 }, // Start Date
    { wch: 15 }, // Expiry Date
    { wch: 40 }  // Remarks
  ];
  ws['!cols'] = wscols;

  XLSX.utils.book_append_sheet(wb, ws, 'Agreements');
  
  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  return buffer;
};

exports.addFile = async (agreementId, fileName, fileType, fileData) => {
  const query = `
    INSERT INTO ho_agreement_files (agreement_id, file_name, file_type, file_data)
    VALUES ($1, $2, $3, $4)
    RETURNING id, agreement_id, file_name, file_type, created_at;
  `;
  const result = await pool.query(query, [agreementId, fileName, fileType, fileData]);
  return result.rows[0];
};

exports.getFileData = async (fileId) => {
  const query = 'SELECT file_data, file_name, file_type FROM ho_agreement_files WHERE id = $1';
  const result = await pool.query(query, [fileId]);
  return result.rows[0];
};

exports.getFiles = async (agreementId) => {
  const query = 'SELECT id, agreement_id, file_name, file_type, created_at FROM ho_agreement_files WHERE agreement_id = $1 ORDER BY created_at DESC';
  const result = await pool.query(query, [agreementId]);
  return result.rows;
};
