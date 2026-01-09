const express = require('express');
const router = express.Router();
const inventoryController = require('../controllers/inventoryController');
const { verifyToken } = require('../middleware/auth');

// All routes require authentication
router.use(verifyToken);

// GET routes
router.get('/transactions', inventoryController.getAllTransactions);
router.get(
  '/transactions/:partColorId',
  inventoryController.getTransactionsByPartColor
);
router.get('/stats', inventoryController.getInventoryStats);

// POST routes
router.post('/transactions', inventoryController.createTransaction);

module.exports = router;
