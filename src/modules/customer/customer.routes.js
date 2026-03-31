const express = require('express');
const router = express.Router();

const controller = require('./customer.controller');
const authMiddleware = require('../../middleware/auth.middleware');
const roleMiddleware = require('../../middleware/role.middleware');

// Create customer
router.post('/', authMiddleware, controller.create);

// Get customers (supports optional `search` query)
router.get('/', authMiddleware, controller.getAll);

// Approve customer (ADMIN only)
router.post('/:id/approve', authMiddleware, roleMiddleware(['ADMIN']), controller.approve);

module.exports = router;

