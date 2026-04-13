const service = require('./ho_agreement.service');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Use UPLOAD_DIR env var if set (e.g. Render persistent disk mount), else fall back to project root
const uploadDir = process.env.UPLOAD_DIR
  ? path.join(process.env.UPLOAD_DIR, 'agreements')
  : path.join(process.cwd(), 'uploads', 'agreements');

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Multer storage config
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const fileFilter = (req, file, cb) => {
  const allowedTypes = ['.pdf', '.xlsx', '.xls', '.jpg', '.jpeg', '.png'];
  const ext = path.extname(file.originalname).toLowerCase();
  if (allowedTypes.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only PDF, Excel, and Images are allowed.'));
  }
};

exports.upload = multer({ storage, fileFilter });

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
    if (!data) return res.status(404).json({ success: false, message: 'Agreement not found' });
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.update = async (req, res) => {
  try {
    const data = await service.update(req.params.id, req.body);
    if (!data) return res.status(404).json({ success: false, message: 'Agreement not found' });
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.delete = async (req, res) => {
  try {
    const data = await service.delete(req.params.id);
    if (!data) return res.status(404).json({ success: false, message: 'Agreement not found' });
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

    const agreementId = req.params.id;
    const results = [];
    for (const file of req.files) {
      // Store as a publicly accessible URL path so Flutter can use it directly
      const relativePath = `uploads/agreements/${file.filename}`;
      const fileRecord = await service.addFile(agreementId, relativePath, file.originalname, file.mimetype);
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
