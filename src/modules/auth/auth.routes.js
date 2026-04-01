const express = require('express');
const router = express.Router();
const controller = require('./auth.controller');
const authMiddleware = require('../../middleware/auth.middleware');

router.post('/login', controller.login);
router.post('/change-password', authMiddleware, controller.changePassword);

module.exports = router;