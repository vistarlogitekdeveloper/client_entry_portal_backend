const express = require('express');
const router = express.Router();

const controller = require('./customer.controller');
const authMiddleware = require('../../middleware/auth.middleware');
const roleMiddleware = require('../../middleware/role.middleware');

// Create customer
router.post('/', authMiddleware, roleMiddleware(['BD', 'MANAGER', 'ADMIN']), controller.create);

// Get customers (supports optional `search` query)
router.get('/', authMiddleware, roleMiddleware(['BD', 'MANAGER', 'ADMIN']), controller.getAll);

// Export customers
router.get('/export', authMiddleware, roleMiddleware(['BD', 'MANAGER', 'ADMIN']), controller.exportExcel);

// Approve customer (ADMIN and MANAGER only)
router.post('/:id/approve', authMiddleware, roleMiddleware(['ADMIN', 'MANAGER']), controller.approve);

// Toggle active status (ADMIN and MANAGER only)
router.put('/:id/toggle-active', authMiddleware, roleMiddleware(['ADMIN', 'MANAGER']), controller.toggleActive);

module.exports = router;

