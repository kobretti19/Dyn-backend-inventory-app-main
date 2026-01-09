const db = require('../db');

// GET all parts colors - prices come from parts table
exports.getAllPartsColors = async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT 
        pc.id,
        pc.part_id,
        pc.color_id,
        pc.quantity,
        pc.min_stock_level,
        pc.order_number,
        p.name AS part_name,
        p.purchase_price,
        p.selling_price,
        c.name AS color_name,
        pcat.name AS category_name,
        CASE 
          WHEN pc.quantity = 0 THEN 'out_of_stock'
          WHEN pc.quantity <= pc.min_stock_level THEN 'low_stock'
          ELSE 'in_stock'
        END AS stock_status
      FROM parts_colors pc
      LEFT JOIN parts p ON pc.part_id = p.id
      LEFT JOIN colors c ON pc.color_id = c.id
      LEFT JOIN parts_categories pcat ON p.part_category_id = pcat.id
      WHERE p.deleted_at IS NULL
      ORDER BY pc.id DESC
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

// GET - Get colors for specific part
exports.getColorsByPart = async (req, res) => {
  try {
    const query = `
      SELECT 
        pc.id,
        pc.part_id,
        pc.color_id,
        pc.quantity,
        pc.min_stock_level,
        pc.order_number,
        c.name AS color_name,
        p.purchase_price,
        p.selling_price,
        CASE 
          WHEN pc.quantity = 0 THEN 'out_of_stock'
          WHEN pc.quantity <= pc.min_stock_level THEN 'low_stock'
          ELSE 'in_stock'
        END AS stock_status
      FROM parts_colors pc
      JOIN colors c ON pc.color_id = c.id
      JOIN parts p ON pc.part_id = p.id
      WHERE pc.part_id = ?
      ORDER BY c.name
    `;
    const [rows] = await db.query(query, [req.params.partId]);
    res.status(200).json({
      success: true,
      count: rows.length,
      data: rows,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// GET - Get parts with specific color
exports.getPartsByColor = async (req, res) => {
  try {
    const query = `
      SELECT 
        pc.id,
        pc.part_id,
        pc.color_id,
        pc.quantity,
        pc.min_stock_level,
        pc.order_number,
        p.name AS part_name,
        p.description,
        p.purchase_price,
        p.selling_price,
        c.name AS color_name,
        CASE 
          WHEN pc.quantity = 0 THEN 'out_of_stock'
          WHEN pc.quantity <= pc.min_stock_level THEN 'low_stock'
          ELSE 'in_stock'
        END AS stock_status
      FROM parts_colors pc
      JOIN parts p ON pc.part_id = p.id
      JOIN colors c ON pc.color_id = c.id
      WHERE pc.color_id = ? AND p.deleted_at IS NULL
      ORDER BY p.name
    `;
    const [rows] = await db.query(query, [req.params.colorId]);
    res.status(200).json({
      success: true,
      count: rows.length,
      data: rows,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// GET - Get low stock items
exports.getLowStockItems = async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT 
        pc.id,
        pc.part_id,
        pc.color_id,
        pc.quantity,
        pc.min_stock_level,
        pc.order_number,
        p.name AS part_name,
        p.purchase_price,
        p.selling_price,
        c.name AS color_name,
        pcat.name AS category_name,
        CASE 
          WHEN pc.quantity = 0 THEN 'out_of_stock'
          WHEN pc.quantity <= pc.min_stock_level THEN 'low_stock'
          ELSE 'in_stock'
        END AS stock_status
      FROM parts_colors pc
      LEFT JOIN parts p ON pc.part_id = p.id
      LEFT JOIN colors c ON pc.color_id = c.id
      LEFT JOIN parts_categories pcat ON p.part_category_id = pcat.id
      WHERE pc.quantity <= pc.min_stock_level AND p.deleted_at IS NULL
      ORDER BY pc.quantity ASC
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

// POST - Add color to part
exports.addColorToPart = async (req, res) => {
  try {
    const {
      part_id,
      color_id,
      quantity = 0,
      min_stock_level = 5,
      order_number,
    } = req.body;

    console.log('Received data:', req.body);

    if (!part_id || !color_id) {
      return res.status(400).json({
        success: false,
        error: 'Part ID and Color ID are required',
      });
    }

    // Check if combination already exists
    const [existing] = await db.query(
      'SELECT id FROM parts_colors WHERE part_id = ? AND color_id = ?',
      [part_id, color_id]
    );

    if (existing.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'This part-color combination already exists',
      });
    }

    const status =
      quantity === 0
        ? 'out_of_stock'
        : quantity <= min_stock_level
        ? 'low_stock'
        : 'in_stock';

    const [result] = await db.query(
      'INSERT INTO parts_colors (part_id, color_id, quantity, min_stock_level, order_number, status) VALUES (?, ?, ?, ?, ?, ?)',
      [
        part_id,
        color_id,
        quantity,
        min_stock_level,
        order_number || null,
        status,
      ]
    );

    // Fetch the created record with part prices
    const [created] = await db.query(
      `
      SELECT 
        pc.*,
        p.name AS part_name,
        p.purchase_price,
        p.selling_price,
        c.name AS color_name
      FROM parts_colors pc
      JOIN parts p ON pc.part_id = p.id
      JOIN colors c ON pc.color_id = c.id
      WHERE pc.id = ?
    `,
      [result.insertId]
    );

    res.status(201).json({
      success: true,
      data: created[0],
    });
  } catch (error) {
    console.error('Add color to part error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// PUT - Update part color
exports.updatePartColor = async (req, res) => {
  try {
    const { part_id, color_id, quantity, min_stock_level, order_number } =
      req.body;

    console.log('=== UPDATE PART COLOR DEBUG ===');
    console.log('ID:', req.params.id);
    console.log('Request body:', req.body);
    console.log('===============================');

    const [existing] = await db.query(
      'SELECT * FROM parts_colors WHERE id = ?',
      [req.params.id]
    );

    if (existing.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Part color relationship not found',
      });
    }

    // Use existing values if not provided
    const finalQuantity =
      quantity !== undefined ? parseInt(quantity) : existing[0].quantity;
    const finalMinStock =
      min_stock_level !== undefined
        ? parseInt(min_stock_level)
        : existing[0].min_stock_level;
    const finalPartId =
      part_id !== undefined ? parseInt(part_id) : existing[0].part_id;
    const finalColorId =
      color_id !== undefined ? parseInt(color_id) : existing[0].color_id;
    const finalOrderNumber =
      order_number !== undefined ? order_number : existing[0].order_number;

    const status =
      finalQuantity === 0
        ? 'out_of_stock'
        : finalQuantity <= finalMinStock
        ? 'low_stock'
        : 'in_stock';

    await db.query(
      `UPDATE parts_colors 
       SET part_id = ?, 
           color_id = ?, 
           quantity = ?, 
           min_stock_level = ?, 
           order_number = ?, 
           status = ? 
       WHERE id = ?`,
      [
        finalPartId,
        finalColorId,
        finalQuantity,
        finalMinStock,
        finalOrderNumber,
        status,
        req.params.id,
      ]
    );

    // Fetch updated record with part prices
    const [updated] = await db.query(
      `
      SELECT 
        pc.*,
        p.name AS part_name,
        p.purchase_price,
        p.selling_price,
        c.name AS color_name,
        CASE 
          WHEN pc.quantity = 0 THEN 'out_of_stock'
          WHEN pc.quantity <= pc.min_stock_level THEN 'low_stock'
          ELSE 'in_stock'
        END AS stock_status
      FROM parts_colors pc
      JOIN parts p ON pc.part_id = p.id
      JOIN colors c ON pc.color_id = c.id
      WHERE pc.id = ?
    `,
      [req.params.id]
    );

    res.status(200).json({
      success: true,
      data: updated[0],
    });
  } catch (error) {
    console.error('Update part color error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// PATCH - Update only quantity (for inventory adjustments)
exports.updateQuantity = async (req, res) => {
  try {
    const { quantity, adjustment_type } = req.body;

    const [existing] = await db.query(
      'SELECT quantity, min_stock_level FROM parts_colors WHERE id = ?',
      [req.params.id]
    );

    if (existing.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Part color relationship not found',
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

    const min_stock = existing[0].min_stock_level;
    const status =
      newQuantity === 0
        ? 'out_of_stock'
        : newQuantity <= min_stock
        ? 'low_stock'
        : 'in_stock';

    await db.query(
      'UPDATE parts_colors SET quantity = ?, status = ? WHERE id = ?',
      [newQuantity, status, req.params.id]
    );

    res.status(200).json({
      success: true,
      data: {
        id: req.params.id,
        quantity: newQuantity,
        status,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// DELETE - Remove color from part
exports.deletePartColor = async (req, res) => {
  try {
    const [result] = await db.query('DELETE FROM parts_colors WHERE id = ?', [
      req.params.id,
    ]);
    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        error: 'Part color relationship not found',
      });
    }
    res.status(200).json({
      success: true,
      message: 'Part color relationship deleted successfully',
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};
