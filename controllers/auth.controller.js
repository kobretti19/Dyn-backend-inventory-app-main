const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const db = require("../db");
const { validationResult } = require("express-validator");

// Register
exports.register = async (req, res) => {
  try {
    // Check validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { loginName, email, password, full_name } = req.body; // Changed from username

    // Check if user exists
    const [existing] = await db.query(
      "SELECT id FROM users WHERE email = ? OR loginName = ?",
      [email, loginName], // Changed from username
    );
    if (existing.length > 0) {
      return res.status(400).json({
        success: false,
        error: "Email or login name already registered",
      });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    const [result] = await db.query(
      `INSERT INTO users (email, password, full_name, loginName, userType) 
       VALUES (?, ?, ?, ?, 'employee')`,
      [email, hashedPassword, full_name || loginName, loginName], // Changed from username
    );

    const token = jwt.sign(
      { id: result.insertId, email, userType: "employee" },
      process.env.JWT_SECRET,
      { expiresIn: "7d" },
    );

    res.status(201).json({
      success: true,
      token,
      user: {
        id: result.insertId,
        email,
        full_name: full_name || loginName,
        loginName,
        userType: "employee",
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// Login
exports.login = async (req, res) => {
  try {
    // Check validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { email, password } = req.body;

    // Find user
    const [users] = await db.query(
      `SELECT id, email, password, full_name, userType, company, nick, name, 
              address, zip, city, contact, tel, url, language, loginName
       FROM users WHERE email = ?`,
      [email],
    );

    if (users.length === 0) {
      return res
        .status(401)
        .json({ success: false, error: "Invalid credentials" });
    }

    const user = users[0];

    // Check password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res
        .status(401)
        .json({ success: false, error: "Invalid credentials" });
    }

    // Generate token
    const token = jwt.sign(
      { id: user.id, email: user.email, userType: user.userType },
      process.env.JWT_SECRET,
      { expiresIn: "7d" },
    );

    // Remove password from response
    delete user.password;

    res.status(200).json({
      success: true,
      token,
      user,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// Get Profile (same as getMe)
exports.getProfile = async (req, res) => {
  try {
    const [users] = await db.query(
      `SELECT id, email, full_name, userType, company, nick, name, 
              address, zip, city, lat, lng, contact, tel, tels, url, language, loginName
       FROM users WHERE id = ?`,
      [req.user.id],
    );

    if (users.length === 0) {
      return res.status(404).json({ success: false, error: "User not found" });
    }

    res.status(200).json({
      success: true,
      data: users[0],
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// Alias for getProfile
exports.getMe = exports.getProfile;

// Update Profile
exports.updateProfile = async (req, res) => {
  try {
    const {
      full_name,
      company,
      nick,
      name,
      address,
      zip,
      city,
      contact,
      tel,
      url,
      language,
    } = req.body;

    const updates = [];
    const values = [];

    if (full_name) {
      updates.push("full_name = ?");
      values.push(full_name);
    }
    if (company !== undefined) {
      updates.push("company = ?");
      values.push(company);
    }
    if (nick !== undefined) {
      updates.push("nick = ?");
      values.push(nick);
    }
    if (name !== undefined) {
      updates.push("name = ?");
      values.push(name);
    }
    if (address !== undefined) {
      updates.push("address = ?");
      values.push(address);
    }
    if (zip !== undefined) {
      updates.push("zip = ?");
      values.push(zip);
    }
    if (city !== undefined) {
      updates.push("city = ?");
      values.push(city);
    }
    if (contact !== undefined) {
      updates.push("contact = ?");
      values.push(contact);
    }
    if (tel !== undefined) {
      updates.push("tel = ?");
      values.push(tel);
    }
    if (url !== undefined) {
      updates.push("url = ?");
      values.push(url);
    }
    if (language !== undefined) {
      updates.push("language = ?");
      values.push(language);
    }

    if (updates.length === 0) {
      return res
        .status(400)
        .json({ success: false, error: "No fields to update" });
    }

    values.push(req.user.id);

    await db.query(
      `UPDATE users SET ${updates.join(", ")} WHERE id = ?`,
      values,
    );

    // Get updated user
    const [users] = await db.query(
      `SELECT id, email, full_name, userType, company, nick, name, 
              address, zip, city, contact, tel, url, language, loginName
       FROM users WHERE id = ?`,
      [req.user.id],
    );

    res.status(200).json({
      success: true,
      data: users[0],
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// Change Password
exports.changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        error: "Current password and new password are required",
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        error: "New password must be at least 6 characters",
      });
    }

    // Get current user with password
    const [users] = await db.query(
      "SELECT id, password FROM users WHERE id = ?",
      [req.user.id],
    );

    if (users.length === 0) {
      return res.status(404).json({ success: false, error: "User not found" });
    }

    // Check current password
    const isMatch = await bcrypt.compare(currentPassword, users[0].password);
    if (!isMatch) {
      return res
        .status(401)
        .json({ success: false, error: "Current password is incorrect" });
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update password
    await db.query("UPDATE users SET password = ? WHERE id = ?", [
      hashedPassword,
      req.user.id,
    ]);

    res.status(200).json({
      success: true,
      message: "Password changed successfully",
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};
