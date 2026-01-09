const express = require('express');
const router = express.Router();
const equipmentController = require('../controllers/equipment.controller');
const { verifyToken } = require('../middleware/auth');

// All routes require authentication
router.use(verifyToken);

// GET routes
router.get('/', equipmentController.getAllEquipment);
router.get('/detailed', equipmentController.getEquipmentDetailed);
router.get('/inventory', equipmentController.getPartsInventory);
router.get('/low-stock', equipmentController.getLowStockAlerts);
router.get('/category/:categoryId', equipmentController.getEquipmentByCategory);
router.get('/brand/:brandId', equipmentController.getEquipmentByBrand);
router.get('/status/:status', equipmentController.getEquipmentByStatus);
router.get('/:id', equipmentController.getEquipmentById);

// POST routes
router.post('/', equipmentController.createEquipment);

// PUT routes
router.put('/:id', equipmentController.updateEquipment);

// DELETE routes
router.delete('/:id', equipmentController.deleteEquipment);

module.exports = router;
