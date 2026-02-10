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
        COALESCE(SUM(oi.quantity_ordered), 0) AS total_quantity,
        COALESCE(SUM(oi.quantity_delivered), 0) AS total_delivered,
        COALESCE(SUM(oi.quantity_backorder), 0) AS total_backorder
      FROM orders o
      LEFT JOIN order_items oi ON oi.order_id = o.id
      LEFT JOIN users u ON o.user_id = u.id
      GROUP BY o.id, o.order_number, o.status, o.created_at, o.notes, o.total_amount, u.full_name
      ORDER BY o.created_at DESC
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

    if (!orderId) {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        error: 'Order ID is required',
      });
    }

    const [orders] = await connection.query(
      'SELECT * FROM orders WHERE id = ?',
      [parseInt(orderId)]
    );

    if (orders.length === 0) {
      await connection.rollback();
      return res.status(404).json({
        success: false,
        error: `Order not found with ID: ${orderId}`,
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

    // Handle delivery items
    if ((status === 'delivered' || status === 'partial') && items && items.length > 0) {
      for (const item of items) {
        const receivingQty = parseInt(item.quantity_delivered) || 0;

        // Get current order item data
        const [orderItemRows] = await connection.query(
          'SELECT * FROM order_items WHERE id = ?',
          [item.id]
        );

        if (orderItemRows.length === 0) continue;

        const orderItem = orderItemRows[0];
        const ordered = orderItem.quantity_ordered || 0;
        const alreadyDelivered = orderItem.quantity_delivered || 0;

        // Calculate new totals
        const newTotalDelivered = alreadyDelivered + receivingQty;
        const newBackorder = Math.max(0, ordered - newTotalDelivered);

        // Determine item status based on THIS ITEM's quantities
        let itemStatus;
        if (item.item_status === 'cancelled') {
          // If manually set to cancelled, keep it
          itemStatus = 'cancelled';
        } else if (newTotalDelivered === 0) {
          itemStatus = 'backorder';
        } else if (newTotalDelivered >= ordered) {
          // Delivered >= Ordered means fully delivered (even if over-delivered)
          itemStatus = 'delivered';
        } else if (newBackorder > 0) {
          itemStatus = 'partial';
        } else {
          itemStatus = 'delivered';
        }

        console.log(`Item ${item.id}: ordered=${ordered}, delivered=${newTotalDelivered}, backorder=${newBackorder}, status=${itemStatus}`);

        // Update order item
        await connection.query(
          `UPDATE order_items 
           SET quantity_delivered = ?, 
               quantity_backorder = ?,
               status = ?
           WHERE id = ?`,
          [newTotalDelivered, newBackorder, itemStatus, item.id]
        );

        // Add to stock if receiving
        if (receivingQty > 0) {
          const partId = orderItem.part_id;

          // Update part quantity
          await connection.query(
            'UPDATE parts SET quantity = quantity + ? WHERE id = ?',
            [receivingQty, partId]
          );

          // Record stock movement
          await connection.query(
            `INSERT INTO stock_movements 
             (part_id, movement_type, quantity, reference_type, reference_id, user_id, notes)
             VALUES (?, 'in', ?, 'order', ?, ?, ?)`,
            [partId, receivingQty, orderId, userId, `Order ${order.order_number} delivery`]
          );
        }
      }
    }

    // Calculate OVERALL order status based on ALL items
    const [allItems] = await connection.query(
      'SELECT status, quantity_ordered, quantity_delivered, quantity_backorder FROM order_items WHERE order_id = ?',
      [orderId]
    );

    let overallStatus = status; // Default to requested status

    if (allItems.length > 0) {
      const allDelivered = allItems.every((i) => i.status === 'delivered' || i.quantity_delivered >= i.quantity_ordered);
      const allCancelled = allItems.every((i) => i.status === 'cancelled');
      const someDelivered = allItems.some((i) => i.quantity_delivered > 0);
      const hasBackorder = allItems.some((i) => i.quantity_backorder > 0);

      if (allCancelled) {
        overallStatus = 'cancelled';
      } else if (allDelivered) {
        overallStatus = 'delivered';
      } else if (someDelivered || hasBackorder) {
        overallStatus = 'partial';
      }
    }

    // Update order status
    await connection.query(
      `UPDATE orders SET status = ?, status_history = ? WHERE id = ?`,
      [overallStatus, JSON.stringify(statusHistory), parseInt(orderId)]
    );

    await connection.commit();

    res.status(200).json({
      success: true,
      message: 'Order status updated',
      orderStatus: overallStatus,
    });
  } catch (error) {
    await connection.rollback();
    console.error('Update status error:', error);
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


// GET all order items with part details
exports.getPartsSummary = async (req, res) => {
  try {
    const [items] = await db.query(`
      SELECT 
        p.id AS part_id,
        p.name AS part_name,
        p.color AS part_color,
        p.sku,
        p.quantity AS current_stock,
        p.min_stock_level,
        p.purchase_price,
        oi.id AS order_item_id,
        oi.quantity_ordered,
        oi.quantity_delivered,
        oi.quantity_backorder,
        oi.unit_price,
        oi.notes AS item_notes,
        oi.status AS item_status,
        o.id AS order_id,
        o.order_number,
        o.status AS order_status,
        o.created_at AS order_date,
        o.notes AS order_notes,
        u.full_name AS ordered_by
      FROM order_items oi
      JOIN parts p ON oi.part_id = p.id
      JOIN orders o ON oi.order_id = o.id
      LEFT JOIN users u ON o.user_id = u.id
      WHERE o.status NOT IN ('cancelled')
        AND p.deleted_at IS NULL
      ORDER BY o.created_at DESC
    `);

    // Calculate totals
    const totals = {
      total_items: items.length,
      total_ordered: items.reduce((sum, i) => sum + (i.quantity_ordered || 0), 0),
      total_delivered: items.reduce((sum, i) => sum + (i.quantity_delivered || 0), 0),
      total_backorder: items.reduce((sum, i) => sum + (i.quantity_backorder || 0), 0),
      total_value: items.reduce((sum, i) => sum + ((i.unit_price || 0) * (i.quantity_ordered || 0)), 0),
    };

    console.log(totals)

    // Group by part for summary
    const partsSummary = {};
    items.forEach((item) => {
      if (!partsSummary[item.part_id]) {
        partsSummary[item.part_id] = {
          part_id: item.part_id,
          part_name: item.part_name,
          part_color: item.part_color,
          sku: item.sku,
          current_stock: item.current_stock,
          min_stock_level: item.min_stock_level,
          total_ordered: 0,
          total_delivered: 0,
          total_backorder: 0,
          order_count: 0,
        };
      }
      partsSummary[item.part_id].total_ordered += item.quantity_ordered || 0;
      partsSummary[item.part_id].total_delivered += item.quantity_delivered || 0;
      partsSummary[item.part_id].total_backorder += item.quantity_backorder || 0;
      partsSummary[item.part_id].order_count++;
    });

    res.status(200).json({
      success: true,
      data: {
        items,  // All order items
        parts: Object.values(partsSummary),  // Grouped by part
        totals,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// GET backorder items only
exports.getBackorderParts = async (req, res) => {
  try {
    const [items] = await db.query(`
      SELECT 
        p.id AS part_id,
        p.name AS part_name,
        p.color AS part_color,
        p.sku,
        p.quantity AS current_stock,
        p.purchase_price,
        oi.id AS order_item_id,
        oi.quantity_ordered,
        oi.quantity_delivered,
        oi.quantity_backorder,
        oi.notes AS item_notes,
        o.id AS order_id,
        o.order_number,
        o.status AS order_status,
        o.created_at AS order_date,
        u.full_name AS ordered_by
      FROM order_items oi
      JOIN parts p ON oi.part_id = p.id
      JOIN orders o ON oi.order_id = o.id
      LEFT JOIN users u ON o.user_id = u.id
      WHERE oi.quantity_backorder > 0
        AND o.status NOT IN ('delivered', 'cancelled')
        AND p.deleted_at IS NULL
      ORDER BY oi.quantity_backorder DESC, o.created_at ASC
    `);

    // Calculate totals
    const totals = {
      total_items: items.length,
      total_backorder: items.reduce((sum, i) => sum + (i.quantity_backorder || 0), 0),
      unique_parts: new Set(items.map((i) => i.part_id)).size,
      unique_orders: new Set(items.map((i) => i.order_id)).size,
    };

    res.status(200).json({
      success: true,
      data: items,
      totals,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};