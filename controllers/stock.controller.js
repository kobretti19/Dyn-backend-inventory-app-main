const db = require('../db');

// GET all stock movements
exports.getMovements = async (req, res) => {
  try {
    const [rows] = await db.query(`
    SELECT 
    sm.*,
    p.name AS part_name,
    p.color AS part_color,
    p.supplier,
    p.sku,
    p.quantity AS current_stock,
    u.full_name AS user_name,
    
    -- 1. Calculate annual usage per part across ALL records (Window Function)
    SUM(CASE WHEN sm.movement_type = 'out' THEN sm.quantity ELSE 0 END) 
        OVER(PARTITION BY sm.part_id) AS annual_usage,

    -- 2. Calculate days until empty based on that usage
    CASE 
        WHEN SUM(CASE WHEN sm.movement_type = 'out' THEN sm.quantity ELSE 0 END) 
             OVER(PARTITION BY sm.part_id) > 0 
        THEN FLOOR(p.quantity / (SUM(CASE WHEN sm.movement_type = 'out' THEN sm.quantity ELSE 0 END) 
             OVER(PARTITION BY sm.part_id) / 365)) 
        ELSE 999 
    END AS days_until_empty

    FROM stock_movements sm
    JOIN parts p ON sm.part_id = p.id
    LEFT JOIN users u ON sm.user_id = u.id
    -- Optional: Filter usage to ONLY look at the last year for the calculation
    WHERE sm.created_at >= DATE_SUB(CURDATE(), INTERVAL 1 YEAR)
    ORDER BY sm.created_at DESC
    LIMIT 100;
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

// GET movements by part (was getStockMovementsByPartColor)
exports.getMovementsByPart = async (req, res) => {
  try {
    const [rows] = await db.query(
      `
      SELECT 
        sm.*,
        u.username
      FROM stock_movements sm
      LEFT JOIN users u ON sm.user_id = u.id
      WHERE sm.part_id = ?
      ORDER BY sm.created_at DESC
    `,
      [req.params.partId],
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

// GET stock levels (all parts with stock info)
exports.getStockLevels = async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT 
        id,
        name AS part_name,
        color AS color_name,
        category,
        sku,
        quantity AS total_quantity,
        0 AS reserved_quantity,
        quantity AS available_quantity,
        min_stock_level,
        min_stock_level AS reorder_point,
        status,
        CASE 
          WHEN quantity = 0 THEN 'critical'
          WHEN quantity <= min_stock_level THEN 'low'
          ELSE 'ok'
        END AS stock_status,
        supplier,
        purchase_price,
        selling_price
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

// GET low stock alerts
exports.getLowStockAlerts = async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT * FROM parts 
      WHERE quantity <= min_stock_level 
        AND deleted_at IS NULL
      ORDER BY quantity ASC
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

// GET stock summary (for dashboard)
exports.getSummary = async (req, res) => {
  try {
    const [summary] = await db.query(`
      SELECT 
        COUNT(*) AS total_parts,
        SUM(quantity) AS total_quantity,
        SUM(quantity * purchase_price) AS total_value,
        SUM(CASE WHEN quantity = 0 THEN 1 ELSE 0 END) AS out_of_stock_count,
        SUM(CASE WHEN quantity > 0 AND quantity <= min_stock_level THEN 1 ELSE 0 END) AS low_stock_count,
        SUM(CASE WHEN quantity > min_stock_level THEN 1 ELSE 0 END) AS in_stock_count
      FROM parts
      WHERE deleted_at IS NULL
    `);

    const [byCategory] = await db.query(`
      SELECT 
        category,
        COUNT(*) AS total_parts,
        SUM(quantity) AS total_quantity,
        SUM(quantity * purchase_price) AS total_value
      FROM parts
      WHERE deleted_at IS NULL
      GROUP BY category
      ORDER BY category
    `);

    res.status(200).json({
      success: true,
      data: {
        ...summary[0],
        by_category: byCategory,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// POST add stock
exports.addStock = async (req, res) => {
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const { part_id, quantity, notes } = req.body;
    const userId = req.user?.id;

    if (!part_id || !quantity || quantity <= 0) {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        error: 'Part ID and valid quantity are required',
      });
    }

    // Update stock
    await connection.query(
      'UPDATE parts SET quantity = quantity + ? WHERE id = ?',
      [quantity, part_id],
    );

    // Record movement
    await connection.query(
      `INSERT INTO stock_movements 
       (part_id, movement_type, quantity, reference_type, user_id, notes)
       VALUES (?, 'in', ?, 'manual', ?, ?)`,
      [part_id, quantity, userId, notes || 'Manual stock addition'],
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

// POST adjust stock
exports.adjustStock = async (req, res) => {
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const { part_id, quantity, notes } = req.body;
    const userId = req.user?.id;

    if (!part_id || quantity === undefined) {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        error: 'Part ID and quantity are required',
      });
    }

    // Get current quantity
    const [current] = await connection.query(
      'SELECT quantity FROM parts WHERE id = ?',
      [part_id],
    );

    if (current.length === 0) {
      await connection.rollback();
      return res.status(404).json({
        success: false,
        error: 'Part not found',
      });
    }

    const difference = quantity - current[0].quantity;

    // Update stock
    await connection.query('UPDATE parts SET quantity = ? WHERE id = ?', [
      quantity,
      part_id,
    ]);

    // Record movement
    await connection.query(
      `INSERT INTO stock_movements 
       (part_id, movement_type, quantity, reference_type, user_id, notes)
       VALUES (?, ?, ?, 'manual', ?, ?)`,
      [
        part_id,
        difference > 0 ? 'in' : 'out',
        Math.abs(difference),
        userId,
        notes || 'Stock adjustment',
      ],
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
