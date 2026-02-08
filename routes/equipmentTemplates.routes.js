const express = require('express');
const router = express.Router();
const templatesController = require('../controllers/equipmentTemplates.controller');
const { verifyToken } = require('../middleware/auth');

// All routes require authentication
router.use(verifyToken);

// GET all templates
router.get('/', templatesController.getAll);

// GET single template
router.get('/:id', templatesController.getById);

// POST create new template
router.post('/', templatesController.create);

// POST create template from existing equipment (MUST be before /:id routes)
router.post('/from-equipment', templatesController.createFromEquipment);

// POST create equipment from template
router.post('/:id/create-equipment', templatesController.createEquipment);

// PUT update template
router.put('/:id', templatesController.update);

// DELETE template
router.delete('/:id', templatesController.delete);

module.exports = router;
