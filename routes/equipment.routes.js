const express = require('express');
const router = express.Router();
const equipmentController = require('../controllers/equipment.controller');
const { verifyToken } = require('../middleware/auth');

router.use(verifyToken);

// GET routes
router.get('/', equipmentController.getAll);
router.get('/brands', equipmentController.getBrands);
router.get('/categories', equipmentController.getCategories);
router.get('/:id', equipmentController.getById);

// POST routes
router.post('/', equipmentController.create);
router.post('/:id/parts', equipmentController.addPart);
router.post('/:id/produce', equipmentController.produce);

// PUT routes
router.put('/:id', equipmentController.update);

// DELETE routes
router.delete('/:id', equipmentController.delete);
router.delete('/:id/parts/:partId', equipmentController.removePart);

module.exports = router;
