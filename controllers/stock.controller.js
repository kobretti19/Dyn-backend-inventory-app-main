const db = require('../db');

// GET - Get all stock movements
exports.getAllStockMovements = async (req, res) => {
  try {
    const query = `
      SELECT 
        sm.*,
        p.name AS part_name,
        c.name AS color_name,
        u.username AS user_username,
        pc.order_number AS order_number
      FROM stock_movements sm
      JOIN parts_colors pc ON sm.part_color_id = pc.id
      JOIN parts p ON pc.part_id = p.id
      JOIN colors c ON pc.color_id = c.id
      LEFT JOIN users u ON sm.user_id = u.id
      ORDER BY sm.created_at DESC
      LIMIT 100
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

// GET - Get stock movements by part color
exports.getStockMovementsByPartColor = async (req, res) => {
  try {
    const query = `
      SELECT 
        sm.*,
        u.username AS user_username
      FROM stock_movements sm
      LEFT JOIN users u ON sm.user_id = u.id
      WHERE sm.part_color_id = ?
      ORDER BY sm.created_at DESC
    `;

    const [rows] = await db.query(query, [req.params.partColorId]);

    res.status(200).json({
      success: true,
      count: rows.length,
      data: rows,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// GET - Get stock levels
exports.getStockLevels = async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM v_stock_levels');

    res.status(200).json({
      success: true,
      count: rows.length,
      data: rows,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// GET - Get low stock alerts
exports.getLowStockAlerts = async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT * FROM v_stock_levels WHERE stock_status IN ("low", "critical") ORDER BY available_quantity ASC'
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

// POST - Add stock (restock)
exports.addStock = async (req, res) => {
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const { part_color_id, quantity, notes } = req.body;

    if (!part_color_id || !quantity || quantity <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Part color ID and valid quantity are required',
      });
    }

    // Update stock
    await connection.query(
      'UPDATE parts_colors SET quantity = quantity + ?, last_restocked_at = NOW() WHERE id = ?',
      [quantity, part_color_id]
    );

    // Record stock movement
    await connection.query(
      'INSERT INTO stock_movements (part_color_id, movement_type, quantity, reference_type, user_id, notes) VALUES (?, ?, ?, ?, ?, ?)',
      [
        part_color_id,
        'in',
        quantity,
        'manual',
        req.user.id,
        notes || 'Manual restock',
      ]
    );

    await connection.commit();

    res.status(201).json({
      success: true,
      message: 'Stock added successfully',
    });
  } catch (error) {
    await connection.rollback();
    res.status(500).json({ success: false, error: error.message });
  } finally {
    connection.release();
  }
};

// POST - Adjust stock
exports.adjustStock = async (req, res) => {
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const { part_color_id, quantity, notes } = req.body;

    if (!part_color_id || quantity === undefined) {
      return res.status(400).json({
        success: false,
        error: 'Part color ID and quantity are required',
      });
    }

    // Get current stock
    const [current] = await connection.query(
      'SELECT quantity FROM parts_colors WHERE id = ?',
      [part_color_id]
    );

    if (current.length === 0) {
      await connection.rollback();
      return res.status(404).json({
        success: false,
        error: 'Part color not found',
      });
    }

    const difference = quantity - current[0].quantity;

    // Update stock
    await connection.query(
      'UPDATE parts_colors SET quantity = ? WHERE id = ?',
      [quantity, part_color_id]
    );

    // Record stock movement
    await connection.query(
      'INSERT INTO stock_movements (part_color_id, movement_type, quantity, reference_type, user_id, notes) VALUES (?, ?, ?, ?, ?, ?)',
      [
        part_color_id,
        difference > 0 ? 'in' : 'out',
        Math.abs(difference),
        'adjustment',
        req.user.id,
        notes || 'Stock adjustment',
      ]
    );

    await connection.commit();

    res.status(200).json({
      success: true,
      message: 'Stock adjusted successfully',
    });
  } catch (error) {
    await connection.rollback();
    res.status(500).json({ success: false, error: error.message });
  } finally {
    connection.release();
  }
};
