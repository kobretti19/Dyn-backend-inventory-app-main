const db = require('../db');

// GET - Get all inventory transactions
exports.getAllTransactions = async (req, res) => {
  try {
    const query = `
      SELECT 
        it.id,
        it.part_color_id,
        it.transaction_type,
        it.quantity_change,
        it.quantity_before,
        it.quantity_after,
        it.notes,
        it.created_at,
        p.name AS part_name,
        c.name AS color_name,
        u.username AS user_username
      FROM inventory_transactions it
      LEFT JOIN parts_colors pc ON it.part_color_id = pc.id
      LEFT JOIN parts p ON pc.part_id = p.id
      LEFT JOIN colors c ON pc.color_id = c.id
      LEFT JOIN users u ON it.user_id = u.id
      ORDER BY it.created_at DESC
      LIMIT 100
    `;

    const [rows] = await db.query(query);

    res.status(200).json({
      success: true,
      count: rows.length,
      data: rows,
    });
  } catch (error) {
    console.error('Inventory transactions error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// GET - Get transactions by part color
exports.getTransactionsByPartColor = async (req, res) => {
  try {
    const query = `
      SELECT 
        it.*,
        u.username AS user_username
      FROM inventory_transactions it
      LEFT JOIN users u ON it.user_id = u.id
      WHERE it.part_color_id = ?
      ORDER BY it.created_at DESC
    `;

    const [rows] = await db.query(query, [req.params.partColorId]);

    res.status(200).json({
      success: true,
      count: rows.length,
      data: rows,
    });
  } catch (error) {
    console.error('Get by part color error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// POST - Create inventory transaction
exports.createTransaction = async (req, res) => {
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const {
      part_color_id,
      transaction_type,
      quantity_change,
      quantity_before,
      quantity_after,
      notes,
    } = req.body;

    if (!part_color_id || !transaction_type) {
      return res.status(400).json({
        success: false,
        error: 'Part color ID and transaction type are required',
      });
    }

    // Insert transaction
    const [result] = await connection.query(
      `INSERT INTO inventory_transactions 
       (part_color_id, transaction_type, quantity_change, quantity_before, quantity_after, user_id, notes) 
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        part_color_id,
        transaction_type,
        quantity_change || 0,
        quantity_before || 0,
        quantity_after || 0,
        req.user?.id || null,
        notes,
      ]
    );

    await connection.commit();

    res.status(201).json({
      success: true,
      data: {
        id: result.insertId,
        part_color_id,
        transaction_type,
        quantity_change,
        quantity_before,
        quantity_after,
        notes,
      },
    });
  } catch (error) {
    await connection.rollback();
    console.error('Create transaction error:', error);
    res.status(500).json({ success: false, error: error.message });
  } finally {
    connection.release();
  }
};

// GET - Get inventory stats
exports.getInventoryStats = async (req, res) => {
  try {
    const [stats] = await db.query(`
      SELECT 
        COUNT(DISTINCT pc.id) AS total_items,
        SUM(pc.quantity) AS total_quantity,
        SUM(CASE WHEN pc.status = 'in_stock' THEN 1 ELSE 0 END) AS in_stock_count,
        SUM(CASE WHEN pc.status = 'low_stock' THEN 1 ELSE 0 END) AS low_stock_count,
        SUM(CASE WHEN pc.status = 'out_of_stock' THEN 1 ELSE 0 END) AS out_of_stock_count
      FROM parts_colors pc
    `);

    res.status(200).json({
      success: true,
      data: stats[0],
    });
  } catch (error) {
    console.error('Inventory stats error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};
