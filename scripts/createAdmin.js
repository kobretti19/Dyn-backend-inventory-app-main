const bcrypt = require('bcryptjs');
const db = require('../db');
require('dotenv').config();

async function createAdmin() {
  try {
    const username = 'admin';
    const email = 'admin@dynavox.com';
    const password = 'admin123'; // Change this!
    const full_name = 'System Administrator';

    // Check if admin exists
    const [existing] = await db.query(
      'SELECT id FROM users WHERE email = ? OR username = ?',
      [email, username]
    );

    if (existing.length > 0) {
      console.log('❌ Admin user already exists!');
      process.exit(0);
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create admin
    const [result] = await db.query(
      'INSERT INTO users (username, email, password, full_name, role, status) VALUES (?, ?, ?, ?, ?, ?)',
      [username, email, hashedPassword, full_name, 'admin', 'active']
    );

    console.log('✅ Admin user created successfully!');
    console.log('========================================');
    console.log('Username:', username);
    console.log('Email:', email);
    console.log('Password:', password);
    console.log('Role: admin');
    console.log('========================================');
    console.log('⚠️  IMPORTANT: Change the password after first login!');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error creating admin:', error.message);
    process.exit(1);
  }
}

createAdmin();
