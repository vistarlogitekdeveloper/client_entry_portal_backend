const pool = require('../../config/db');
const XLSX = require('xlsx');
const { sendMulticastNotification } = require('../../utils/notification.utils');
const { sendEmail } = require('../../utils/email.utils');
const userService = require('../user/user.service');

const sendInstantHONotification = async (docName, expiryDate) => {
  try {
    const title = 'Near Expiry Alert (Instant)';
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
    agreement_name, 
    vendor_name          = null, 
    agreement_type       = null, 
    start_date           = null, 
    expiry_date, 
    responsible_person   = null, 
    location_project     = null, 
    status               = 'ACTIVE', 
    remarks              = null,
    // optional fields
    customer_id          = null,
    renewal_frequency    = null,
    department           = null,
    // Excel report fields
    project_current_cost = null,
    rent                 = null,
    wh_area_sq_ft        = null,
    lock_in_period       = null,
    notice_period        = null,
    agreement_period     = null,
    yearly_increment     = null
  } = data;
  
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const query = `
      INSERT INTO ho_agreements (
        agreement_name, customer_id, vendor_name, agreement_type, 
        start_date, expiry_date, renewal_frequency, responsible_person, 
        department, location_project, status, remarks, created_by,
        project_current_cost, rent, wh_area_sq_ft, lock_in_period, notice_period, agreement_period, yearly_increment
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
      RETURNING *;
    `;
    const result = await client.query(query, [
      agreement_name, customer_id, vendor_name, agreement_type, 
      start_date, expiry_date, renewal_frequency, responsible_person, 
      department, location_project, (status || 'ACTIVE').toUpperCase(), remarks, creatorId,
      project_current_cost, rent, wh_area_sq_ft, lock_in_period, notice_period, agreement_period, yearly_increment
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
  } else if (filters.expiry_days !== undefined && filters.expiry_days !== null) {
    const days = parseInt(filters.expiry_days);
    if (days === 0) {
      query += ` AND a.expiry_date = (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date`;
    } else if (days === 7) {
      query += ` AND a.expiry_date > (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date 
                 AND a.expiry_date <= (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date + INTERVAL '7 days'`;
    } else if (days === 30) {
      query += ` AND a.expiry_date > (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date + INTERVAL '7 days'
                 AND a.expiry_date <= (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date + INTERVAL '30 days'`;
    } else {
      query += ` AND a.expiry_date >= (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date 
                 AND a.expiry_date <= (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date + CAST($${i} || ' days' AS INTERVAL)`;
    }
    if (days !== 0 && days !== 7 && days !== 30) {
      values.push(filters.expiry_days);
      i++;
    }
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
    vendor_name          = null, 
    agreement_type       = null, 
    start_date           = null, 
    expiry_date, 
    responsible_person   = null, 
    location_project     = null, 
    status               = 'ACTIVE', 
    remarks              = null,
    // optional fields
    customer_id          = null,
    renewal_frequency    = null,
    department           = null,
    // Excel report fields
    project_current_cost = null,
    rent                 = null,
    wh_area_sq_ft        = null,
    lock_in_period       = null,
    notice_period        = null,
    agreement_period     = null,
    yearly_increment     = null
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
      project_current_cost = $13,
      rent = $14,
      wh_area_sq_ft = $15,
      lock_in_period = $16,
      notice_period = $17,
      agreement_period = $18,
      yearly_increment = $19,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = $20
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
    project_current_cost,
    rent,
    wh_area_sq_ft,
    lock_in_period,
    notice_period,
    agreement_period,
    yearly_increment,
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

const ExcelJS = require('exceljs');

exports.exportToExcel = async (filters = {}) => {
  const agreements = await exports.findAll(filters);

  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Agreements');

  // Define columns
  worksheet.columns = [
    { header: 'Sr.No.', key: 'sr_no', width: 7 },
    { header: 'Name of Customer', key: 'customer', width: 28 },
    { header: 'Location', key: 'location', width: 20 },
    { header: 'Agreement Date', key: 'start_date', width: 18 },
    { header: 'Agreement Renewal Date', key: 'expiry_date', width: 22 },
    { header: 'Renewal Status', key: 'status', width: 16 },
    { header: 'Project Current Cost', key: 'project_cost', width: 20 },
    { header: 'Rent', key: 'rent', width: 14 },
    { header: 'WH Area Sq. Ft.', key: 'wh_area', width: 16 },
    { header: 'Lock In Period', key: 'lock_in', width: 14 },
    { header: 'Notice Period', key: 'notice', width: 14 },
    { header: 'Agreement Period', key: 'agreement_period', width: 16 },
    { header: 'Yearly Increment', key: 'yearly_increment', width: 16 },
    { header: 'Remark', key: 'remarks', width: 35 }
  ];

  // Style header row
  worksheet.getRow(1).eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF2E4057' }
    };
    cell.alignment = { horizontal: 'center', wrapText: true };
    cell.border = {
      top: { style: 'thin' },
      left: { style: 'thin' },
      bottom: { style: 'thin' },
      right: { style: 'thin' }
    };
  });

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Add rows
  agreements.forEach((a, index) => {
    const row = worksheet.addRow({
      sr_no: index + 1,
      customer: a.customer_name || a.agreement_name || 'N/A',
      location: a.location_project || 'N/A',
      start_date: a.start_date ? new Date(a.start_date).toLocaleDateString('en-IN') : 'N/A',
      expiry_date: a.expiry_date ? new Date(a.expiry_date).toLocaleDateString('en-IN') : 'N/A',
      status: a.status || 'N/A',
      project_cost: a.project_current_cost != null ? Number(a.project_current_cost) : '',
      rent: a.rent != null ? Number(a.rent) : '',
      wh_area: a.wh_area_sq_ft != null ? Number(a.wh_area_sq_ft) : '',
      lock_in: a.lock_in_period || '',
      notice: a.notice_period || '',
      agreement_period: a.agreement_period || '',
      yearly_increment: a.yearly_increment || '',
      remarks: a.remarks || ''
    });

    let rowColor = null; // default

    if (a.expiry_date) {
      const expiry = new Date(a.expiry_date);
      expiry.setHours(0, 0, 0, 0);
      const diffDays = Math.ceil((expiry - today) / (1000 * 60 * 60 * 24));

      if (a.status?.toUpperCase() === 'EXPIRED' || diffDays < 0) {
        // Red for expired
        rowColor = 'FFFFCDD2'; // light red
      } else if (diffDays <= 30) {
        // Yellow for expiring in 30 days
        rowColor = 'FFFFF9C4'; // light yellow
      }
    }

    // Apply color and alignment to all cells in the row
    row.eachCell((cell) => {
      cell.alignment = { vertical: 'middle', wrapText: true };
      cell.border = {
        top: { style: 'hair' },
        left: { style: 'hair' },
        bottom: { style: 'hair' },
        right: { style: 'hair' }
      };
      if (rowColor) {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: rowColor }
        };
      }
    });
  });

  worksheet.views = [
    { state: 'frozen', xSplit: 0, ySplit: 1 }
  ];

  return worksheet.workbook.xlsx.writeBuffer();
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

exports.deleteFile = async (fileId) => {
  const query = 'DELETE FROM ho_agreement_files WHERE id = $1 RETURNING id';
  const result = await pool.query(query, [fileId]);
  return result.rows[0];
};

