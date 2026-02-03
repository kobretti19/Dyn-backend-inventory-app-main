const express = require('express');
const router = express.Router();
const partsController = require('../controllers/parts.controller');
const { verifyToken } = require('../middleware/auth');

// router.use(verifyToken);

// GET routes
router.get('/', partsController.getAll);
router.get('/low-stock', partsController.getLowStock);
router.get('/colors', partsController.getColors);
router.get('/categories', partsController.getCategories);
router.get('/category/:category', partsController.getByCategory);
router.get('/suppliers', partsController.getSuppliers);
router.get('/supplier/:supplier', partsController.getBySupplier);
router.get('/color/:color', partsController.getByColor);
router.get('/:id', partsController.getById);

// POST routes
router.post('/', partsController.create);

// PUT routes
router.put('/:id', partsController.update);

// PATCH routes
router.patch('/:id/quantity', partsController.updateQuantity);

// DELETE routes
router.delete('/:id', partsController.delete);

module.exports = router;
