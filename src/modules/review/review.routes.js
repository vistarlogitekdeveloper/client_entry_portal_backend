const express = require('express');
const router = express.Router();
const controller = require('./review.controller');
const authMiddleware = require('../../middleware/auth.middleware');

router.post('/', authMiddleware, controller.add);
router.get('/reminders', authMiddleware, controller.getReminders);
router.get('/:leadId', authMiddleware, controller.getByLead);

module.exports = router;
