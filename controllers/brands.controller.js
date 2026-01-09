const db = require('../db');

// GET - Get all brands
exports.getAllBrands = async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM brands ORDER BY name');
    res.status(200).json({
      success: true,
      count: rows.length,
      data: rows,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// GET - Get brand by ID
exports.getBrandById = async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM brands WHERE id = ?', [
      req.params.id,
    ]);
    if (rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Brand not found' });
    }
    res.status(200).json({ success: true, data: rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// POST - Create brand
exports.createBrand = async (req, res) => {
  try {
    const { name } = req.body;

    if (!name) {
      return res
        .status(400)
        .json({ success: false, error: 'Name is required' });
    }

    // Check for duplicate name
    const [existing] = await db.query('SELECT id FROM brands WHERE name = ?', [
      name,
    ]);

    if (existing.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'Brand name already exists',
      });
    }

    const [result] = await db.query('INSERT INTO brands (name) VALUES (?)', [
      name,
    ]);

    res.status(201).json({
      success: true,
      data: { id: result.insertId, name },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// PUT - Update brand
exports.updateBrand = async (req, res) => {
  try {
    const { name } = req.body;

    // Check if brand exists
    const [existing] = await db.query('SELECT id FROM brands WHERE id = ?', [
      req.params.id,
    ]);

    if (existing.length === 0) {
      return res.status(404).json({ success: false, error: 'Brand not found' });
    }

    // Check for duplicate name (excluding current brand)
    if (name) {
      const [duplicate] = await db.query(
        'SELECT id FROM brands WHERE name = ? AND id != ?',
        [name, req.params.id]
      );

      if (duplicate.length > 0) {
        return res.status(400).json({
          success: false,
          error: 'Brand name already exists',
        });
      }
    }

    const [result] = await db.query('UPDATE brands SET name = ? WHERE id = ?', [
      name,
      req.params.id,
    ]);

    res.status(200).json({ success: true, data: { id: req.params.id, name } });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// DELETE - Delete brand
exports.deleteBrand = async (req, res) => {
  try {
    const [result] = await db.query('DELETE FROM brands WHERE id = ?', [
      req.params.id,
    ]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, error: 'Brand not found' });
    }
    res
      .status(200)
      .json({ success: true, message: 'Brand deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};
