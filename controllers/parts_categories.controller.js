const db = require('../db');

// GET - Get all parts categories
exports.getAllPartsCategories = async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT * FROM parts_categories ORDER BY name'
    );
    res.status(200).json({
      success: true,
      count: rows.length,
      data: rows,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// GET - Get parts category by ID
exports.getPartsCategoryById = async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT * FROM parts_categories WHERE id = ?',
      [req.params.id]
    );
    if (rows.length === 0) {
      return res
        .status(404)
        .json({ success: false, error: 'Parts category not found' });
    }
    res.status(200).json({ success: true, data: rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// POST - Create parts category
exports.createPartsCategory = async (req, res) => {
  try {
    const { name, description } = req.body;

    if (!name) {
      return res
        .status(400)
        .json({ success: false, error: 'Name is required' });
    }

    // Check for duplicate name
    const [existing] = await db.query(
      'SELECT id FROM parts_categories WHERE name = ?',
      [name]
    );

    if (existing.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'Parts category name already exists',
      });
    }

    const [result] = await db.query(
      'INSERT INTO parts_categories (name, description) VALUES (?, ?)',
      [name, description]
    );

    res.status(201).json({
      success: true,
      data: { id: result.insertId, name, description },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// PUT - Update parts category
exports.updatePartsCategory = async (req, res) => {
  try {
    const { name, description } = req.body;

    // Check if parts category exists
    const [existing] = await db.query(
      'SELECT id FROM parts_categories WHERE id = ?',
      [req.params.id]
    );

    if (existing.length === 0) {
      return res
        .status(404)
        .json({ success: false, error: 'Parts category not found' });
    }

    // Check for duplicate name (excluding current category)
    if (name) {
      const [duplicate] = await db.query(
        'SELECT id FROM parts_categories WHERE name = ? AND id != ?',
        [name, req.params.id]
      );

      if (duplicate.length > 0) {
        return res.status(400).json({
          success: false,
          error: 'Parts category name already exists',
        });
      }
    }

    const [result] = await db.query(
      'UPDATE parts_categories SET name = ?, description = ? WHERE id = ?',
      [name, description, req.params.id]
    );

    res.status(200).json({
      success: true,
      data: { id: req.params.id, name, description },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// DELETE - Delete parts category
exports.deletePartsCategory = async (req, res) => {
  try {
    const [result] = await db.query(
      'DELETE FROM parts_categories WHERE id = ?',
      [req.params.id]
    );
    if (result.affectedRows === 0) {
      return res
        .status(404)
        .json({ success: false, error: 'Parts category not found' });
    }
    res
      .status(200)
      .json({ success: true, message: 'Parts category deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};
