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
router.post('/', authMiddleware, bdAndAdmin, controller.create);
router.put('/:id', authMiddleware, bdAndAdmin, controller.update);
router.patch('/:id/status', authMiddleware, bdAndAdmin, controller.updateStatus);
router.delete('/:id', authMiddleware, bdAndAdmin, controller.remove);

module.exports = router;
