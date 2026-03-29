const express = require('express');
const router = express.Router();
const controller = require('./user.controller');
const authMiddleware = require('../../middleware/auth.middleware');

// Dropdown users (BD + MANAGER only)
router.get('/', authMiddleware, controller.getAllUsers);

module.exports = router;

