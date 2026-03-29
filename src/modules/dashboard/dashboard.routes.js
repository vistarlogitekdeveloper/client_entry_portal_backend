const express = require('express');
const router = express.Router();
const controller = require('./dashboard.controller');
const authMiddleware = require('../../middleware/auth.middleware');

router.get('/stats', authMiddleware, controller.getStats);
router.get('/region', authMiddleware, controller.getRegion);

module.exports = router;
