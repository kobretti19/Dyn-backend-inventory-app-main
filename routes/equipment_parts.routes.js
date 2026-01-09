const express = require('express');
const router = express.Router();
const equipmentPartsController = require('../controllers/equipment_parts.controller');

// GET routes
router.get('/', equipmentPartsController.getAllEquipmentParts);
router.get(
  '/equipment/:equipmentId',
  equipmentPartsController.getPartsByEquipment
);
router.get(
  '/part-color/:partColorId',
  equipmentPartsController.getEquipmentByPart
);

// POST routes
router.post('/', equipmentPartsController.addPartToEquipment);

// PUT routes
router.put('/:id', equipmentPartsController.updateEquipmentPart);

// DELETE routes
router.delete('/:id', equipmentPartsController.deleteEquipmentPart);

module.exports = router;
