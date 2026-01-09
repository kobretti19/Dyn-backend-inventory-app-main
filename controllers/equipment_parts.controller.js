const db = require('../db');

// GET - Get all equipment parts relationships with details
exports.getAllEquipmentParts = async (req, res) => {
  try {
    const query = `
      SELECT 
        ep.*,
        e.model AS equipment_model,
        e.serial_number,
        p.name AS part_name,
        c.name AS color_name,
        pc.quantity AS available_quantity
      FROM equipment_parts ep
      JOIN equipment e ON ep.equipment_id = e.id
      JOIN parts_colors pc ON ep.part_color_id = pc.id
      JOIN parts p ON pc.part_id = p.id
      JOIN colors c ON pc.color_id = c.id
      WHERE e.deleted_at IS NULL
      ORDER BY e.model, p.name
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

// GET - Get parts for specific equipment
exports.getPartsByEquipment = async (req, res) => {
  try {
    const query = `
      SELECT 
        ep.*,
        p.name AS part_name,
        p.description,
        p.price,
        c.name AS color_name,
        pc.quantity AS available_quantity
      FROM equipment_parts ep
      JOIN parts_colors pc ON ep.part_color_id = pc.id
      JOIN parts p ON pc.part_id = p.id
      JOIN colors c ON pc.color_id = c.id
      WHERE ep.equipment_id = ?
      ORDER BY p.name
    `;
    const [rows] = await db.query(query, [req.params.equipmentId]);
    res.status(200).json({
      success: true,
      count: rows.length,
      data: rows,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// GET - Get equipment using specific part
exports.getEquipmentByPart = async (req, res) => {
  try {
    const query = `
      SELECT 
        ep.*,
        e.model,
        e.serial_number,
        e.status
      FROM equipment_parts ep
      JOIN equipment e ON ep.equipment_id = e.id
      WHERE ep.part_color_id = ? AND e.deleted_at IS NULL
      ORDER BY e.model
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

// POST - Add part to equipment (with inventory check and reduction)
exports.addPartToEquipment = async (req, res) => {
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const { equipment_id, part_color_id, quantity_needed, notes } = req.body;

    if (!equipment_id || !part_color_id) {
      return res.status(400).json({
        success: false,
        error: 'Equipment ID and Part Color ID are required',
      });
    }

    // Check available quantity
    const [partColor] = await connection.query(
      'SELECT quantity FROM parts_colors WHERE id = ?',
      [part_color_id]
    );

    if (partColor.length === 0) {
      await connection.rollback();
      return res.status(404).json({
        success: false,
        error: 'Part color combination not found',
      });
    }

    if (partColor[0].quantity < quantity_needed) {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        error: `Insufficient quantity. Available: ${partColor[0].quantity}, Needed: ${quantity_needed}`,
      });
    }

    // Add to equipment_parts
    const [result] = await connection.query(
      'INSERT INTO equipment_parts (equipment_id, part_color_id, quantity_needed, notes) VALUES (?, ?, ?, ?)',
      [equipment_id, part_color_id, quantity_needed, notes]
    );

    // Reduce inventory
    await connection.query(
      'UPDATE parts_colors SET quantity = quantity - ? WHERE id = ?',
      [quantity_needed, part_color_id]
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
      [part_color_id]
    );

    await connection.commit();

    res.status(201).json({
      success: true,
      data: {
        id: result.insertId,
        equipment_id,
        part_color_id,
        quantity_needed,
        notes,
      },
    });
  } catch (error) {
    await connection.rollback();
    res.status(500).json({ success: false, error: error.message });
  } finally {
    connection.release();
  }
};

// PUT - Update equipment part
exports.updateEquipmentPart = async (req, res) => {
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const { equipment_id, part_color_id, quantity_needed, notes } = req.body;

    // Get old quantity
    const [oldRecord] = await connection.query(
      'SELECT part_color_id, quantity_needed FROM equipment_parts WHERE id = ?',
      [req.params.id]
    );

    if (oldRecord.length === 0) {
      await connection.rollback();
      return res.status(404).json({
        success: false,
        error: 'Equipment part relationship not found',
      });
    }

    const old_part_color_id = oldRecord[0].part_color_id;
    const old_quantity = oldRecord[0].quantity_needed;

    // Restore old quantity
    await connection.query(
      'UPDATE parts_colors SET quantity = quantity + ? WHERE id = ?',
      [old_quantity, old_part_color_id]
    );

    // Check new quantity availability
    const [newPartColor] = await connection.query(
      'SELECT quantity FROM parts_colors WHERE id = ?',
      [part_color_id]
    );

    if (newPartColor[0].quantity < quantity_needed) {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        error: `Insufficient quantity. Available: ${newPartColor[0].quantity}, Needed: ${quantity_needed}`,
      });
    }

    // Update record
    const [result] = await connection.query(
      'UPDATE equipment_parts SET equipment_id = ?, part_color_id = ?, quantity_needed = ?, notes = ? WHERE id = ?',
      [equipment_id, part_color_id, quantity_needed, notes, req.params.id]
    );

    // Reduce new quantity
    await connection.query(
      'UPDATE parts_colors SET quantity = quantity - ? WHERE id = ?',
      [quantity_needed, part_color_id]
    );

    // Update status for both parts
    await connection.query(
      `UPDATE parts_colors 
       SET status = CASE 
         WHEN quantity = 0 THEN 'out_of_stock'
         WHEN quantity <= min_stock_level THEN 'low_stock'
         ELSE 'in_stock'
       END
       WHERE id IN (?, ?)`,
      [old_part_color_id, part_color_id]
    );

    await connection.commit();

    res.status(200).json({
      success: true,
      data: {
        id: req.params.id,
        equipment_id,
        part_color_id,
        quantity_needed,
        notes,
      },
    });
  } catch (error) {
    await connection.rollback();
    res.status(500).json({ success: false, error: error.message });
  } finally {
    connection.release();
  }
};

// DELETE - Remove part from equipment (restore inventory)
exports.deleteEquipmentPart = async (req, res) => {
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    // Get record to restore quantity
    const [record] = await connection.query(
      'SELECT part_color_id, quantity_needed FROM equipment_parts WHERE id = ?',
      [req.params.id]
    );

    if (record.length === 0) {
      await connection.rollback();
      return res.status(404).json({
        success: false,
        error: 'Equipment part relationship not found',
      });
    }

    // Delete record
    await connection.query('DELETE FROM equipment_parts WHERE id = ?', [
      req.params.id,
    ]);

    // Restore quantity
    await connection.query(
      'UPDATE parts_colors SET quantity = quantity + ? WHERE id = ?',
      [record[0].quantity_needed, record[0].part_color_id]
    );

    // Update status
    await connection.query(
      `UPDATE parts_colors 
       SET status = CASE 
         WHEN quantity = 0 THEN 'out_of_stock'
         WHEN quantity <= min_stock_level THEN 'low_stock'
         ELSE 'in_stock'
       END
       WHERE id = ?`,
      [record[0].part_color_id]
    );

    await connection.commit();

    res.status(200).json({
      success: true,
      message: 'Equipment part relationship deleted and inventory restored',
    });
  } catch (error) {
    await connection.rollback();
    res.status(500).json({ success: false, error: error.message });
  } finally {
    connection.release();
  }
};
