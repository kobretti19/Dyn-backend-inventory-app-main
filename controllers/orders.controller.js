const db = require('../db');

//GET all orders
exports.getAll = async (req, res) => {
  try {
    const [rows] = await db.query(`
SELECT 
    o.id,
    o.order_number,
    o.status,
    o.created_at,
    o.notes,
    o.total_amount, 
    u.full_name AS fullname,   
    COUNT(oi.id) AS item_count,
    SUM(oi.quantity_ordered) AS total_quantity,
    SUM(oi.quantity_delivered) AS total_delivered,
    SUM(oi.quantity_backorder) AS total_backorder
FROM orders AS o
JOIN order_items AS oi ON oi.order_id = o.id
JOIN users AS u ON o.user_id = u.id
GROUP BY o.id, o.order_number, o.status, o.created_at
ORDER BY o.created_at DESC;
    
    `);

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

exports.getById = async (req, res) => {
  try {
    // 1. Get Order details
    const [orders] = await db.query(
      `SELECT o.*, u.full_name AS created_by_username 
       FROM orders o 
       LEFT JOIN users u ON o.user_id = u.id 
       WHERE o.id = ?`,
      [req.params.id],
    );

    if (orders.length === 0) {
      return res.status(404).json({ success: false, error: 'Order not found' });
    }

    // 2. Get items with the "Total Quantity" per part across all orders
    const [items] = await db.query(
      `
      SELECT 
        oi.*,
        p.name AS part_name,
        p.sku,
        -- This calculates the sum for THIS part across the entire system
        part_totals.total_quantity
      FROM order_items oi
      JOIN parts p ON oi.part_id = p.id
      LEFT JOIN (
        SELECT part_id, SUM(quantity_ordered) AS total_quantity
        FROM order_items
        GROUP BY part_id
      ) AS part_totals ON oi.part_id = part_totals.part_id
      WHERE oi.order_id = ?
    `,
      [req.params.id],
    );

    res.status(200).json({
      success: true,
      data: {
        ...orders[0],
        items,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// GET order stats
exports.getStats = async (req, res) => {
  try {
    const [stats] = await db.query(`
      SELECT 
        COUNT(*) AS total_orders,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending,
        SUM(CASE WHEN status = 'ordered' THEN 1 ELSE 0 END) AS ordered,
        SUM(CASE WHEN status = 'partial' THEN 1 ELSE 0 END) AS partial,
        SUM(CASE WHEN status = 'delivered' THEN 1 ELSE 0 END) AS delivered,
        SUM(total_amount) AS total_value
      FROM orders
    `);

    res.status(200).json({
      success: true,
      data: stats[0],
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// POST create new order
exports.create = async (req, res) => {
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const { items = [], notes } = req.body;
    const userId = req.user?.id;

    if (items.length === 0) {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        error: 'Order must have at least one item',
      });
    }

    // Generate order number
    const orderNumber = `ORD-${Date.now()}`;

    // Calculate total
    let totalAmount = 0;
    for (const item of items) {
      const [part] = await connection.query(
        'SELECT purchase_price FROM parts WHERE id = ?',
        [item.part_id],
      );
      if (part.length > 0) {
        totalAmount += (part[0].purchase_price || 0) * (item.quantity || 1);
      }
    }

    // Create order with initial status history
    const statusHistory = JSON.stringify([
      {
        status: 'draft',
        date: new Date().toISOString(),
        user_id: userId,
        notes: 'Order created',
      },
    ]);

    const [result] = await connection.query(
      `INSERT INTO orders (order_number, user_id, total_amount, status, status_history, notes)
       VALUES (?, ?, ?, 'draft', ?, ?)`,
      [orderNumber, userId, totalAmount, statusHistory, notes || null],
    );

    const orderId = result.insertId;

    // Add order items
    for (const item of items) {
      const [part] = await connection.query(
        'SELECT purchase_price FROM parts WHERE id = ?',
        [item.part_id],
      );

      await connection.query(
        `INSERT INTO order_items 
         (order_id, part_id, quantity_ordered, unit_price, notes)
         VALUES (?, ?, ?, ?, ?)`,
        [
          orderId,
          item.part_id,
          item.quantity || 1,
          part[0]?.purchase_price || 0,
          item.notes || null,
        ],
      );
    }

    await connection.commit();

    // Fetch created order
    const [created] = await db.query('SELECT * FROM orders WHERE id = ?', [
      orderId,
    ]);

    res.status(201).json({
      success: true,
      data: created[0],
    });
  } catch (error) {
    await connection.rollback();
    res.status(500).json({ success: false, error: error.message });
  } finally {
    connection.release();
  }
};

// PUT update order status
exports.updateStatus = async (req, res) => {
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const { status, notes, items } = req.body;
    const orderId = req.params.id;
    const userId = req.user?.id;

    // Get current order
    const [orders] = await connection.query(
      'SELECT * FROM orders WHERE id = ?',
      [orderId],
    );

    if (orders.length === 0) {
      await connection.rollback();
      return res.status(404).json({
        success: false,
        error: 'Order not found',
      });
    }

    const order = orders[0];

    // Update status history
    let statusHistory = [];
    try {
      statusHistory = JSON.parse(order.status_history || '[]');
    } catch (e) {
      statusHistory = [];
    }

    statusHistory.push({
      status,
      date: new Date().toISOString(),
      user_id: userId,
      notes: notes || null,
    });

    // Update order
    await connection.query(
      'UPDATE orders SET status = ?, status_history = ?, notes = CONCAT(COALESCE(notes, ""), ?) WHERE id = ?',
      [
        status,
        JSON.stringify(statusHistory),
        notes ? `\n[${new Date().toISOString()}] ${notes}` : '',
        orderId,
      ],
    );

    // Handle delivery
    if (
      (status === 'delivered' || status === 'partial') &&
      items &&
      items.length > 0
    ) {
      for (const item of items) {
        const deliveredQty = parseInt(item.quantity_delivered) || 0;
        const backorderQty = parseInt(item.quantity_backorder) || 0;

        // Update order item
        await connection.query(
          `UPDATE order_items 
           SET quantity_delivered = quantity_delivered + ?, 
               quantity_backorder = ?,
               status = ?
           WHERE id = ?`,
          [deliveredQty, backorderQty, item.status || 'delivered', item.id],
        );

        // Add to stock
        if (deliveredQty > 0) {
          // Get part_id from order_item
          const [orderItem] = await connection.query(
            'SELECT part_id FROM order_items WHERE id = ?',
            [item.id],
          );

          if (orderItem.length > 0) {
            // Update part quantity
            await connection.query(
              'UPDATE parts SET quantity = quantity + ? WHERE id = ?',
              [deliveredQty, orderItem[0].part_id],
            );

            // Record stock movement
            await connection.query(
              `INSERT INTO stock_movements 
               (part_id, movement_type, quantity, reference_type, reference_id, user_id, notes)
               VALUES (?, 'in', ?, 'order', ?, ?, ?)`,
              [
                orderItem[0].part_id,
                deliveredQty,
                orderId,
                userId,
                `Order ${order.order_number} delivery`,
              ],
            );
          }
        }
      }
    }

    await connection.commit();

    res.status(200).json({
      success: true,
      message: 'Order status updated',
    });
  } catch (error) {
    await connection.rollback();
    res.status(500).json({ success: false, error: error.message });
  } finally {
    connection.release();
  }
};

// DELETE order
exports.delete = async (req, res) => {
  try {
    // Delete order items first (cascade should handle this, but just in case)
    await db.query('DELETE FROM order_items WHERE order_id = ?', [
      req.params.id,
    ]);

    const [result] = await db.query('DELETE FROM orders WHERE id = ?', [
      req.params.id,
    ]);

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        error: 'Order not found',
      });
    }

    res.status(200).json({
      success: true,
      message: 'Order deleted successfully',
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};
