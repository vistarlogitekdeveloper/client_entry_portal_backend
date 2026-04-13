const express = require('express');
const router = express.Router();
const controller = require('./ho_cost_sheet.controller');
const auth = require('../../middleware/auth.middleware');
const role = require('../../middleware/role.middleware');

// All HO routes are protected by auth and HEAD OFFICE role
router.use(auth, role(['HEAD OFFICE', 'ADMIN']));

router.get('/', controller.getAll);
router.get('/:id', controller.getOne);
router.post('/', controller.create);
router.put('/:id', controller.update);
router.delete('/:id', controller.delete);

// File handle routes
router.post('/:id/upload', controller.upload.array('files', 10), controller.uploadFiles);
router.get('/:id/files', controller.getFiles);
router.get('/files/:id/view', controller.viewFile);

module.exports = router;
