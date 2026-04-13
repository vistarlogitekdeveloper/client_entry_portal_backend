const express = require('express');
const router = express.Router();
const controller = require('./ho_customer.controller');
const authMiddleware = require('../../middleware/auth.middleware');
const roleMiddleware = require('../../middleware/role.middleware');

// All HO Customer routes restricted to HEAD OFFICE role
router.use(authMiddleware, roleMiddleware(['HEAD OFFICE']));

router.post('/', controller.create);
router.get('/', controller.getAll);
router.get('/:id', controller.getOne);
router.put('/:id', controller.update);
router.delete('/:id', controller.delete);

module.exports = router;
