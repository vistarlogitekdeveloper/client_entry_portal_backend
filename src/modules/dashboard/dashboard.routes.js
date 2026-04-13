const express = require('express');
const router = express.Router();
const controller = require('./dashboard.controller');
const authMiddleware = require('../../middleware/auth.middleware');
const roleMiddleware = require('../../middleware/role.middleware');

router.get('/stats', authMiddleware, controller.getStats);
router.get('/region', authMiddleware, controller.getRegion);
router.get('/summary', authMiddleware, roleMiddleware(['HEAD OFFICE']), controller.getHOSummary);

module.exports = router;
