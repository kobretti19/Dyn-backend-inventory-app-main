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
    version: '2.0.0',
    features: [
      'User Authentication',
      'Parts Management',
      'Equipment Tracking',
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

// Import routes
const authRoutes = require('./routes/auth.routes');
const brandsRoutes = require('./routes/brands.routes');
const categoriesRoutes = require('./routes/categories.routes');
const colorsRoutes = require('./routes/colors.routes');
const partsRoutes = require('./routes/parts.routes');
const partsCategoriesRoutes = require('./routes/parts_categories.routes');
const equipmentRoutes = require('./routes/equipment.routes');
const equipmentPartsRoutes = require('./routes/equipment_parts.routes');
const partsColorsRoutes = require('./routes/parts_colors.routes');
const ordersRoutes = require('./routes/orders.routes');
const stockRoutes = require('./routes/stock.routes');
const inventoryRoutes = require('./routes/inventory.routes');
const equipmentTemplatesRoutes = require('./routes/equipmentTemplates.routes');

// API Routes
// Auth routes (public)
app.use('/api/auth', authRoutes);

// Protected routes (require authentication)
app.use('/api/brands', brandsRoutes);
app.use('/api/categories', categoriesRoutes);
app.use('/api/colors', colorsRoutes);
app.use('/api/parts', partsRoutes);
app.use('/api/parts-categories', partsCategoriesRoutes);
app.use('/api/equipment', equipmentRoutes);
app.use('/api/equipment-parts', equipmentPartsRoutes);
app.use('/api/parts-colors', partsColorsRoutes);
app.use('/api/orders', ordersRoutes);
app.use('/api/stock', stockRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/equipment-templates', equipmentTemplatesRoutes);

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
  console.log('🚀 DYNAVOX Equipment Parts Management API');
  console.log('========================================');
  console.log(`📡 Server: http://localhost:${PORT}`);
  console.log(`🔧 Test: http://localhost:${PORT}/api/test`);
  console.log(`❤️  Health: http://localhost:${PORT}/api/health`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log('========================================');
  console.log('📦 Available Routes:');
  console.log('   🔐 Authentication:');
  console.log('      POST   /api/auth/register');
  console.log('      POST   /api/auth/login');
  console.log('      GET    /api/auth/profile');
  console.log('      PUT    /api/auth/profile');
  console.log('      PUT    /api/auth/change-password');
  console.log('   📋 Management:');
  console.log('      /api/brands');
  console.log('      /api/categories');
  console.log('      /api/colors');
  console.log('      /api/parts');
  console.log('      /api/parts-categories');
  console.log('      /api/parts-colors');
  console.log('      /api/equipment');
  console.log('      /api/equipment-parts');
  console.log('      /api/equipment-templates');
  console.log('   🛒 Orders:');
  console.log('      GET    /api/orders');
  console.log('      GET    /api/orders/my-orders');
  console.log('      GET    /api/orders/stats');
  console.log('      GET    /api/orders/:id');
  console.log('      POST   /api/orders');
  console.log('      PUT    /api/orders/:id');
  console.log('      PUT    /api/orders/:id/status');
  console.log('      DELETE /api/orders/:id');
  console.log('   📦 Stock:');
  console.log('      GET    /api/stock/movements');
  console.log('      GET    /api/stock/levels');
  console.log('      GET    /api/stock/alerts');
  console.log('      POST   /api/stock/add');
  console.log('      POST   /api/stock/adjust');
  console.log('   📋 Templates:');
  console.log('      GET    /api/equipment-templates');
  console.log('      GET    /api/equipment-templates/:id');
  console.log('      POST   /api/equipment-templates');
  console.log('      POST   /api/equipment-templates/from-equipment');
  console.log('      PUT    /api/equipment-templates/:id');
  console.log('      DELETE /api/equipment-templates/:id');
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
