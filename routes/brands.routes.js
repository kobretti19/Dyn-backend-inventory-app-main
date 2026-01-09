const express = require('express');
const router = express.Router();
const brandsController = require('../controllers/brands.controller');

// GET routes
router.get('/', brandsController.getAllBrands);
router.get('/:id', brandsController.getBrandById);

// POST routes
router.post('/', brandsController.createBrand);

// PUT routes
router.put('/:id', brandsController.updateBrand);

// DELETE routes
router.delete('/:id', brandsController.deleteBrand);

module.exports = router;
