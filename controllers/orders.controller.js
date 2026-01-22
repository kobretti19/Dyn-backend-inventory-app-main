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
        SUM(oi.quantity_ordered) AS total_quantity,
        SUM(oi.quantity_delivered) AS total_delivered,
        SUM(oi.quantity_backorder) AS total_backorder,
        SUM(oi.quantity_ordered * oi.purchase_price_at_order) AS total_amount,

        GROUP_CONCAT(
          CONCAT(p.name, ' (', c.name, ') ×', oi.quantity_ordered)
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
        SUM(oi.quantity_ordered) AS total_quantity,
        SUM(oi.quantity_delivered) AS total_delivered,
        SUM(oi.quantity_backorder) AS total_backorder,
        SUM(oi.quantity_ordered * oi.purchase_price_at_order) AS total_amount
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

// GET - Get order by ID with all items (prices from parts_colors)
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
      [req.params.id],
    );

    if (orderRows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Order not found',
      });
    }

    // Get order items - prices now from parts_colors
    const [itemsRows] = await db.query(
      `SELECT 
        oi.id,
        oi.order_id,
        oi.part_color_id,
        oi.quantity,
        oi.quantity_ordered,
        oi.quantity_delivered,
        oi.quantity_backorder,
        oi.item_status,
        oi.purchase_price_at_order,
        oi.notes,
        oi.created_at,
        p.name AS part_name,
        c.name AS color_name,
        pc.purchase_price AS current_purchase_price,
        pc.selling_price AS current_selling_price
      FROM order_items oi
      LEFT JOIN parts_colors pc ON oi.part_color_id = pc.id
      LEFT JOIN parts p ON pc.part_id = p.id
      LEFT JOIN colors c ON pc.color_id = c.id
      WHERE oi.order_id = ?`,
      [req.params.id],
    );

    const order = {
      ...orderRows[0],
      items: itemsRows.map((item) => ({
        ...item,
        quantity_ordered: item.quantity_ordered || item.quantity,
        quantity_delivered: item.quantity_delivered || 0,
        quantity_backorder: item.quantity_backorder || 0,
        item_status: item.item_status || 'pending',
      })),
      total_items: itemsRows.length,
      total_quantity: itemsRows.reduce(
        (sum, item) => sum + (item.quantity_ordered || item.quantity),
        0,
      ),
      total_delivered: itemsRows.reduce(
        (sum, item) => sum + (item.quantity_delivered || 0),
        0,
      ),
      total_backorder: itemsRows.reduce(
        (sum, item) => sum + (item.quantity_backorder || 0),
        0,
      ),
      total_amount: itemsRows.reduce(
        (sum, item) =>
          sum +
          (item.quantity_ordered || item.quantity) *
            parseFloat(item.purchase_price_at_order || 0),
        0,
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

// POST - Create new order (get price from parts_colors)
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
      [orderNumber, req.user?.id, 'waiting_for_answer', notes],
    );

    const orderId = orderResult.insertId;

    // Add order items - get purchase_price from parts_colors if not provided
    for (const item of items) {
      let purchasePrice = item.purchase_price;

      // If price not provided, fetch from parts_colors
      if (purchasePrice === undefined || purchasePrice === null) {
        const [pcRows] = await connection.query(
          'SELECT purchase_price FROM parts_colors WHERE id = ?',
          [item.part_color_id],
        );
        purchasePrice = pcRows.length > 0 ? pcRows[0].purchase_price : 0;
      }

      await connection.query(
        `INSERT INTO order_items 
         (order_id, part_color_id, quantity, quantity_ordered, quantity_delivered, quantity_backorder, item_status, purchase_price_at_order, notes) 
         VALUES (?, ?, ?, ?, 0, 0, 'pending', ?, ?)`,
        [
          orderId,
          item.part_color_id,
          item.quantity,
          item.quantity,
          purchasePrice,
          item.notes || null,
        ],
      );
    }

    await connection.commit();

    // Fetch the created order
    const [createdOrder] = await connection.query(
      `SELECT 
        o.id,
        o.order_number,
        o.status,
        o.notes,
        o.created_at,
        o.updated_at,
        COUNT(DISTINCT oi.id) AS total_items,
        SUM(oi.quantity_ordered) AS total_quantity,
        SUM(oi.quantity_ordered * oi.purchase_price_at_order) AS total_amount
      FROM orders o
      LEFT JOIN order_items oi ON o.id = oi.order_id
      WHERE o.id = ?
      GROUP BY o.id, o.order_number, o.status, o.notes, o.created_at, o.updated_at`,
      [orderId],
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

// PUT - Update order status with partial delivery support
exports.updateOrderStatus = async (req, res) => {
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const { status, notes, items } = req.body;
    const orderId = req.params.id;
    const userId = req.user?.id || null;

    // Get current order
    const [currentOrder] = await connection.query(
      'SELECT status FROM orders WHERE id = ?',
      [orderId],
    );

    if (currentOrder.length === 0) {
      await connection.rollback();
      return res.status(404).json({
        success: false,
        error: 'Order not found',
      });
    }

    const oldStatus = currentOrder[0].status;

    // Prevent modification of delivered orders
    if (oldStatus === 'delivered') {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        error: 'Order already delivered',
      });
    }

    // Update order status and notes
    const timestamp = new Date().toISOString();

    if (notes) {
      await connection.query(
        `UPDATE orders 
         SET status = ?, notes = CONCAT(COALESCE(notes, ''), '\n\n', ?) 
         WHERE id = ?`,
        [status, `[${timestamp}] Status: ${status} - ${notes}`, orderId],
      );
    } else {
      await connection.query('UPDATE orders SET status = ? WHERE id = ?', [
        status,
        orderId,
      ]);
    }

    // Record status change in history
    await connection.query(
      `INSERT INTO order_status_history (order_id, old_status, new_status, changed_by, notes)
       VALUES (?, ?, ?, ?, ?)`,
      [orderId, oldStatus, status, userId, notes || null],
    );

    // Handle delivery with partial quantities
    if (status === 'delivered' || status === 'partial_delivered') {
      // Only require items if actually delivering
      if (!items || !Array.isArray(items) || items.length === 0) {
        // If no items provided, fetch them from the order
        const [orderItems] = await connection.query(
          `SELECT oi.id, oi.part_color_id, oi.quantity, oi.quantity_ordered
           FROM order_items oi WHERE oi.order_id = ?`,
          [orderId],
        );

        if (orderItems.length === 0) {
          await connection.rollback();
          return res.status(400).json({
            success: false,
            error: 'No items found in this order',
          });
        }

        // Use order items with full delivery (default behavior)
        items = orderItems.map((item) => ({
          id: item.id,
          part_color_id: item.part_color_id,
          quantity_delivered: item.quantity_ordered || item.quantity,
          quantity_backorder: 0,
          item_status: 'delivered',
        }));
      }

      let hasBackorder = false;

      for (const item of items) {
        const {
          id,
          part_color_id,
          quantity_delivered, // This is now the amount being received NOW
          quantity_backorder,
          item_status,
        } = item;

        if (!id || !part_color_id) {
          await connection.rollback();
          return res.status(400).json({
            success: false,
            error: 'Invalid item data',
          });
        }

        const receivingQty = parseInt(quantity_delivered) || 0;
        const backorderQty = parseInt(quantity_backorder) || 0;

        // Get current item quantities
        const [currentItem] = await connection.query(
          `SELECT quantity_ordered, quantity_delivered, quantity_backorder 
           FROM order_items WHERE id = ?`,
          [id],
        );

        if (currentItem.length === 0) {
          continue;
        }

        const existingDelivered = currentItem[0].quantity_delivered || 0;
        const newTotalDelivered = existingDelivered + receivingQty;
        const orderedQty = currentItem[0].quantity_ordered;

        // Calculate correct backorder - never negative!
        let calculatedBackorder = Math.max(0, orderedQty - newTotalDelivered);

        // If user manually set backorder, use it, otherwise use calculated
        const finalBackorder =
          backorderQty > 0 ? backorderQty : calculatedBackorder;

        // Determine item status
        let finalItemStatus = item_status || 'delivered';

        if (finalBackorder > 0) {
          hasBackorder = true;
          finalItemStatus = newTotalDelivered > 0 ? 'partial' : 'backorder';
        } else if (receivingQty === 0 && existingDelivered === 0) {
          finalItemStatus = 'cancelled';
        } else if (newTotalDelivered >= orderedQty) {
          // If delivered quantity meets or EXCEEDS ordered quantity, mark as delivered
          finalItemStatus = 'delivered';

          // If we received MORE than ordered, log it
          if (newTotalDelivered > orderedQty) {
            const extraQty = newTotalDelivered - orderedQty;
            await connection.query(
              `UPDATE order_items 
               SET notes = CONCAT(COALESCE(notes, ''), '\n', ?)
               WHERE id = ?`,
              [
                `[${new Date().toISOString().split('T')[0]}] Over-delivery: received ${extraQty} extra units`,
                id,
              ],
            );
          }
        }

        // Update order item - ADD to existing delivered
        await connection.query(
          `UPDATE order_items 
           SET quantity_delivered = quantity_delivered + ?,
               quantity_backorder = ?,
               item_status = ?
           WHERE id = ? AND order_id = ?`,
          [receivingQty, finalBackorder, finalItemStatus, id, orderId],
        );

        // Add received quantity to stock (only the new amount)
        if (receivingQty > 0) {
          // Increase stock
          await connection.query(
            'UPDATE parts_colors SET quantity = quantity + ? WHERE id = ?',
            [receivingQty, part_color_id],
          );

          // Update stock status
          await connection.query(
            `UPDATE parts_colors
             SET status = CASE
               WHEN quantity = 0 THEN 'out_of_stock'
               WHEN quantity <= min_stock_level THEN 'low_stock'
               ELSE 'in_stock'
             END
             WHERE id = ?`,
            [part_color_id],
          );

          // Record stock movement
          await connection.query(
            `INSERT INTO stock_movements
             (part_color_id, movement_type, quantity, reference_type, reference_id, user_id, notes)
             VALUES (?, 'in', ?, 'order', ?, ?, ?)`,
            [
              part_color_id,
              receivingQty,
              orderId,
              userId,
              finalBackorder > 0
                ? `Partial delivery: ${receivingQty} received, ${finalBackorder} on backorder`
                : `Order delivered: ${receivingQty} received`,
            ],
          );
        }
      }

      // Update order status based on delivery results
      let finalOrderStatus = 'delivered';
      if (hasBackorder) {
        finalOrderStatus = 'partial_delivered';
      }

      await connection.query('UPDATE orders SET status = ? WHERE id = ?', [
        finalOrderStatus,
        orderId,
      ]);
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

// PUT - Update order notes
exports.updateOrder = async (req, res) => {
  try {
    const { notes } = req.body;

    const [result] = await db.query(
      'UPDATE orders SET notes = ? WHERE id = ?',
      [notes, req.params.id],
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

// DELETE - Cancel order
exports.deleteOrder = async (req, res) => {
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const [orders] = await connection.query(
      'SELECT status FROM orders WHERE id = ?',
      [req.params.id],
    );

    if (orders.length === 0) {
      await connection.rollback();
      return res.status(404).json({
        success: false,
        error: 'Order not found',
      });
    }

    const order = orders[0];

    if (order.status === 'delivered') {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        error: 'Cannot cancel delivered orders',
      });
    }

    const timestamp = new Date().toISOString();

    await connection.query(
      `UPDATE orders 
       SET status = 'cancelled', 
           notes = CONCAT(COALESCE(notes, ''), '\n\n', ?) 
       WHERE id = ?`,
      [`[${timestamp}] Order cancelled`, req.params.id],
    );

    // Record status change in history
    await connection.query(
      `INSERT INTO order_status_history (order_id, old_status, new_status, changed_by, notes)
       VALUES (?, ?, 'cancelled', ?, 'Order cancelled')`,
      [req.params.id, order.status, req.user?.id || null],
    );

    await connection.query(
      `UPDATE order_items SET item_status = 'cancelled' WHERE order_id = ?`,
      [req.params.id],
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
        SUM(CASE WHEN status = 'partial_delivered' THEN 1 ELSE 0 END) AS partial_delivered,
        SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) AS cancelled
      FROM orders
    `);

    const [backorderStats] = await db.query(`
      SELECT COUNT(*) AS backorder_items
      FROM order_items 
      WHERE item_status = 'backorder' OR quantity_backorder > 0
    `);

    res.status(200).json({
      success: true,
      data: {
        overall: {
          ...stats[0],
          backorder_items: backorderStats[0]?.backorder_items || 0,
        },
      },
    });
  } catch (error) {
    console.error('Get order stats error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// GET - Get all backorder items
exports.getBackorders = async (req, res) => {
  try {
    const [backorders] = await db.query(`
      SELECT 
        oi.id,
        oi.order_id,
        oi.part_color_id,
        oi.quantity_ordered,
        oi.quantity_delivered,
        oi.quantity_backorder,
        oi.item_status,
        oi.purchase_price_at_order,
        o.order_number,
        o.created_at AS order_date,
        p.name AS part_name,
        c.name AS color_name,
        pc.purchase_price AS current_purchase_price,
        pc.selling_price AS current_selling_price
      FROM order_items oi
      JOIN orders o ON oi.order_id = o.id
      JOIN parts_colors pc ON oi.part_color_id = pc.id
      JOIN parts p ON pc.part_id = p.id
      JOIN colors c ON pc.color_id = c.id
      WHERE oi.quantity_backorder > 0 OR oi.item_status = 'backorder'
      ORDER BY o.created_at DESC
    `);

    res.status(200).json({
      success: true,
      count: backorders.length,
      data: backorders,
    });
  } catch (error) {
    console.error('Get backorders error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// GET - Get order status history
exports.getOrderHistory = async (req, res) => {
  try {
    const [history] = await db.query(
      `
      SELECT 
        osh.id,
        osh.order_id,
        osh.old_status,
        osh.new_status,
        osh.notes,
        osh.created_at,
        u.username AS changed_by_username,
        u.full_name AS changed_by_name
      FROM order_status_history osh
      LEFT JOIN users u ON osh.changed_by = u.id
      WHERE osh.order_id = ?
      ORDER BY osh.created_at DESC
    `,
      [req.params.id],
    );

    res.status(200).json({
      success: true,
      count: history.length,
      data: history,
    });
  } catch (error) {
    console.error('Get order history error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};
