const express = require('express');
const router = express.Router();
const ordersController = require('../controllers/orders.controller');
const { verifyToken, isAdminOrManager } = require('../middleware/auth');

// All routes require authentication
router.use(verifyToken);

// GET routes
router.get('/', ordersController.getAllOrders);
router.get('/my-orders', ordersController.getMyOrders);
router.get('/stats', ordersController.getOrderStats);
router.get('/:id', ordersController.getOrderById);

// POST routes
router.post('/', ordersController.createOrder);

// PUT routes
router.put('/:id', ordersController.updateOrder);
router.put('/:id/status', isAdminOrManager, ordersController.updateOrderStatus);

// DELETE routes
router.delete('/:id', ordersController.deleteOrder);

module.exports = router;
