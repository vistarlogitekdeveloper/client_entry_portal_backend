const express = require('express');
const router = express.Router();
const controller = require('./ho_agreement.controller');
const authMiddleware = require('../../middleware/auth.middleware');
const roleMiddleware = require('../../middleware/role.middleware');

// All HO Agreement routes restricted to HEAD OFFICE role
router.use(authMiddleware, roleMiddleware(['HEAD OFFICE']));

router.post('/', controller.create);
router.get('/', controller.getAll);
router.get('/:id', controller.getOne);
router.put('/:id', controller.update);
router.delete('/:id', controller.delete);

// File handle routes
router.post('/:id/upload', controller.upload.array('files', 10), controller.uploadFiles);
router.get('/:id/files', controller.getFiles);
router.get('/files/:id/view', controller.viewFile);

module.exports = router;
