const db = require('../db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { validationResult } = require('express-validator');

// Register new user
exports.register = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { username, email, password, full_name, role = 'user' } = req.body;

    // Check if user exists
    const [existing] = await db.query(
      'SELECT id FROM users WHERE email = ? OR username = ?',
      [email, username]
    );

    if (existing.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'User with this email or username already exists',
      });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(
      password,
      parseInt(process.env.BCRYPT_ROUNDS) || 10
    );

    // Create user
    const [result] = await db.query(
      'INSERT INTO users (username, email, password, full_name, role) VALUES (?, ?, ?, ?, ?)',
      [username, email, hashedPassword, full_name, role]
    );

    // Generate token
    const token = jwt.sign(
      {
        id: result.insertId,
        username,
        email,
        role,
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    res.status(201).json({
      success: true,
      data: {
        id: result.insertId,
        username,
        email,
        full_name,
        role,
      },
      token,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// Login user
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Find user
    const [users] = await db.query(
      'SELECT id, username, email, password, full_name, role, status FROM users WHERE email = ?',
      [email]
    );

    if (users.length === 0) {
      return res.status(401).json({
        success: false,
        error: 'Invalid email or password',
      });
    }

    const user = users[0];

    // Check if user is active
    if (user.status !== 'active') {
      return res.status(403).json({
        success: false,
        error: 'Account is inactive or suspended',
      });
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.password);

    if (!isValidPassword) {
      return res.status(401).json({
        success: false,
        error: 'Invalid email or password',
      });
    }

    // Update last login
    await db.query('UPDATE users SET last_login = NOW() WHERE id = ?', [
      user.id,
    ]);

    // Generate token
    const token = jwt.sign(
      {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    res.status(200).json({
      success: true,
      data: {
        id: user.id,
        username: user.username,
        email: user.email,
        full_name: user.full_name,
        role: user.role,
      },
      token,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// Get current user profile
exports.getProfile = async (req, res) => {
  try {
    const [users] = await db.query(
      'SELECT id, username, email, full_name, role, status, created_at, last_login FROM users WHERE id = ?',
      [req.user.id]
    );

    if (users.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
      });
    }

    res.status(200).json({
      success: true,
      data: users[0],
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// Update user profile
exports.updateProfile = async (req, res) => {
  try {
    const { full_name, email } = req.body;

    await db.query('UPDATE users SET full_name = ?, email = ? WHERE id = ?', [
      full_name,
      email,
      req.user.id,
    ]);

    res.status(200).json({
      success: true,
      message: 'Profile updated successfully',
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// Change password
exports.changePassword = async (req, res) => {
  try {
    const { old_password, new_password } = req.body;

    // Get current password
    const [users] = await db.query('SELECT password FROM users WHERE id = ?', [
      req.user.id,
    ]);

    if (users.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
      });
    }

    // Verify old password
    const isValidPassword = await bcrypt.compare(
      old_password,
      users[0].password
    );

    if (!isValidPassword) {
      return res.status(401).json({
        success: false,
        error: 'Current password is incorrect',
      });
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(
      new_password,
      parseInt(process.env.BCRYPT_ROUNDS) || 10
    );

    // Update password
    await db.query('UPDATE users SET password = ? WHERE id = ?', [
      hashedPassword,
      req.user.id,
    ]);

    res.status(200).json({
      success: true,
      message: 'Password changed successfully',
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};
