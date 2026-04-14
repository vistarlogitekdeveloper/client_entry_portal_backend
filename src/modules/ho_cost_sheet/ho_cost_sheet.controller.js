const service = require('./ho_cost_sheet.service');
const multer = require('multer');
const path = require('path');

// Use memory storage for DB-based file storage
const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  const allowedTypes = ['.pdf', '.xlsx', '.xls', '.jpg', '.jpeg', '.png', '.doc', '.docx'];
  const ext = path.extname(file.originalname).toLowerCase();
  if (allowedTypes.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only PDF, Excel, and Images are allowed.'));
  }
};

exports.upload = multer({ 
  storage, 
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

exports.create = async (req, res) => {
  try {
    const data = await service.create(req.body, req.user.id);
    res.status(201).json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getAll = async (req, res) => {
  try {
    const data = await service.findAll(req.query);
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getOne = async (req, res) => {
  try {
    const data = await service.findOne(req.params.id);
    if (!data) return res.status(404).json({ success: false, message: 'Cost sheet not found' });
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.update = async (req, res) => {
  try {
    const data = await service.update(req.params.id, req.body);
    if (!data) return res.status(404).json({ success: false, message: 'Cost sheet not found' });
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.delete = async (req, res) => {
  try {
    const data = await service.delete(req.params.id);
    if (!data) return res.status(404).json({ success: false, message: 'Cost sheet not found' });
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.uploadFiles = async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ success: false, message: 'No files uploaded' });
    }

    const costSheetId = req.params.id;
    const results = [];
    for (const file of req.files) {
      const fileRecord = await service.addFile(costSheetId, file.originalname, file.mimetype, file.buffer);
      results.push(fileRecord);
    }

    res.json({ success: true, data: results });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getFiles = async (req, res) => {
  try {
    const data = await service.getFiles(req.params.id);
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.viewFile = async (req, res) => {
  try {
    const file = await service.getFileData(req.params.id);
    if (!file) return res.status(404).json({ success: false, message: 'File not found' });

    res.setHeader('Content-Type', file.file_type);
    res.setHeader('Content-Disposition', `inline; filename="${file.file_name}"`);
    res.send(file.file_data);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.exportExcel = async (req, res) => {
  try {
    const buffer = await service.exportToExcel(req.query);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=cost-sheets.xlsx');
    res.send(buffer);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
