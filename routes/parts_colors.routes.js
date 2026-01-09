const express = require('express');
const router = express.Router();
const partsColorsController = require('../controllers/parts_colors.controller');
const { verifyToken } = require('../middleware/auth');

// All routes require authentication
router.use(verifyToken);

// GET routes
router.get('/', partsColorsController.getAllPartsColors);
router.get('/low-stock', partsColorsController.getLowStockItems);
router.get('/part/:partId', partsColorsController.getColorsByPart);
// POST routes
router.post('/', partsColorsController.addColorToPart);

// PUT/PATCH routes
router.put('/:id', partsColorsController.updatePartColor);
router.patch('/:id/quantity', partsColorsController.updateQuantity);

// DELETE routes
router.delete('/:id', partsColorsController.deletePartColor);

module.exports = router;
