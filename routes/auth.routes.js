const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const authController = require('../controllers/auth.controller');
const { verifyToken } = require('../middleware/auth');

// Validation rules
const registerValidation = [
  body('username')
    .trim()
    .isLength({ min: 3 })
    .withMessage('Username must be at least 3 characters'),
  body('email').isEmail().withMessage('Please provide a valid email'),
  body('password')
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters'),
  body('full_name').optional().trim(),
];

const loginValidation = [
  body('email').isEmail().withMessage('Please provide a valid email'),
  body('password').notEmpty().withMessage('Password is required'),
];

// Public routes
router.post('/register', registerValidation, authController.register);
router.post('/login', loginValidation, authController.login);

// Protected routes
router.get('/profile', verifyToken, authController.getProfile);
router.put('/profile', verifyToken, authController.updateProfile);
router.put('/change-password', verifyToken, authController.changePassword);

module.exports = router;
