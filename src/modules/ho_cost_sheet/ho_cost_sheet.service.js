const pool = require('../../config/db');
const XLSX = require('xlsx');
const { sendMulticastNotification } = require('../../utils/notification.utils');
const { sendEmail } = require('../../utils/email.utils');
const userService = require('../user/user.service');

const sendInstantHONotification = async (docName, expiryDate) => {
  try {
    const title = 'Near Expiry Alert (Instant - Cost Sheet)';
    const message = `The cost sheet "${docName}" is expiring soon on ${expiryDate}.`;

    // Send Push Notification
    const tokens = await userService.getHeadOfficeTokens();
    if (tokens.length > 0) {
      await sendMulticastNotification(
        tokens,
        title,
        message,
        { type: 'HO_COST_SHEET_NEAR_EXPIRY', doc_name: docName, expiry_date: expiryDate }
      );
    }

    // Send Email Notification (Consistent with Daily Alerts)
    const toRecipients = ['manager.commercial@vistarlogitek.com'];
    const ccRecipients = [
      'prashant.tamhankar@vistarlogitek.com',
      'Flutter.developer@vistarlogitek.com'
    ];

    await sendEmail(toRecipients, title, message, null, ccRecipients);
  } catch (err) {
    console.error('Failed to send instant HO notification:', err.message);
  }
};

exports.create = async (data, creatorId) => {
  const { 
    sheet_name, 
    customer_id                = null, 
    project_name               = null, 
    effective_date             = null, 
    expiry_date, 
    wage_revision_applicable   = null, 
    min_wage_revision_date     = null, 
    billing_rate_revision_date = null, 
    approval_status            = null, 
    responsible_person         = null, 
    status                     = 'ACTIVE', 
    remarks                    = null,
    yearly_increment           = null
  } = data;

  const query = `
    INSERT INTO ho_cost_sheets (
      sheet_name, customer_id, project_name, effective_date, 
      expiry_date, wage_revision_applicable, min_wage_revision_date, 
      billing_rate_revision_date, approval_status, responsible_person, 
      status, remarks, created_by, yearly_increment
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
    RETURNING *;
  `;
  const result = await pool.query(query, [
    sheet_name, customer_id, project_name, effective_date, 
    expiry_date, wage_revision_applicable, min_wage_revision_date, 
    billing_rate_revision_date, approval_status, responsible_person, 
    status ? status.toUpperCase() : 'ACTIVE', remarks, creatorId, yearly_increment
  ]);
  const sheet = result.rows[0];

  // Check for instant notification (within 7 days)
  const expiry = new Date(expiry_date);
  const today = new Date();
  const diffDays = Math.ceil((expiry - today) / (1000 * 60 * 60 * 24));
  
  if (diffDays <= 7) {
    await sendInstantHONotification(sheet_name, expiry_date);
  }

  return sheet;
};

exports.findAll = async (filters = {}) => {
  let query = `
    SELECT s.*, c.customer_name 
    FROM ho_cost_sheets s
    LEFT JOIN ho_customers c ON s.customer_id = c.id
    WHERE 1=1
  `;
  const values = [];
  let i = 1;

  if (filters.search) {
    query += ` AND (
      s.sheet_name ILIKE $${i} OR 
      c.customer_name ILIKE $${i} OR 
      s.project_name ILIKE $${i} OR 
      s.responsible_person ILIKE $${i}
    )`;
    values.push(`%${filters.search}%`);
    i++;
  }

  if (filters.status) {
    query += ` AND s.status = $${i}`;
    values.push(filters.status.toUpperCase());
    i++;
  }

  if (filters.expiry_days !== undefined && filters.expiry_days !== null) {
    const days = parseInt(filters.expiry_days);
    if (days === 0) {
      query += ` AND s.expiry_date = (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date`;
    } else if (days === 7) {
      query += ` AND s.expiry_date > (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date 
                 AND s.expiry_date <= (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date + INTERVAL '7 days'`;
    } else if (days === 30) {
      query += ` AND s.expiry_date > (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date + INTERVAL '7 days'
                 AND s.expiry_date <= (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date + INTERVAL '30 days'`;
    } else {
      query += ` AND s.expiry_date >= (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date 
                 AND s.expiry_date <= (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date + CAST($${i} || ' days' AS INTERVAL)`;
    }
    if (days !== 0 && days !== 7 && days !== 30) {
      values.push(filters.expiry_days);
      i++;
    }
  }

  query += ' ORDER BY s.expiry_date ASC';
  const result = await pool.query(query, values);
  return result.rows;
};

exports.findOne = async (id) => {
  const query = `
    SELECT s.*, c.customer_name 
    FROM ho_cost_sheets s
    LEFT JOIN ho_customers c ON s.customer_id = c.id
    WHERE s.id = $1
  `;
  const result = await pool.query(query, [id]);
  return result.rows[0];
};

exports.update = async (id, data) => {
  const { 
    sheet_name, 
    customer_id                = null, 
    project_name               = null, 
    effective_date             = null, 
    expiry_date, 
    wage_revision_applicable   = null, 
    min_wage_revision_date     = null, 
    billing_rate_revision_date = null, 
    approval_status            = null, 
    responsible_person         = null, 
    status                     = 'ACTIVE', 
    remarks                    = null,
    yearly_increment           = null
  } = data;

  const query = `
    UPDATE ho_cost_sheets
    SET 
      sheet_name = $1, 
      customer_id = $2, 
      project_name = $3, 
      effective_date = $4, 
      expiry_date = $5, 
      wage_revision_applicable = $6, 
      min_wage_revision_date = $7, 
      billing_rate_revision_date = $8, 
      approval_status = $9, 
      responsible_person = $10, 
      status = $11, 
      remarks = $12,
      yearly_increment = $13,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = $14
    RETURNING *;
  `;
  const result = await pool.query(query, [
    sheet_name, customer_id, project_name, effective_date, 
    expiry_date, wage_revision_applicable, min_wage_revision_date, 
    billing_rate_revision_date, approval_status, responsible_person, 
    status ? status.toUpperCase() : 'ACTIVE', remarks, yearly_increment, id
  ]);
  
  if (result.rows[0]) {
    const expiry = new Date(expiry_date);
    const today = new Date();
    const diffDays = Math.ceil((expiry - today) / (1000 * 60 * 60 * 24));
    if (diffDays <= 7) {
      await sendInstantHONotification(sheet_name, expiry_date);
    }
  }

  return result.rows[0];
};

exports.delete = async (id) => {
  const query = 'DELETE FROM ho_cost_sheets WHERE id = $1 RETURNING *';
  const result = await pool.query(query, [id]);
  return result.rows[0];
};

// File methods
exports.addFile = async (costSheetId, fileName, fileType, fileData) => {
  const query = `
    INSERT INTO ho_cost_sheet_files (cost_sheet_id, file_name, file_type, file_data)
    VALUES ($1, $2, $3, $4)
    RETURNING id, cost_sheet_id, file_name, file_type, created_at;
  `;
  const result = await pool.query(query, [costSheetId, fileName, fileType, fileData]);
  return result.rows[0];
};

exports.getFileData = async (fileId) => {
  const query = 'SELECT file_data, file_name, file_type FROM ho_cost_sheet_files WHERE id = $1';
  const result = await pool.query(query, [fileId]);
  return result.rows[0];
};

exports.getFiles = async (costSheetId) => {
  const query = 'SELECT id, cost_sheet_id, file_name, file_type, created_at FROM ho_cost_sheet_files WHERE cost_sheet_id = $1 ORDER BY created_at DESC';
  const result = await pool.query(query, [costSheetId]);
  return result.rows;
};

exports.deleteFile = async (fileId) => {
  const query = 'DELETE FROM ho_cost_sheet_files WHERE id = $1 RETURNING id';
  const result = await pool.query(query, [fileId]);
  return result.rows[0];
};


exports.exportToExcel = async (filters) => {
  const data = await this.findAll(filters);
  
  const workbookData = data.map(item => ({
    'Sheet Name': item.sheet_name,
    'Customer': item.customer_name || 'N/A',
    'Project': item.project_name || 'N/A',
    'Effective Date': item.effective_date ? new Date(item.effective_date).toLocaleDateString() : 'N/A',
    'Expiry Date': item.expiry_date ? new Date(item.expiry_date).toLocaleDateString() : 'N/A',
    'Wage Revision': item.wage_revision_applicable || 'N/A',
    'Min Wage Rev Date': item.min_wage_revision_date ? new Date(item.min_wage_revision_date).toLocaleDateString() : 'N/A',
    'Bill Rate Rev Date': item.billing_rate_revision_date ? new Date(item.billing_rate_revision_date).toLocaleDateString() : 'N/A',
    'Responsible Person': item.responsible_person || 'N/A',
    'Status': item.status,
    'Yearly Increment': item.yearly_increment || '',
    'Remarks': item.remarks || ''
  }));

  const worksheet = XLSX.utils.json_to_sheet(workbookData);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Cost Sheets');

  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
};
