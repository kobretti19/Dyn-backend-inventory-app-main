const db = require('../db');

// GET - Get all orders with details
exports.getAllOrders = async (req, res) => {
  try {
    const query = `
      SELECT 
        o.id,
        o.order_number,
        o.status,
        o.notes,
        o.created_at,
        o.updated_at,
        u.username AS created_by_username,
        u.full_name AS created_by_name,

        COUNT(DISTINCT oi.id) AS total_items,
        SUM(oi.quantity) AS total_quantity,
        SUM(oi.quantity * oi.purchase_price_at_order) AS total_amount,

        GROUP_CONCAT(
          CONCAT(p.name, ' (', c.name, ') ×', oi.quantity)
          SEPARATOR ', '
        ) AS items_summary

      FROM orders o
      LEFT JOIN users u ON o.user_id = u.id
      LEFT JOIN order_items oi ON o.id = oi.order_id
      LEFT JOIN parts_colors pc ON oi.part_color_id = pc.id
      LEFT JOIN parts p ON pc.part_id = p.id
      LEFT JOIN colors c ON pc.color_id = c.id

      GROUP BY 
        o.id, o.order_number, o.status, o.notes,
        o.created_at, o.updated_at,
        u.username, u.full_name

      ORDER BY o.created_at DESC
    `;

    const [rows] = await db.query(query);

    res.status(200).json({
      success: true,
      count: rows.length,
      data: rows,
    });
  } catch (error) {
    console.error('Get all orders error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// GET - Get orders by user
exports.getMyOrders = async (req, res) => {
  try {
    const query = `
      SELECT 
        o.id,
        o.order_number,
        o.status,
        o.notes,
        o.created_at,
        COUNT(DISTINCT oi.id) AS total_items,
        SUM(oi.quantity) AS total_quantity,
        SUM(oi.quantity * oi.purchase_price_at_order) AS total_amount
      FROM orders o
      LEFT JOIN order_items oi ON o.id = oi.order_id
      WHERE o.user_id = ?
      GROUP BY o.id, o.order_number, o.status, o.notes, o.created_at
      ORDER BY o.created_at DESC
    `;

    const [rows] = await db.query(query, [req.user.id]);

    res.status(200).json({
      success: true,
      count: rows.length,
      data: rows,
    });
  } catch (error) {
    console.error('Get my orders error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// GET - Get order by ID with all items
exports.getOrderById = async (req, res) => {
  try {
    // Get order details
    const [orderRows] = await db.query(
      `SELECT 
        o.*,
        u.username AS created_by_username,
        u.full_name AS created_by_name
      FROM orders o
      LEFT JOIN users u ON o.user_id = u.id
      WHERE o.id = ?`,
      [req.params.id]
    );

    if (orderRows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Order not found',
      });
    }

    // Get order items with prices
    const [itemsRows] = await db.query(
      `SELECT 
        oi.id,
        oi.order_id,
        oi.part_color_id,
        oi.quantity,
        oi.purchase_price_at_order,
        oi.notes,
        oi.created_at,
        p.name AS part_name,
        c.name AS color_name,
        p.purchase_price AS current_purchase_price,
        p.selling_price AS current_selling_price
      FROM order_items oi
      LEFT JOIN parts_colors pc ON oi.part_color_id = pc.id
      LEFT JOIN parts p ON pc.part_id = p.id
      LEFT JOIN colors c ON pc.color_id = c.id
      WHERE oi.order_id = ?`,
      [req.params.id]
    );
    console.log(itemsRows);

    const order = {
      ...orderRows[0],
      items: itemsRows,
      total_items: itemsRows.length,
      total_quantity: itemsRows.reduce((sum, item) => sum + item.quantity, 0),
      total_amount: itemsRows.reduce(
        (sum, item) =>
          sum + item.quantity * parseFloat(item.purchase_price_at_order || 0),
        0
      ),
    };

    res.status(200).json({
      success: true,
      data: order,
    });
  } catch (error) {
    console.error('Get order by ID error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// POST - Create new order
exports.createOrder = async (req, res) => {
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const { notes, items } = req.body;

    if (!items || items.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Order must have at least one item',
      });
    }

    // Generate order number
    const orderNumber = `ORD-${Date.now()}`;

    // Create order
    const [orderResult] = await connection.query(
      'INSERT INTO orders (order_number, user_id, status, notes) VALUES (?, ?, ?, ?)',
      [orderNumber, req.user?.id, 'waiting_for_answer', notes]
    );

    const orderId = orderResult.insertId;

    // Add order items with purchase price
    for (const item of items) {
      await connection.query(
        'INSERT INTO order_items (order_id, part_color_id, quantity, purchase_price_at_order, notes) VALUES (?, ?, ?, ?, ?)',
        [
          orderId,
          item.part_color_id,
          item.quantity,
          item.purchase_price || 0,
          item.notes,
        ]
      );
    }

    await connection.commit();

    // Fetch the created order with details
    const [createdOrder] = await connection.query(
      `SELECT 
        o.id,
        o.order_number,
        o.status,
        o.notes,
        o.created_at,
        o.updated_at,
        COUNT(DISTINCT oi.id) AS total_items,
        SUM(oi.quantity) AS total_quantity,
        SUM(oi.quantity * oi.purchase_price_at_order) AS total_amount
      FROM orders o
      LEFT JOIN order_items oi ON o.id = oi.order_id
      WHERE o.id = ?
      GROUP BY o.id, o.order_number, o.status, o.notes, o.created_at, o.updated_at`,
      [orderId]
    );

    res.status(201).json({
      success: true,
      data: createdOrder[0],
    });
  } catch (error) {
    await connection.rollback();
    console.error('Create order error:', error);
    res.status(500).json({ success: false, error: error.message });
  } finally {
    connection.release();
  }
};

// PUT - Update order status
exports.updateOrderStatus = async (req, res) => {
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const { status, notes, items } = req.body;
    const orderId = req.params.id;
    const userId = req.user?.id || null;

    // =========================
    // GET CURRENT ORDER
    // =========================
    const [currentOrder] = await connection.query(
      'SELECT status FROM orders WHERE id = ?',
      [orderId]
    );

    if (currentOrder.length === 0) {
      await connection.rollback();
      return res.status(404).json({
        success: false,
        error: 'Order not found',
      });
    }

    const oldStatus = currentOrder[0].status;

    // Prevent double delivery
    if (oldStatus === 'delivered') {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        error: 'Order already delivered',
      });
    }

    // =========================
    // UPDATE ORDER STATUS + NOTES
    // =========================
    const timestamp = new Date().toISOString();

    const updateNotesSQL = notes
      ? `
        UPDATE orders 
        SET status = ?, 
            notes = CONCAT(COALESCE(notes, ''), '\n\n', ?) 
        WHERE id = ?
      `
      : `
        UPDATE orders 
        SET status = ? 
        WHERE id = ?
      `;

    const updateParams = notes
      ? [
          status,
          `[${timestamp}] Status changed to ${status}: ${notes}`,
          orderId,
        ]
      : [status, orderId];

    await connection.query(updateNotesSQL, updateParams);

    // =========================
    // HANDLE DELIVERY (STOCK IN)
    // =========================
    if (status === 'delivered') {
      if (!items || !Array.isArray(items) || items.length === 0) {
        await connection.rollback();
        return res.status(400).json({
          success: false,
          error: 'Delivered items with quantities are required',
        });
      }

      for (const item of items) {
        const { id, part_color_id, quantity } = item;

        if (!id || !part_color_id || !quantity || quantity <= 0) {
          await connection.rollback();
          return res.status(400).json({
            success: false,
            error: 'Invalid delivered item data',
          });
        }

        // =========================
        // UPDATE ORDER ITEM QUANTITY
        // =========================
        const [updateItem] = await connection.query(
          `UPDATE order_items 
           SET quantity = ? 
           WHERE id = ? AND order_id = ?`,
          [quantity, id, orderId]
        );

        if (updateItem.affectedRows === 0) {
          await connection.rollback();
          return res.status(400).json({
            success: false,
            error: `Order item ${id} not found`,
          });
        }

        // =========================
        // INCREASE STOCK
        // =========================
        await connection.query(
          'UPDATE parts_colors SET quantity = quantity + ? WHERE id = ?',
          [quantity, part_color_id]
        );

        // =========================
        // UPDATE STOCK STATUS
        // =========================
        await connection.query(
          `UPDATE parts_colors
           SET status = CASE
             WHEN quantity = 0 THEN 'out_of_stock'
             WHEN quantity <= min_stock_level THEN 'low_stock'
             ELSE 'in_stock'
           END
           WHERE id = ?`,
          [part_color_id]
        );

        // =========================
        // STOCK MOVEMENT (IN)
        // =========================
        await connection.query(
          `INSERT INTO stock_movements
           (part_color_id, movement_type, quantity, reference_type, reference_id, user_id, notes)
           VALUES (?, 'in', ?, 'order', ?, ?, ?)`,
          [
            part_color_id,
            quantity,
            orderId,
            userId,
            notes
              ? `Order delivered: ${notes}`
              : 'Order delivered - Stock received',
          ]
        );
      }
    }

    await connection.commit();

    res.status(200).json({
      success: true,
      message: 'Order status updated successfully',
    });
  } catch (error) {
    await connection.rollback();
    console.error('Update order status error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  } finally {
    connection.release();
  }
};

// PUT - Update order
exports.updateOrder = async (req, res) => {
  try {
    const { notes } = req.body;

    const [result] = await db.query(
      'UPDATE orders SET notes = ? WHERE id = ?',
      [notes, req.params.id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        error: 'Order not found',
      });
    }

    res.status(200).json({
      success: true,
      message: 'Order updated successfully',
    });
  } catch (error) {
    console.error('Update order error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// DELETE - Cancel order (does NOT change stock)
exports.deleteOrder = async (req, res) => {
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    // Get order
    const [orders] = await connection.query(
      'SELECT status FROM orders WHERE id = ?',
      [req.params.id]
    );

    if (orders.length === 0) {
      await connection.rollback();
      return res.status(404).json({
        success: false,
        error: 'Order not found',
      });
    }

    const order = orders[0];

    // Only allow cancellation if not delivered
    if (order.status === 'delivered') {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        error: 'Cannot cancel delivered orders - stock already received',
      });
    }

    // Just update order status to cancelled
    // DON'T change stock because we never increased it in the first place
    // Stock only increases when status becomes 'delivered'
    const timestamp = new Date().toISOString();
    await connection.query(
      'UPDATE orders SET status = ?, notes = CONCAT(COALESCE(notes, ""), "\n\n", ?) WHERE id = ?',
      ['cancelled', `[${timestamp}] Order cancelled by user`, req.params.id]
    );

    await connection.commit();

    res.status(200).json({
      success: true,
      message: 'Order cancelled successfully',
    });
  } catch (error) {
    await connection.rollback();
    console.error('Cancel order error:', error);
    res.status(500).json({ success: false, error: error.message });
  } finally {
    connection.release();
  }
};

// GET - Get order statistics
exports.getOrderStats = async (req, res) => {
  try {
    const [stats] = await db.query(`
      SELECT 
        COUNT(*) AS total_orders,
        SUM(CASE WHEN status = 'waiting_for_answer' THEN 1 ELSE 0 END) AS waiting_for_answer,
        SUM(CASE WHEN status = 'to_order' THEN 1 ELSE 0 END) AS to_order,
        SUM(CASE WHEN status = 'ordered' THEN 1 ELSE 0 END) AS ordered,
        SUM(CASE WHEN status = 'delivered' THEN 1 ELSE 0 END) AS delivered,
        SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) AS cancelled
      FROM orders
    `);

    res.status(200).json({
      success: true,
      data: {
        overall: stats[0],
      },
    });
  } catch (error) {
    console.error('Get order stats error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};