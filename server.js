const express = require('express');
const cors = require('cors');
const db = require('./db');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use((req, res, next) => {
  console.log(`${req.method} ${req.url} - ${new Date().toISOString()}`);
  next();
});

// Database connection test
db.query('SELECT 1')
  .then(() => console.log('✅ Database connected successfully!'))
  .catch((err) => console.error('❌ Database connection failed:', err.message));

// Test endpoint
app.get('/api/test', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT 1 + 1 AS result');
    res.json({ success: true, message: 'Database connected!', result: rows });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    message: 'DYNAVOX Equipment Parts Management API',
    version: '3.0.0 - Simplified',
    features: [
      'User Authentication',
      'Parts Management (with colors & categories)',
      'Equipment Tracking (with brands)',
      'Order Management',
      'Stock Control',
      'Equipment Templates',
    ],
    documentation: '/api/docs',
  });
});

// Health check
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
  });
});

const authRoutes = require('./routes/auth.routes');
const partsRoutes = require('./routes/parts.routes');
const equipmentRoutes = require('./routes/equipment.routes');
const equipmentTemplatesRoutes = require('./routes/equipmentTemplates.routes');
const ordersRoutes = require('./routes/orders.routes');
const stockRoutes = require('./routes/stock.routes');

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/parts', partsRoutes);
app.use('/api/equipment', equipmentRoutes);
app.use('/api/equipment-templates', equipmentTemplatesRoutes);
app.use('/api/orders', ordersRoutes);
app.use('/api/stock', stockRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Route not found',
    path: req.url,
    method: req.method,
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Error:', err.stack);
  res.status(err.status || 500).json({
    success: false,
    error: err.message || 'Something went wrong!',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
});

// Start server
app.listen(PORT, () => {
  console.log('\n========================================');
  console.log('🚀 DYNAVOX API - SIMPLIFIED SCHEMA');
  console.log('========================================');
  console.log(`📡 Server: http://localhost:${PORT}`);
  console.log(`🔧 Test: http://localhost:${PORT}/api/test`);
  console.log(`❤️  Health: http://localhost:${PORT}/api/health`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log('========================================');
  console.log('📦 Available Routes:');
  console.log('');
  console.log('   🔐 Authentication:');
  console.log('      POST   /api/auth/register');
  console.log('      POST   /api/auth/login');
  console.log('      GET    /api/auth/profile');
  console.log('');
  console.log('   🔧 Parts (includes color, category, prices):');
  console.log('      GET    /api/parts');
  console.log('      GET    /api/parts/:id');
  console.log('      GET    /api/parts/low-stock');
  console.log('      GET    /api/parts/colors        (distinct colors)');
  console.log('      GET    /api/parts/categories    (distinct categories)');
  console.log('      GET    /api/parts/color/:color');
  console.log('      GET    /api/parts/category/:category');
  console.log('      POST   /api/parts');
  console.log('      PUT    /api/parts/:id');
  console.log('      PATCH  /api/parts/:id/quantity');
  console.log('      DELETE /api/parts/:id');
  console.log('');
  console.log('   📦 Equipment (includes brand, category):');
  console.log('      GET    /api/equipment');
  console.log('      GET    /api/equipment/:id');
  console.log('      GET    /api/equipment/brands     (distinct brands)');
  console.log('      GET    /api/equipment/categories (distinct categories)');
  console.log('      POST   /api/equipment');
  console.log('      POST   /api/equipment/:id/parts');
  console.log('      POST   /api/equipment/:id/produce');
  console.log('      PUT    /api/equipment/:id');
  console.log('      DELETE /api/equipment/:id');
  console.log('      DELETE /api/equipment/:id/parts/:partId');
  console.log('');
  console.log('   📋 Equipment Templates:');
  console.log('      GET    /api/equipment-templates');
  console.log('      GET    /api/equipment-templates/:id');
  console.log('      POST   /api/equipment-templates');
  console.log('      POST   /api/equipment-templates/from-equipment');
  console.log('      POST   /api/equipment-templates/:id/create-equipment');
  console.log('      PUT    /api/equipment-templates/:id');
  console.log('      DELETE /api/equipment-templates/:id');
  console.log('');
  console.log('   🛒 Orders:');
  console.log('      GET    /api/orders');
  console.log('      GET    /api/orders/:id');
  console.log('      GET    /api/orders/stats');
  console.log('      POST   /api/orders');
  console.log('      PUT    /api/orders/:id/status');
  console.log('      DELETE /api/orders/:id');
  console.log('');
  console.log('   📊 Stock:');
  console.log('      GET    /api/stock/movements');
  console.log('      GET    /api/stock/movements/:partId');
  console.log('      GET    /api/stock/alerts');
  console.log('      POST   /api/stock/add');
  console.log('      POST   /api/stock/adjust');
  console.log('');
  console.log('========================================');
  console.log('📊 Simplified Schema: 8 tables');
  console.log('   users, parts, equipment, equipment_parts,');
  console.log('   equipment_templates, orders, order_items, stock_movements');
  console.log('========================================\n');
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('⚠️  SIGTERM received, shutting down gracefully...');
  app.close(() => {
    console.log('✅ Server closed');
    db.end();
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('\n⚠️  SIGINT received, shutting down gracefully...');
  process.exit(0);
});
