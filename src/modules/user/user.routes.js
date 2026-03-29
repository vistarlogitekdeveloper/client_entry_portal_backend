const express = require('express');
const router = express.Router();
const controller = require('./user.controller');
const authMiddleware = require('../../middleware/auth.middleware');
const roleMiddleware = require('../../middleware/role.middleware');

// Dropdown users (BD + MANAGER only)
router.get('/', authMiddleware, controller.getAllUsers);

// Admin User Management Routes
router.get('/all', authMiddleware, roleMiddleware(['ADMIN']), controller.getAdminUsers);
router.post('/', authMiddleware, roleMiddleware(['ADMIN']), controller.createUser);
router.put('/:id', authMiddleware, roleMiddleware(['ADMIN']), controller.updateUser);
router.delete('/:id', authMiddleware, roleMiddleware(['ADMIN']), controller.deleteUser);

module.exports = router;
