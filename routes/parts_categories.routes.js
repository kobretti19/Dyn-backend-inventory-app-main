const express = require('express');
const router = express.Router();
const partsCategoriesController = require('../controllers/parts_categories.controller');

// GET routes
router.get('/', partsCategoriesController.getAllPartsCategories);
router.get('/:id', partsCategoriesController.getPartsCategoryById);

// POST routes
router.post('/', partsCategoriesController.createPartsCategory);

// PUT routes
router.put('/:id', partsCategoriesController.updatePartsCategory);

// DELETE routes
router.delete('/:id', partsCategoriesController.deletePartsCategory);

module.exports = router;
