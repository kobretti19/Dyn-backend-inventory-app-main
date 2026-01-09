const express = require('express');
const router = express.Router();
const categoriesController = require('../controllers/categories.controller');

// GET routes
router.get('/', categoriesController.getAllCategories);
router.get('/:id', categoriesController.getCategoryById);

// POST routes
router.post('/', categoriesController.createCategory);

// PUT routes
router.put('/:id', categoriesController.updateCategory);

// DELETE routes
router.delete('/:id', categoriesController.deleteCategory);

module.exports = router;
