const pool = require('../../config/db');
const { sendMulticastNotification } = require('../../utils/notification.utils');
const { sendEmail } = require('../../utils/email.utils');
const userService = require('../user/user.service');

const sendInstantHONotification = async (docName, expiryDate) => {
  try {
    const title = 'Near Expiry Alert (Certification)';
    const message = `The certification "${docName}" is expiring soon on ${expiryDate}.`;

    // Send Push Notification
    const tokens = await userService.getHeadOfficeTokens();
    if (tokens.length > 0) {
      await sendMulticastNotification(
        tokens,
        title,
        message,
        { type: 'HO_CERTIFICATION_NEAR_EXPIRY', doc_name: docName, expiry_date: expiryDate }
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
    certification_name, 
    certification_type, 
    issuing_authority, 
    location_project, 
    responsible_person, 
    status, 
    issue_date, 
    expiry_date, 
    remarks,
    customer_id = null
  } = data;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const query = `
      INSERT INTO ho_certifications (
        certification_name, certification_type, issuing_authority, 
        location_project, responsible_person, status, issue_date, 
        expiry_date, remarks, customer_id, created_by
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *;
    `;
    const result = await client.query(query, [
      certification_name, certification_type, issuing_authority, 
      location_project, responsible_person, (status || 'ACTIVE').toUpperCase(), 
      issue_date, expiry_date, remarks, customer_id, creatorId
    ]);
    const certification = result.rows[0];

    // Check for instant notification (within 7 days)
    const expiry = new Date(expiry_date);
    const today = new Date();
    const diffDays = Math.ceil((expiry - today) / (1000 * 60 * 60 * 24));
    
    if (diffDays <= 7) {
      await sendInstantHONotification(certification_name, expiry_date);
    }

    await client.query('COMMIT');
    return certification;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

exports.findAll = async (filters = {}) => {
  let query = `
    SELECT c.*, cust.customer_name 
    FROM ho_certifications c
    LEFT JOIN ho_customers cust ON c.customer_id = cust.id
    WHERE 1=1
  `;
  const values = [];
  let i = 1;

  if (filters.search) {
    query += ` AND (
      c.certification_name ILIKE $${i} OR 
      cust.customer_name ILIKE $${i} OR 
      c.issuing_authority ILIKE $${i} OR 
      c.responsible_person ILIKE $${i} OR 
      c.location_project ILIKE $${i}
    )`;
    values.push(`%${filters.search}%`);
    i++;
  }

  if (filters.status) {
    query += ` AND c.status = $${i}`;
    values.push(filters.status.toUpperCase());
    i++;
  }

  if (filters.expiry_days) {
    query += ` AND c.expiry_date > CURRENT_DATE AND c.expiry_date <= CURRENT_DATE + CAST($${i} || ' days' AS INTERVAL)`;
    values.push(filters.expiry_days);
    i++;
  }

  query += ' ORDER BY c.expiry_date ASC';
  const result = await pool.query(query, values);
  return result.rows;
};

exports.findOne = async (id) => {
  const query = `
    SELECT c.*, cust.customer_name 
    FROM ho_certifications c
    LEFT JOIN ho_customers cust ON c.customer_id = cust.id
    WHERE c.id = $1
  `;
  const result = await pool.query(query, [id]);
  return result.rows[0];
};

exports.update = async (id, data) => {
  const { 
    certification_name, 
    certification_type, 
    issuing_authority, 
    location_project, 
    responsible_person, 
    status, 
    issue_date, 
    expiry_date, 
    remarks,
    customer_id = null
  } = data;

  const query = `
    UPDATE ho_certifications
    SET 
      certification_name = $1, 
      certification_type = $2, 
      issuing_authority = $3, 
      location_project = $4, 
      responsible_person = $5, 
      status = $6, 
      issue_date = $7, 
      expiry_date = $8, 
      remarks = $9, 
      customer_id = $10,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = $11
    RETURNING *;
  `;
  const result = await pool.query(query, [
    certification_name, certification_type, issuing_authority, 
    location_project, responsible_person, (status || 'ACTIVE').toUpperCase(), 
    issue_date, expiry_date, remarks, customer_id, id
  ]);
  
  if (result.rows[0]) {
    const expiry = new Date(expiry_date);
    const today = new Date();
    const diffDays = Math.ceil((expiry - today) / (1000 * 60 * 60 * 24));
    if (diffDays <= 7) {
      await sendInstantHONotification(certification_name, expiry_date);
    }
  }
  
  return result.rows[0];
};

exports.delete = async (id) => {
  const query = 'DELETE FROM ho_certifications WHERE id = $1 RETURNING *';
  const result = await pool.query(query, [id]);
  return result.rows[0];
};

exports.addFile = async (certificationId, fileName, fileType, fileData) => {
  const query = `
    INSERT INTO ho_certification_files (certification_id, file_name, file_type, file_data)
    VALUES ($1, $2, $3, $4)
    RETURNING id, certification_id, file_name, file_type, created_at;
  `;
  const result = await pool.query(query, [certificationId, fileName, fileType, fileData]);
  return result.rows[0];
};

exports.getFileData = async (fileId) => {
  const query = 'SELECT file_data, file_name, file_type FROM ho_certification_files WHERE id = $1';
  const result = await pool.query(query, [fileId]);
  return result.rows[0];
};

exports.getFiles = async (certificationId) => {
  const query = 'SELECT id, certification_id, file_name, file_type, created_at FROM ho_certification_files WHERE certification_id = $1 ORDER BY created_at DESC';
  const result = await pool.query(query, [certificationId]);
  return result.rows;
};
