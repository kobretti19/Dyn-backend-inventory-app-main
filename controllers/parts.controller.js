const db = require('../db');

exports.getAllParts = async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT 
        p.id,
        p.name,
        p.description,
        p.price,
        p.purchase_price,
        p.selling_price,
        p.part_category_id,
        pc.name AS category_name,
        p.created_at
      FROM parts p
      LEFT JOIN parts_categories pc ON p.part_category_id = pc.id
      WHERE p.deleted_at IS NULL
      ORDER BY p.name
    `);

    res.status(200).json({
      success: true,
      count: rows.length,
      data: rows,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.getPartsDetailed = async (req, res) => {
  try {
    const query = `
      SELECT 
        p.*,
        pc.name AS category_name
      FROM parts p
      LEFT JOIN parts_categories pc ON p.part_category_id = pc.id
      ORDER BY p.name
    `;
    const [rows] = await db.query(query);
    res.status(200).json({
      success: true,
      count: rows.length,
      data: rows,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.getPartsInventory = async (req, res) => {
  try {
    const query = `
      SELECT 
        p.id AS part_id,
        p.name AS part_name,
        pc.name AS category_name,
        c.id AS color_id,
        c.name AS color_name,
        pcolors.quantity,
        pcolors.sku
      FROM parts p
      LEFT JOIN parts_categories pc ON p.part_category_id = pc.id
      LEFT JOIN parts_colors pcolors ON p.id = pcolors.part_id
      LEFT JOIN colors c ON pcolors.color_id = c.id
      ORDER BY p.name, c.name
    `;
    const [rows] = await db.query(query);
    res.status(200).json({
      success: true,
      count: rows.length,
      data: rows,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.getPartById = async (req, res) => {
  try {
    const query = `
      SELECT 
        p.*,
        pc.name AS category_name
      FROM parts p
      LEFT JOIN parts_categories pc ON p.part_category_id = pc.id
      WHERE p.id = ?
    `;
    const [rows] = await db.query(query, [req.params.id]);
    if (rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Part not found' });
    }
    res.status(200).json({ success: true, data: rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.getPartsByCategory = async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT * FROM parts WHERE part_category_id = ? ORDER BY name',
      [req.params.categoryId]
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

exports.getPartsByStatus = async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT * FROM parts WHERE status = ? ORDER BY name',
      [req.params.status]
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

// POST - Create part
exports.createPart = async (req, res) => {
  try {
    const {
      name,
      description,
      price,
      purchase_price,
      selling_price,
      part_category_id,
    } = req.body;

    if (!name) {
      return res.status(400).json({
        success: false,
        error: 'Part name is required',
      });
    }

    const [result] = await db.query(
      'INSERT INTO parts (name, description, price, purchase_price, selling_price, part_category_id) VALUES (?, ?, ?, ?, ?, ?)',
      [
        name,
        description,
        price || 0,
        purchase_price || 0,
        selling_price || 0,
        part_category_id,
      ]
    );

    res.status(201).json({
      success: true,
      data: {
        id: result.insertId,
        name,
        description,
        price,
        purchase_price,
        selling_price,
        part_category_id,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// PUT - Update part
exports.updatePart = async (req, res) => {
  try {
    const {
      name,
      description,
      price,
      purchase_price,
      selling_price,
      part_category_id,
    } = req.body;

    const [result] = await db.query(
      'UPDATE parts SET name = ?, description = ?, price = ?, purchase_price = ?, selling_price = ?, part_category_id = ? WHERE id = ?',
      [
        name,
        description,
        price,
        purchase_price,
        selling_price,
        part_category_id,
        req.params.id,
      ]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        error: 'Part not found',
      });
    }

    res.status(200).json({
      success: true,
      data: {
        id: req.params.id,
        name,
        description,
        price,
        purchase_price,
        selling_price,
        part_category_id,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// DELETE - Soft delete part
exports.deletePart = async (req, res) => {
  try {
    const [result] = await db.query(
      'UPDATE parts SET deleted_at = NOW() WHERE id = ?',
      [req.params.id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        error: 'Part not found',
      });
    }

    res.status(200).json({
      success: true,
      message: 'Part deleted successfully',
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};
