const express = require('express');
const router = express.Router();
const stockController = require('../controllers/stock.controller');
const { verifyToken, isAdminOrManager } = require('../middleware/auth');

// All routes require authentication
router.use(verifyToken);

// GET routes
router.get('/movements', stockController.getAllStockMovements);
router.get(
  '/movements/:partColorId',
  stockController.getStockMovementsByPartColor
);
router.get('/levels', stockController.getStockLevels);
router.get('/alerts', stockController.getLowStockAlerts);

// POST routes (admin/manager only)
router.post('/add', isAdminOrManager, stockController.addStock);
router.post('/adjust', isAdminOrManager, stockController.adjustStock);

module.exports = router;
