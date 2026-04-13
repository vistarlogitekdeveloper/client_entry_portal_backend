const express = require('express');
const router = express.Router();
const controller = require('./lead.controller');
const authMiddleware = require('../../middleware/auth.middleware');
const roleMiddleware = require('../../middleware/role.middleware');

router.get('/', authMiddleware, roleMiddleware(['BD', 'MANAGER', 'ADMIN']), controller.getAll);
router.get('/customers/names', authMiddleware, roleMiddleware(['BD', 'MANAGER', 'ADMIN']), controller.getUniqueCustomerNames);
router.get('/:id', authMiddleware, roleMiddleware(['BD', 'MANAGER', 'ADMIN']), controller.getById);
router.get('/:id/changes', authMiddleware, roleMiddleware(['BD', 'MANAGER', 'ADMIN']), controller.getChanges);
router.post('/', authMiddleware, roleMiddleware(['BD', 'MANAGER', 'ADMIN']), controller.create);
router.put('/:id', authMiddleware, roleMiddleware(['BD', 'MANAGER', 'ADMIN']), controller.update);
router.delete('/:id', authMiddleware, roleMiddleware(['ADMIN']), controller.deleteLead);

module.exports = router;
