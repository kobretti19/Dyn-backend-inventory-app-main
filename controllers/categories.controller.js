const db = require('../db');

// GET - Get all categories
exports.getAllCategories = async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM categories ORDER BY name');
    res.status(200).json({
      success: true,
      count: rows.length,
      data: rows,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// GET - Get category by ID
exports.getCategoryById = async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM categories WHERE id = ?', [
      req.params.id,
    ]);
    if (rows.length === 0) {
      return res
        .status(404)
        .json({ success: false, error: 'Category not found' });
    }
    res.status(200).json({ success: true, data: rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// POST - Create category
exports.createCategory = async (req, res) => {
  try {
    const { name, description } = req.body;

    if (!name) {
      return res
        .status(400)
        .json({ success: false, error: 'Name is required' });
    }

    // Check for duplicate name
    const [existing] = await db.query(
      'SELECT id FROM categories WHERE name = ?',
      [name]
    );

    if (existing.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'Category name already exists',
      });
    }

    const [result] = await db.query(
      'INSERT INTO categories (name, description) VALUES (?, ?)',
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

// PUT - Update category
exports.updateCategory = async (req, res) => {
  try {
    const { name, description } = req.body;

    // Check if category exists
    const [existing] = await db.query(
      'SELECT id FROM categories WHERE id = ?',
      [req.params.id]
    );

    if (existing.length === 0) {
      return res
        .status(404)
        .json({ success: false, error: 'Category not found' });
    }

    // Check for duplicate name (excluding current category)
    if (name) {
      const [duplicate] = await db.query(
        'SELECT id FROM categories WHERE name = ? AND id != ?',
        [name, req.params.id]
      );

      if (duplicate.length > 0) {
        return res.status(400).json({
          success: false,
          error: 'Category name already exists',
        });
      }
    }

    const [result] = await db.query(
      'UPDATE categories SET name = ?, description = ? WHERE id = ?',
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

// DELETE - Delete category
exports.deleteCategory = async (req, res) => {
  try {
    const [result] = await db.query('DELETE FROM categories WHERE id = ?', [
      req.params.id,
    ]);
    if (result.affectedRows === 0) {
      return res
        .status(404)
        .json({ success: false, error: 'Category not found' });
    }
    res
      .status(200)
      .json({ success: true, message: 'Category deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};
