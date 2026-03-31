const express = require('express');
const router = express.Router();
const controller = require('./lead.controller');
const authMiddleware = require('../../middleware/auth.middleware');
const roleMiddleware = require('../../middleware/role.middleware');

router.get('/', authMiddleware, controller.getAll);
router.get('/customers/names', authMiddleware, controller.getUniqueCustomerNames);
router.get('/:id', authMiddleware, controller.getById);
router.post('/', authMiddleware, controller.create);
router.put('/:id', authMiddleware, controller.update);
router.delete('/:id', authMiddleware, roleMiddleware(['ADMIN']), controller.deleteLead);

module.exports = router;
