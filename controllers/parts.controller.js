const db = require('../db');

// GET all parts
// GET all parts
exports.getAll = async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT 
        id,
        name,
        color,
        category,
        description,
        sku,
        purchase_price,
        selling_price,
        quantity,
        min_stock_level,
        status,
        article_id,
        supplier,
        created_at,
        updated_at
      FROM parts 
      WHERE deleted_at IS NULL
      ORDER BY name, color
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

// GET single part by ID
exports.getById = async (req, res) => {
  try {
    const [rows] = await db.query(
      `
      SELECT * FROM parts WHERE id = ? AND deleted_at IS NULL`,
      [req.params.id],
    );

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Part not found',
      });
    }

    res.status(200).json({
      success: true,
      data: rows[0],
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// GET low stock parts
exports.getLowStock = async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT * FROM parts
      WHERE quantity <= min_stock_level AND deleted_at IS NULL
      ORDER BY quantity ASC`);
    res.status(200).json({
      success: true,
      count: rows.length,
      data: rows,
    });
  } catch (error) {}
};

// GET distinct colors
exports.getColors = async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT DISTINCT color FROM parts
      WHERE deleted_at IS NULL and color IS NOT NULL
      ORDER BY color ASC
      `);
    res.status(200).json({
      success: true,
      data: rows.map((r) => r.color),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// GET distinct categories
exports.getCategories = async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT DISTINCT category FROM parts
      WHERE deleted_at IS NULL and category IS NOT NULL
      ORDER BY category ASC`);

    res.status(200).json({
      success: true,
      data: rows.map((r) => r.category),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// GET parts by category
exports.getByCategory = async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT * FROM parts
      WHERE category = ? AND deleted_at IS NULL`,
      [req.params.category],
    );
    res.status(200).json({
      success: true,
      count: rows.length,
      data: rows,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// GET parts by color
exports.getByColor = async (req, res) => {
  try {
    const [rows] = await db.query(
      `
      SELECT * FROM parts
      WHERE color = ? AND deleted_at IS NULL
      ORDER BY name ASC`,
      [req.params.color],
    );
    res.status(200).json({
      success: true,
      count: rows.length,
      data: rows,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// GET distinct suppliers (for dropdowns)
exports.getSuppliers = async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT DISTINCT supplier 
      FROM parts 
      WHERE supplier IS NOT NULL AND deleted_at IS NULL
      ORDER BY supplier
    `);

    res.status(200).json({
      success: true,
      data: rows.map((r) => r.supplier),
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// GET parts by supplier
exports.getBySupplier = async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT * FROM parts WHERE supplier = ? AND deleted_at IS NULL ORDER BY name, color',
      [req.params.supplier],
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

// POST create new part
exports.create = async (req, res) => {
  try {
    const {
      name,
      color,
      category,
      description,
      sku,
      purchase_price,
      selling_price,
      quantity,
      min_stock_level = 5,
      article_id,
      supplier,
    } = req.body;

    if (!name) {
      return res.status(400).json({
        success: false,
        message: 'Name is required',
      });
    }
    // Check for duplicate
    const [existing] = await db.query(
      `
      SELECT id FROM parts WHERE name = ? AND color = ? AND deleted_at IS NULL`,
      [name, color || null],
    );
    if (existing.length > 0) {
      return res.status(409).json({
        success: false,
        message: 'Part with the same name and color already exists',
      });
    }
    const [result] = await db.query(
      `
      INSERT INTO parts
      (name, color, category, description, sku, purchase_price, selling_price, quantity, min_stock_level, article_id,supplier)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        name,
        color || null,
        category || null,
        description || null,
        sku || null,
        purchase_price || 0,
        selling_price || 0,
        quantity || 0,
        min_stock_level || 5,
        article_id || null,
        supplier || null,
      ],
    );

    const [created] = await db.query(`SELECT * FROM parts WHERE id = ?`, [
      result.insertId,
    ]);
    res.status(201).json({
      success: true,
      data: created[0],
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// PUT update part
exports.update = async (req, res) => {
  try {
    const {
      name,
      color,
      category,
      description,
      sku,
      purchase_price,
      selling_price,
      quantity,
      min_stock_level,
      article_id,
      supplier,
    } = req.body;

    const [existing] = await db.query(
      'SELECT * FROM parts WHERE id = ? AND deleted_at IS NULL',
      [req.params.id],
    );

    if (existing.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Part not found',
      });
    }

    const part = existing[0];

    await db.query(
      `UPDATE parts SET
        name = ?,
        color = ?,
        category = ?,
        description = ?,
        sku = ?,
        purchase_price = ?,
        selling_price = ?,
        quantity = ?,
        min_stock_level = ?,
        article_id = ?,
        supplier = ?
       WHERE id = ?`,
      [
        name !== undefined ? name : part.name,
        color !== undefined ? color : part.color,
        category !== undefined ? category : part.category,
        description !== undefined ? description : part.description,
        sku !== undefined ? sku : part.sku,
        purchase_price !== undefined ? purchase_price : part.purchase_price,
        selling_price !== undefined ? selling_price : part.selling_price,
        quantity !== undefined ? quantity : part.quantity,
        min_stock_level !== undefined ? min_stock_level : part.min_stock_level,
        article_id !== undefined ? article_id : part.article_id,
        supplier !== undefined ? supplier : part.supplier,
        req.params.id,
      ],
    );

    const [updated] = await db.query('SELECT * FROM parts WHERE id = ?', [
      req.params.id,
    ]);

    res.status(200).json({
      success: true,
      data: updated[0],
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// PATCH update quantity only
exports.updateQuantity = async (req, res) => {
  try {
    const { quantity, adjustment_type } = req.body;

    const [existing] = await db.query(
      'SELECT quantity, min_stock_level FROM parts WHERE id = ? AND deleted_at IS NULL',
      [req.params.id],
    );

    if (existing.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Part not found',
      });
    }

    let newQuantity;
    if (adjustment_type === 'add') {
      newQuantity = existing[0].quantity + parseInt(quantity);
    } else if (adjustment_type === 'remove') {
      newQuantity = Math.max(0, existing[0].quantity - parseInt(quantity));
    } else {
      newQuantity = parseInt(quantity);
    }

    await db.query('UPDATE parts SET quantity = ? WHERE id = ?', [
      newQuantity,
      req.params.id,
    ]);

    const [updated] = await db.query('SELECT * FROM parts WHERE id = ?', [
      req.params.id,
    ]);

    res.status(200).json({
      success: true,
      data: updated[0],
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// DELETE part (soft delete)
exports.delete = async (req, res) => {
  try {
    const [result] = await db.query(
      'UPDATE parts SET deleted_at = NOW() WHERE id = ? AND deleted_at IS NULL',
      [req.params.id],
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
