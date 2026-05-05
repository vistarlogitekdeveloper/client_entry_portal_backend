const express = require('express');
const router = express.Router();
const controller = require('./sales_plan.controller');
const authMiddleware = require('../../middleware/auth.middleware');

// GET  /api/sales-plan?year=2026-2027  — Admin sees all, others see own row
router.get('/', authMiddleware, controller.getSheet);

// GET  /api/sales-plan/users           — Admin: list of BD/MANAGER users
router.get('/users', authMiddleware, controller.getSalesUsers);

// PUT  /api/sales-plan/:userId?year=... — Admin: update any user's row
router.put('/:userId', authMiddleware, controller.updateRow);

// DELETE /api/sales-plan/:userId?year=... — Admin: remove a user's row
router.delete('/:userId', authMiddleware, controller.deleteRow);

module.exports = router;
