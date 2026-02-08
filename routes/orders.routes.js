const express = require('express');
const router = express.Router();
const ordersController = require('../controllers/orders.controller');
const { verifyToken } = require('../middleware/auth');

router.use(verifyToken);

// GET routes
router.get('/', ordersController.getAll);
router.get('/stats', ordersController.getStats);
router.get('/:id', ordersController.getById);

// POST routes
router.post('/', ordersController.create);

// PUT routes
router.put('/:id/status', ordersController.updateStatus);

// DELETE routes
router.delete('/:id', ordersController.delete);

module.exports = router;
