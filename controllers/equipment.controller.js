const db = require('../db');

// GET all equipment with user info
exports.getAll = async (req, res) => {
  try {
    const [equipment] = await db.query(`
      SELECT 
        e.*,
        u.username AS created_by_username,
        u.full_name AS created_by_name,
        (SELECT COUNT(*) FROM equipment_parts WHERE equipment_id = e.id) AS parts_count
      FROM equipment e
      LEFT JOIN users u ON e.user_id = u.id
      ORDER BY e.created_at DESC
    `);

    res.json({
      success: true,
      data: equipment,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// GET single equipment by ID (with parts)
exports.getById = async (req, res) => {
  try {
    const [equipment] = await db.query(
      `SELECT 
        e.*, 
    et.name AS template_name, 
    et.category AS template_category
    FROM equipment AS e
    JOIN equipment_templates AS et ON et.id = e.template_id 
    WHERE e.id = 12 
    AND e.deleted_at IS NULL`,
      [req.params.id],
    );

    if (equipment.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Equipment not found',
      });
    }

    // Get associated parts
    const [parts] = await db.query(
      `
      SELECT 
        ep.id AS equipment_part_id,
        ep.quantity_needed,
        ep.notes AS part_notes,
        p.id AS part_id,
        p.name,
        p.color,
        p.category,
        p.sku,
        p.purchase_price,
        p.selling_price,
        p.quantity,
        p.status
      FROM equipment_parts ep
      JOIN parts p ON ep.part_id = p.id
      WHERE ep.equipment_id = ? AND p.deleted_at IS NULL
      ORDER BY p.name, p.color
    `,
      [req.params.id],
    );

    res.status(200).json({
      success: true,
      data: {
        ...equipment[0],
        parts,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// GET distinct brands (for dropdowns)
exports.getBrands = async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT DISTINCT brand 
      FROM equipment 
      WHERE brand IS NOT NULL AND deleted_at IS NULL
      UNION
      SELECT DISTINCT brand 
      FROM equipment_templates 
      WHERE brand IS NOT NULL
      ORDER BY brand
    `);

    res.status(200).json({
      success: true,
      data: rows.map((r) => r.brand),
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// GET distinct categories (for dropdowns)
exports.getCategories = async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT DISTINCT category 
      FROM equipment 
      WHERE category IS NOT NULL AND deleted_at IS NULL
      UNION
      SELECT DISTINCT category 
      FROM equipment_templates 
      WHERE category IS NOT NULL
      ORDER BY category
    `);

    res.status(200).json({
      success: true,
      data: rows.map((r) => r.category),
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.create = async (req, res) => {
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const {
      model,
      serial_number,
      brand,
      category,
      article_id,
      template_id,
      parts = [],
      save_as_template,
      template_name,
      production_date,
      year_manufactured,
    } = req.body;

    const userId = req.user?.id;

    if (!model) {
      return res
        .status(400)
        .json({ success: false, error: 'Model name is required' });
    }

    // 1. Get Template Details
    let templateParts = [];
    let templateNameAlias = null;

    if (template_id) {
      const [templateRows] = await connection.query(
        'SELECT name, parts_data FROM equipment_templates WHERE id = ?',
        [template_id],
      );

      if (templateRows.length > 0) {
        templateNameAlias = templateRows[0].name;
        // Safety check for JSON parsing
        try {
          templateParts =
            typeof templateRows[0].parts_data === 'string'
              ? JSON.parse(templateRows[0].parts_data)
              : templateRows[0].parts_data;
        } catch (e) {
          templateParts = [];
        }
      }
    }

    const partsToUse = parts.length > 0 ? parts : templateParts;

    // 2. Insert Equipment
    const [equipmentResult] = await connection.query(
      `INSERT INTO equipment 
       (model, serial_number, brand, category, article_id, template_id, created_from_template, user_id, production_date, year_manufactured)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        model,
        serial_number || null,
        brand || null,
        category || null,
        article_id || null,
        template_id || null,
        templateNameAlias,
        userId,
        production_date || null,
        year_manufactured || null,
      ],
    );

    const equipmentId = equipmentResult.insertId;

    // 3. Process Parts (Improved Loop)
    if (partsToUse && partsToUse.length > 0) {
      for (const part of partsToUse) {
        const partId = part.part_id;
        // Ensure quantity is a number to avoid string concatenation issues in SQL
        const qty = Number(part.quantity_needed || 1);

        if (!partId) continue; // Skip invalid entries

        // Add to equipment_parts
        await connection.query(
          `INSERT INTO equipment_parts (equipment_id, part_id, quantity_needed, notes) VALUES (?, ?, ?, ?)`,
          [equipmentId, partId, qty, part.notes || null],
        );

        // Reduce stock & Log movement
        await connection.query(
          `UPDATE parts SET quantity = quantity - ? WHERE id = ?`,
          [qty, partId],
        );

        await connection.query(
          `INSERT INTO stock_movements (part_id, movement_type, quantity, reference_type, reference_id, user_id, notes)
           VALUES (?, 'out', ?, 'production', ?, ?, ?)`,
          [partId, qty, equipmentId, userId, `Equipment: ${model}`],
        );
      }
    }

    // 4. Save as Template Logic
    if (save_as_template && template_name) {
      const partsDataJson = JSON.stringify(
        partsToUse.map((p) => ({
          part_id: p.part_id,
          quantity_needed: Number(p.quantity_needed || 1),
          notes: p.notes || '',
          // Avoid saving bulky part names/colors in JSON if possible; just IDs are cleaner
        })),
      );

      await connection.query(
        `INSERT INTO equipment_templates (name, brand, category, parts_data, user_id) VALUES (?, ?, ?, ?, ?)`,
        [template_name, brand || null, category || null, partsDataJson, userId],
      );
    }

    await connection.commit();

    // 5. Final Response (Fetch specific columns to avoid '3 created_at' issue)
    const [finalData] = await connection.query(
      `
      SELECT e.*, u.username AS created_by_username 
      FROM equipment e 
      LEFT JOIN users u ON e.user_id = u.id 
      WHERE e.id = ?`,
      [equipmentId],
    );

    res.status(201).json({ success: true, data: finalData[0] });
  } catch (error) {
    await connection.rollback();
    console.error('Creation Error:', error); // Log this to your terminal!
    res.status(500).json({ success: false, error: error.message });
  } finally {
    connection.release();
  }
};

// PUT update equipment
exports.update = async (req, res) => {
  try {
    const {
      model,
      brand,
      category,
      serial_number,
      year_manufactured,
      production_date,
      article_id,
      status,
    } = req.body;

    const [existing] = await db.query(
      'SELECT * FROM equipment WHERE id = ? AND deleted_at IS NULL',
      [req.params.id],
    );

    if (existing.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Equipment not found',
      });
    }

    const equip = existing[0];

    await db.query(
      `UPDATE equipment SET
        model = ?,
        brand = ?,
        category = ?,
        serial_number = ?,
        year_manufactured = ?,
        production_date = ?,
        article_id = ?,
        status = ?
       WHERE id = ?`,
      [
        model !== undefined ? model : equip.model,
        brand !== undefined ? brand : equip.brand,
        category !== undefined ? category : equip.category,
        serial_number !== undefined ? serial_number : equip.serial_number,
        year_manufactured !== undefined
          ? year_manufactured
          : equip.year_manufactured,
        production_date !== undefined ? production_date : equip.production_date,
        article_id !== undefined ? article_id : equip.article_id,
        status !== undefined ? status : equip.status,
        req.params.id,
      ],
    );

    const [updated] = await db.query('SELECT * FROM equipment WHERE id = ?', [
      req.params.id,
    ]);

    res.status(200).json({
      success: true,
      data: updated[0],
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// DELETE equipment (soft delete)
exports.delete = async (req, res) => {
  try {
    const [result] = await db.query(
      'UPDATE equipment SET deleted_at = NOW() WHERE id = ? AND deleted_at IS NULL',
      [req.params.id],
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        error: 'Equipment not found',
      });
    }

    res.status(200).json({
      success: true,
      message: 'Equipment deleted successfully',
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// POST add part to equipment
exports.addPart = async (req, res) => {
  try {
    const { part_id, quantity_needed = 1, notes } = req.body;

    // Check if equipment exists
    const [equipment] = await db.query(
      'SELECT id FROM equipment WHERE id = ? AND deleted_at IS NULL',
      [req.params.id],
    );

    if (equipment.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Equipment not found',
      });
    }

    // Check if part exists
    const [part] = await db.query(
      'SELECT id FROM parts WHERE id = ? AND deleted_at IS NULL',
      [part_id],
    );

    if (part.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Part not found',
      });
    }

    // Check if already added
    const [existing] = await db.query(
      'SELECT id FROM equipment_parts WHERE equipment_id = ? AND part_id = ?',
      [req.params.id, part_id],
    );

    if (existing.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'This part is already added to this equipment',
      });
    }

    await db.query(
      'INSERT INTO equipment_parts (equipment_id, part_id, quantity_needed, notes) VALUES (?, ?, ?, ?)',
      [req.params.id, part_id, quantity_needed, notes || null],
    );

    res.status(201).json({
      success: true,
      message: 'Part added to equipment',
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// DELETE remove part from equipment
exports.removePart = async (req, res) => {
  try {
    const [result] = await db.query(
      'DELETE FROM equipment_parts WHERE equipment_id = ? AND part_id = ?',
      [req.params.id, req.params.partId],
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        error: 'Part not found in this equipment',
      });
    }

    res.status(200).json({
      success: true,
      message: 'Part removed from equipment',
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// POST produce equipment (reduce stock)
exports.produce = async (req, res) => {
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const equipmentId = req.params.id;
    const userId = req.user?.id;

    // Get equipment parts
    const [parts] = await connection.query(
      `
      SELECT ep.part_id, ep.quantity_needed, p.quantity, p.name, p.color
      FROM equipment_parts ep
      JOIN parts p ON ep.part_id = p.id
      WHERE ep.equipment_id = ?
    `,
      [equipmentId],
    );

    // Check stock availability
    const insufficientParts = parts.filter(
      (p) => p.quantity < p.quantity_needed,
    );
    if (insufficientParts.length > 0) {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        error: 'Insufficient stock',
        insufficientParts: insufficientParts.map((p) => ({
          name: p.name,
          color: p.color,
          needed: p.quantity_needed,
          available: p.quantity,
        })),
      });
    }

    // Reduce stock and record movements
    for (const part of parts) {
      await connection.query(
        'UPDATE parts SET quantity = quantity - ? WHERE id = ?',
        [part.quantity_needed, part.part_id],
      );

      await connection.query(
        `INSERT INTO stock_movements 
         (part_id, movement_type, quantity, reference_type, reference_id, user_id, notes)
         VALUES (?, 'out', ?, 'production', ?, ?, ?)`,
        [
          part.part_id,
          part.quantity_needed,
          equipmentId,
          userId,
          `Production of equipment #${equipmentId}`,
        ],
      );
    }

    await connection.commit();

    res.status(200).json({
      success: true,
      message: 'Equipment produced successfully',
      partsUsed: parts.map((p) => ({
        part_id: p.part_id,
        name: p.name,
        color: p.color,
        quantity_used: p.quantity_needed,
      })),
    });
  } catch (error) {
    await connection.rollback();
    res.status(500).json({ success: false, error: error.message });
  } finally {
    connection.release();
  }
};
