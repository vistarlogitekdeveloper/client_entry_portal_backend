const pool = require('../../config/db');
const { sendMulticastNotification } = require('../../utils/notification.utils');
const { sendEmail } = require('../../utils/email.utils');
const userService = require('../user/user.service');

const sendInstantHONotification = async (docName, expiryDate) => {
  try {
    const title = 'Near Expiry Alert (Cost Sheet)';
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
  const { sheet_name, expiry_date } = data;
  const query = `
    INSERT INTO ho_cost_sheets (sheet_name, expiry_date, created_by)
    VALUES ($1, $2, $3)
    RETURNING *;
  `;
  const result = await pool.query(query, [sheet_name, expiry_date, creatorId]);
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
  let query = 'SELECT * FROM ho_cost_sheets WHERE 1=1';
  const values = [];
  let i = 1;

  if (filters.search) {
    query += ` AND sheet_name ILIKE $${i}`;
    values.push(`%${filters.search}%`);
    i++;
  }

  if (filters.status) {
    query += ` AND status = $${i}`;
    values.push(filters.status);
    i++;
  }

  if (filters.expiry_days) {
    query += ` AND expiry_date > CURRENT_DATE AND expiry_date <= CURRENT_DATE + CAST($${i} || ' days' AS INTERVAL)`;
    values.push(filters.expiry_days);
    i++;
  }

  query += ' ORDER BY expiry_date ASC';
  const result = await pool.query(query, values);
  return result.rows;
};

exports.findOne = async (id) => {
  const query = 'SELECT * FROM ho_cost_sheets WHERE id = $1';
  const result = await pool.query(query, [id]);
  return result.rows[0];
};

exports.update = async (id, data) => {
  const { sheet_name, expiry_date, status } = data;
  const query = `
    UPDATE ho_cost_sheets
    SET sheet_name = $1, expiry_date = $2, status = $3, updated_at = CURRENT_TIMESTAMP
    WHERE id = $4
    RETURNING *;
  `;
  const result = await pool.query(query, [sheet_name, expiry_date, status, id]);
  
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
