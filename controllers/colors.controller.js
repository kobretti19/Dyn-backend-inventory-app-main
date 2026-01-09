const db = require('../db');

// GET - Get all colors
exports.getAllColors = async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM colors ORDER BY name');
    res.status(200).json({
      success: true,
      count: rows.length,
      data: rows,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// GET - Get color by ID
exports.getColorById = async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM colors WHERE id = ?', [
      req.params.id,
    ]);
    if (rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Color not found' });
    }
    res.status(200).json({ success: true, data: rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// POST - Create color
exports.createColor = async (req, res) => {
  try {
    const { name } = req.body;

    if (!name) {
      return res
        .status(400)
        .json({ success: false, error: 'Name is required' });
    }

    // Check for duplicate name
    const [existing] = await db.query('SELECT id FROM colors WHERE name = ?', [
      name,
    ]);

    if (existing.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'Color name already exists',
      });
    }

    const [result] = await db.query('INSERT INTO colors (name) VALUES (?)', [
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

// PUT - Update color
exports.updateColor = async (req, res) => {
  try {
    const { name } = req.body;

    // Check if color exists
    const [existing] = await db.query('SELECT id FROM colors WHERE id = ?', [
      req.params.id,
    ]);

    if (existing.length === 0) {
      return res.status(404).json({ success: false, error: 'Color not found' });
    }

    // Check for duplicate name (excluding current color)
    if (name) {
      const [duplicate] = await db.query(
        'SELECT id FROM colors WHERE name = ? AND id != ?',
        [name, req.params.id]
      );

      if (duplicate.length > 0) {
        return res.status(400).json({
          success: false,
          error: 'Color name already exists',
        });
      }
    }

    const [result] = await db.query('UPDATE colors SET name = ? WHERE id = ?', [
      name,
      req.params.id,
    ]);

    res.status(200).json({ success: true, data: { id: req.params.id, name } });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// DELETE - Delete color
exports.deleteColor = async (req, res) => {
  try {
    const [result] = await db.query('DELETE FROM colors WHERE id = ?', [
      req.params.id,
    ]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, error: 'Color not found' });
    }
    res
      .status(200)
      .json({ success: true, message: 'Color deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};
