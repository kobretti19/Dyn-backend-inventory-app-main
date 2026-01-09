const express = require('express');
const router = express.Router();
const colorsController = require('../controllers/colors.controller');

// GET routes
router.get('/', colorsController.getAllColors);
router.get('/:id', colorsController.getColorById);

// POST routes
router.post('/', colorsController.createColor);

// PUT routes
router.put('/:id', colorsController.updateColor);

// DELETE routes
router.delete('/:id', colorsController.deleteColor);

module.exports = router;
