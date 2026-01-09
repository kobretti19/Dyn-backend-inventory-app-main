const db = require('../db'); // GET - Get all equipment (with soft delete filter)
// GET - Get all equipment with creator info
exports.getAllEquipment = async (req, res) => {
  try {
    const query = `
      SELECT 
        e.id,
        e.model,
        e.serial_number,
        e.brand_id,
        e.category_id,
        e.user_id,
        e.year_manufactured,
        e.production_date,
        e.status,
        e.created_at,
        e.updated_at,
        b.name AS brand_name,
        c.name AS category_name,
        u.username AS created_by_username,
        u.full_name AS created_by_name
      FROM equipment e
      LEFT JOIN brands b ON e.brand_id = b.id
      LEFT JOIN categories c ON e.category_id = c.id
      LEFT JOIN users u ON e.user_id = u.id
      WHERE e.deleted_at IS NULL
      ORDER BY e.created_at DESC
    `;

    const [rows] = await db.query(query);

    res.status(200).json({
      success: true,
      count: rows.length,
      data: rows,
    });
  } catch (error) {
    console.error('Get all equipment error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// GET - Get equipment with details using view
exports.getEquipmentDetailed = async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT * FROM v_equipment_details ORDER BY model'
    );
    res.status(200).json({
      success: true,
      count: rows.length,
      data: rows,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
}; // GET - Get equipment by ID with full details
exports.getEquipmentById = async (req, res) => {
  try {
    const query = `
SELECT
  e.*,
  c.name AS category_name,
  b.name AS brand_name,
  JSON_ARRAYAGG(
    JSON_OBJECT(
      'part_id', p.id,
      'part_name', p.name,
      'color_id', col.id,
      'color_name', col.name,
      'quantity_needed', ep.quantity_needed,
      'notes', ep.notes
    )
  ) as parts_used
FROM equipment e
LEFT JOIN categories c ON e.category_id = c.id
LEFT JOIN brands b ON e.brand_id = b.id
LEFT JOIN equipment_parts ep ON e.id = ep.equipment_id
LEFT JOIN parts_colors pc ON ep.part_color_id = pc.id
LEFT JOIN parts p ON pc.part_id = p.id
LEFT JOIN colors col ON pc.color_id = col.id
WHERE e.id = ? AND e.deleted_at IS NULL
GROUP BY e.id
`;
    const [rows] = await db.query(query, [req.params.id]);
    if (rows.length === 0) {
      return res
        .status(404)
        .json({ success: false, error: 'Equipment not found' });
    }
    res.status(200).json({ success: true, data: rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
}; // GET - Get equipment by category
exports.getEquipmentByCategory = async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT * FROM equipment WHERE category_id = ? AND deleted_at IS NULL ORDER BY model',
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
}; // GET - Get equipment by brand
exports.getEquipmentByBrand = async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT * FROM equipment WHERE brand_id = ? AND deleted_at IS NULL ORDER BY model',
      [req.params.brandId]
    );
    res.status(200).json({
      success: true,
      count: rows.length,
      data: rows,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
}; // GET - Get equipment by status
exports.getEquipmentByStatus = async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT * FROM equipment WHERE status = ? AND deleted_at IS NULL ORDER BY model',
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

// GET - Get equipment with parts
exports.getEquipmentWithParts = async (req, res) => {
  try {
    const query = `
      SELECT 
        e.id,
        e.model,
        e.serial_number,
        e.brand_id,
        e.category_id,
        e.user_id,
        e.created_at,
        b.name AS brand_name,
        c.name AS category_name,
        u.username AS created_by_username,
        u.full_name AS created_by_name,
        JSON_ARRAYAGG(
          JSON_OBJECT(
            'part_color_id', ep.part_color_id,
            'quantity', ep.quantity,
            'part_name', p.name,
            'color_name', col.name
          )
        ) AS parts
      FROM equipment e
      LEFT JOIN brands b ON e.brand_id = b.id
      LEFT JOIN categories c ON e.category_id = c.id
      LEFT JOIN users u ON e.user_id = u.id
      LEFT JOIN equipment_parts ep ON e.id = ep.equipment_id
      LEFT JOIN parts_colors pc ON ep.part_color_id = pc.id
      LEFT JOIN parts p ON pc.part_id = p.id
      LEFT JOIN colors col ON pc.color_id = col.id
      WHERE e.deleted_at IS NULL
      GROUP BY e.id, e.model, e.serial_number, e.brand_id, e.category_id, e.user_id, e.created_at, b.name, c.name, u.username, u.full_name
      ORDER BY e.created_at DESC
    `;

    const [rows] = await db.query(query);

    // Parse JSON_ARRAYAGG results
    const equipment = rows.map((row) => ({
      ...row,
      parts: row.parts
        ? JSON.parse(row.parts).filter((p) => p.part_color_id !== null)
        : [],
    }));

    res.status(200).json({
      success: true,
      count: equipment.length,
      data: equipment,
    });
  } catch (error) {
    console.error('Get equipment with parts error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// POST - Create equipment with parts and reduce inventory
exports.createEquipment = async (req, res) => {
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const {
      model,
      category_id,
      brand_id,
      serial_number,
      year_manufactured,
      production_date,
      status = 'active',
      parts, // [{ part_id, color_id, quantity, notes }]
    } = req.body;

    const user_id = req.user?.id || null;

    // =========================
    // VALIDATION
    // =========================
    if (!model) {
      return res.status(400).json({
        success: false,
        error: 'Model is required',
      });
    }

    if (!parts || !Array.isArray(parts) || parts.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Parts are required',
      });
    }

    // Check duplicate serial number
    if (serial_number) {
      const [existing] = await connection.query(
        'SELECT id FROM equipment WHERE serial_number = ? AND deleted_at IS NULL',
        [serial_number]
      );

      if (existing.length > 0) {
        await connection.rollback();
        return res.status(400).json({
          success: false,
          error: 'Serial number already exists',
        });
      }
    }

    // =========================
    // INSERT EQUIPMENT
    // =========================
    const [equipmentResult] = await connection.query(
      `INSERT INTO equipment 
       (user_id, model, category_id, brand_id, serial_number, year_manufactured, production_date, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        user_id,
        model,
        category_id,
        brand_id,
        serial_number,
        year_manufactured,
        production_date,
        status,
      ]
    );

    const equipment_id = equipmentResult.insertId;

    // =========================
    // PROCESS PARTS
    // =========================
    for (const part of parts) {
      const { part_id, color_id, quantity, notes } = part;

      if (!part_id || !color_id || !quantity || quantity <= 0) {
        await connection.rollback();
        return res.status(400).json({
          success: false,
          error: 'Invalid part data provided',
        });
      }

      // Get part_color
      const [partColor] = await connection.query(
        'SELECT id, quantity, min_stock_level FROM parts_colors WHERE part_id = ? AND color_id = ?',
        [part_id, color_id]
      );

      if (partColor.length === 0) {
        await connection.rollback();
        return res.status(400).json({
          success: false,
          error: `Part ${part_id} with color ${color_id} not found`,
        });
      }

      const part_color_id = partColor[0].id;
      const available_quantity = partColor[0].quantity;

      if (available_quantity < quantity) {
        await connection.rollback();
        return res.status(400).json({
          success: false,
          error: `Insufficient stock for part ${part_id} (${color_id}). Available: ${available_quantity}, Needed: ${quantity}`,
        });
      }

      // =========================
      // INSERT EQUIPMENT PART
      // =========================
      await connection.query(
        `INSERT INTO equipment_parts 
         (equipment_id, part_color_id, quantity_needed, notes)
         VALUES (?, ?, ?, ?)`,
        [
          equipment_id,
          part_color_id,
          quantity,
          notes || `Used for equipment: ${model}`,
        ]
      );

      // =========================
      // UPDATE STOCK QUANTITY
      // =========================
      await connection.query(
        'UPDATE parts_colors SET quantity = quantity - ? WHERE id = ?',
        [quantity, part_color_id]
      );

      // =========================
      // RECORD STOCK MOVEMENT (OUT)
      // =========================
      await connection.query(
        `INSERT INTO stock_movements
         (part_color_id, movement_type, quantity, reference_type, reference_id, user_id, notes)
         VALUES (?, 'out', ?, 'equipment', ?, ?, ?)`,
        [
          part_color_id,
          quantity,
          equipment_id,
          user_id,
          `Consumed by equipment: ${model}`,
        ]
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
    }

    await connection.commit();

    // =========================
    // RETURN CREATED EQUIPMENT
    // =========================
    const [createdEquipment] = await connection.query(
      `SELECT 
        e.*,
        c.name AS category_name,
        b.name AS brand_name,
        u.username AS created_by_username,
        u.full_name AS created_by_name,
        JSON_ARRAYAGG(
          JSON_OBJECT(
            'part_name', p.name,
            'color_name', col.name,
            'quantity', ep.quantity_needed,
            'notes', ep.notes
          )
        ) AS parts_used
       FROM equipment e
       LEFT JOIN categories c ON e.category_id = c.id
       LEFT JOIN brands b ON e.brand_id = b.id
       LEFT JOIN users u ON e.user_id = u.id
       LEFT JOIN equipment_parts ep ON e.id = ep.equipment_id
       LEFT JOIN parts_colors pc ON ep.part_color_id = pc.id
       LEFT JOIN parts p ON pc.part_id = p.id
       LEFT JOIN colors col ON pc.color_id = col.id
       WHERE e.id = ?
       GROUP BY e.id`,
      [equipment_id]
    );

    res.status(201).json({
      success: true,
      data: createdEquipment[0],
    });
  } catch (error) {
    await connection.rollback();
    res.status(500).json({
      success: false,
      error: error.message,
    });
  } finally {
    connection.release();
  }
};

// PUT - Update equipment
exports.updateEquipment = async (req, res) => {
  try {
    const {
      model,
      category_id,
      brand_id,
      serial_number,
      year_manufactured,
      production_date,
      status,
    } = req.body; // Check if equipment exists
    const [existing] = await db.query(
      'SELECT id FROM equipment WHERE id = ? AND deleted_at IS NULL',
      [req.params.id]
    );
    if (existing.length === 0) {
      return res
        .status(404)
        .json({ success: false, error: 'Equipment not found' });
    } // Check for duplicate serial number (excluding current equipment)
    if (serial_number) {
      const [duplicate] = await db.query(
        'SELECT id FROM equipment WHERE serial_number = ? AND id != ? AND deleted_at IS NULL',
        [serial_number, req.params.id]
      );
      if (duplicate.length > 0) {
        return res.status(400).json({
          success: false,
          error: 'Serial number already exists',
        });
      }
    }
    const [result] = await db.query(
      'UPDATE equipment SET model = ?, category_id = ?, brand_id = ?, serial_number = ?, year_manufactured = ?, production_date = ?, status = ? WHERE id = ?',
      [
        model,
        category_id,
        brand_id,
        serial_number,
        year_manufactured,
        production_date,
        status,
        req.params.id,
      ]
    );
    res.status(200).json({
      success: true,
      data: {
        id: req.params.id,
        model,
        category_id,
        brand_id,
        serial_number,
        year_manufactured,
        production_date,
        status,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
}; // DELETE - Soft delete equipment
exports.deleteEquipment = async (req, res) => {
  try {
    const [result] = await db.query(
      'UPDATE equipment SET deleted_at = NOW() WHERE id = ? AND deleted_at IS NULL',
      [req.params.id]
    );
    if (result.affectedRows === 0) {
      return res
        .status(404)
        .json({ success: false, error: 'Equipment not found' });
    }
    res
      .status(200)
      .json({ success: true, message: 'Equipment deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// GET - Get equipment with parts
exports.getEquipmentWithParts = async (req, res) => {
  try {
    const query = `
      SELECT 
        e.id,
        e.model,
        e.serial_number,
        e.brand_id,
        e.category_id,
        e.user_id,
        e.created_at,
        b.name AS brand_name,
        c.name AS category_name,
        u.username AS created_by_username,
        u.full_name AS created_by_name,
        JSON_ARRAYAGG(
          JSON_OBJECT(
            'part_color_id', ep.part_color_id,
            'quantity', ep.quantity,
            'part_name', p.name,
            'color_name', col.name
          )
        ) AS parts
      FROM equipment e
      LEFT JOIN brands b ON e.brand_id = b.id
      LEFT JOIN categories c ON e.category_id = c.id
      LEFT JOIN users u ON e.user_id = u.id
      LEFT JOIN equipment_parts ep ON e.id = ep.equipment_id
      LEFT JOIN parts_colors pc ON ep.part_color_id = pc.id
      LEFT JOIN parts p ON pc.part_id = p.id
      LEFT JOIN colors col ON pc.color_id = col.id
      WHERE e.deleted_at IS NULL
      GROUP BY e.id, e.model, e.serial_number, e.brand_id, e.category_id, e.user_id, e.created_at, b.name, c.name, u.username, u.full_name
      ORDER BY e.created_at DESC
    `;

    const [rows] = await db.query(query);

    // Parse JSON_ARRAYAGG results
    const equipment = rows.map((row) => ({
      ...row,
      parts: row.parts
        ? JSON.parse(row.parts).filter((p) => p.part_color_id !== null)
        : [],
    }));

    res.status(200).json({
      success: true,
      count: equipment.length,
      data: equipment,
    });
  } catch (error) {
    console.error('Get equipment with parts error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// GET - Get low stock alerts
exports.getLowStockAlerts = async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT * FROM v_low_stock_alert ORDER BY shortage DESC'
    );
    res.status(200).json({
      success: true,
      count: rows.length,
      data: rows,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
}; // GET - Get parts inventory
exports.getPartsInventory = async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT * FROM v_parts_inventory ORDER BY part_name, color_name'
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