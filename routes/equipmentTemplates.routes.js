const express = require('express');
const router = express.Router();
const templatesController = require('../controllers/equipmentTemplates.controller');
const { verifyToken } = require('../middleware/auth');

// All routes require authentication
router.use(verifyToken);

// GET all templates
router.get('/', templatesController.getAllTemplates);

// GET single template
router.get('/:id', templatesController.getTemplateById);

// POST create new template
router.post('/', templatesController.createTemplate);

// POST create template from existing equipment
router.post('/from-equipment', templatesController.createFromEquipment);

// PUT update template
router.put('/:id', templatesController.updateTemplate);

// DELETE template
router.delete('/:id', templatesController.deleteTemplate);

module.exports = router;
