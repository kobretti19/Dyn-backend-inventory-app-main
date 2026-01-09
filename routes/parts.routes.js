const express = require('express');
const router = express.Router();
const partsController = require('../controllers/parts.controller');

// GET routes
router.get('/', partsController.getAllParts);
router.get('/detailed', partsController.getPartsDetailed);
router.get('/inventory', partsController.getPartsInventory);
router.get('/status/:status', partsController.getPartsByStatus);
router.get('/category/:categoryId', partsController.getPartsByCategory);
router.get('/:id', partsController.getPartById);

// POST routes
router.post('/', partsController.createPart);

// PUT routes
router.put('/:id', partsController.updatePart);

// DELETE routes
router.delete('/:id', partsController.deletePart);

module.exports = router;
