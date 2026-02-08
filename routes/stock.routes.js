const express = require('express');
const router = express.Router();
const stockController = require('../controllers/stock.controller');
const { verifyToken, isAdminOrManager } = require('../middleware/auth');

// All routes require authentication
router.use(verifyToken);

// GET routes
router.get('/movements', stockController.getMovements);
router.get('/movements/:partId', stockController.getMovementsByPart);
router.get('/levels', stockController.getStockLevels);
router.get('/alerts', stockController.getLowStockAlerts);
router.get('/summary', stockController.getSummary);

// POST routes (admin/manager only)
router.post('/add', stockController.addStock);
router.post('/adjust', stockController.adjustStock);

module.exports = router;
