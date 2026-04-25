const express = require('express');
const router = express.Router();
const controller = require('./task.controller');
const authMiddleware = require('../../middleware/auth.middleware');
const roleMiddleware = require('../../middleware/role.middleware');

const bdAndAdmin = roleMiddleware(['BD', 'ADMIN', 'MANAGER']);

// GET pending count (dashboard badge)
router.get('/pending-count', authMiddleware, bdAndAdmin, controller.pendingCount);

// CRUD
router.get('/', authMiddleware, bdAndAdmin, controller.getAll);
router.post('/', authMiddleware, roleMiddleware(['BD', 'MANAGER']), controller.create);
router.put('/:id', authMiddleware, roleMiddleware(['BD', 'MANAGER']), controller.update);
router.patch('/:id/status', authMiddleware, roleMiddleware(['BD', 'MANAGER']), controller.updateStatus);
router.delete('/:id', authMiddleware, roleMiddleware(['BD', 'MANAGER']), controller.remove);

module.exports = router;
