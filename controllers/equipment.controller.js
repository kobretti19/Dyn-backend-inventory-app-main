const db = require('../db');

// GET all equipment
exports.getAll = async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT 
        id,
        model,
        brand,
        category,
        serial_number,
        year_manufactured,
        production_date,
        article_id,
        status,
        created_at,
        updated_at
      FROM equipment 
      WHERE deleted_at IS NULL
      ORDER BY model
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

// GET single equipment by ID (with parts)
exports.getById = async (req, res) => {
  try {
    const [equipment] = await db.query(
      'SELECT * FROM equipment WHERE id = ? AND deleted_at IS NULL',
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

// POST create new equipment (with optional template)
exports.create = async (req, res) => {
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const {
      template_id, // Select existing template
      model,
      brand,
      category,
      serial_number,
      year_manufactured,
      production_date,
      article_id,
      status = 'active',
      parts = [],
      reduce_stock = true,
      save_as_template = false, // NEW: save configuration as template
      template_name, // NEW: name for new template (optional)
    } = req.body;

    const userId = req.user?.id;

    let finalModel = model;
    let finalBrand = brand;
    let finalCategory = category;
    let finalArticleId = article_id;
    let finalParts = parts;
    let templateName = null;
    let usedTemplateId = template_id || null;
    let newTemplateId = null;

    // If template_id provided, get template data
    if (template_id) {
      const [templates] = await connection.query(
        'SELECT * FROM equipment_templates WHERE id = ?',
        [template_id],
      );

      if (templates.length === 0) {
        await connection.rollback();
        return res.status(404).json({
          success: false,
          error: 'Template not found',
        });
      }

      const template = templates[0];
      templateName = template.name;

      // Use template values (can be overridden by request)
      finalModel = model || template.name;
      finalBrand = brand || template.brand;
      finalCategory = category || template.category;
      finalArticleId = article_id || template.article_id;

      // Use template parts if no parts provided
      if (parts.length === 0) {
        const templateParts = JSON.parse(template.parts_data || '[]');
        finalParts = templateParts.map((p) => ({
          part_id: p.part_id,
          quantity_needed: p.quantity || 1,
        }));
      }
    }

    if (!finalModel) {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        error: 'Model name is required (or select a template)',
      });
    }

    // If save_as_template is true, create a new template first
    if (save_as_template && !template_id) {
      const partsData = JSON.stringify(
        finalParts.map((p) => ({
          part_id: p.part_id,
          quantity: p.quantity_needed || p.quantity || 1,
        })),
      );

      const [templateResult] = await connection.query(
        `INSERT INTO equipment_templates 
         (name, description, brand, category, article_id, parts_data, user_id)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          template_name || finalModel,
          `Template created from equipment: ${finalModel}`,
          finalBrand || null,
          finalCategory || null,
          finalArticleId || null,
          partsData,
          userId,
        ],
      );

      newTemplateId = templateResult.insertId;
      usedTemplateId = newTemplateId;
      templateName = template_name || finalModel;
    }

    // If reducing stock, check availability first
    if (reduce_stock && finalParts.length > 0) {
      const insufficientParts = [];

      for (const part of finalParts) {
        const [partData] = await connection.query(
          'SELECT id, name, color, quantity FROM parts WHERE id = ? AND deleted_at IS NULL',
          [part.part_id],
        );

        if (partData.length === 0) {
          await connection.rollback();
          return res.status(404).json({
            success: false,
            error: `Part with ID ${part.part_id} not found`,
          });
        }

        const needed = part.quantity_needed || part.quantity || 1;
        if (partData[0].quantity < needed) {
          insufficientParts.push({
            part_id: part.part_id,
            name: partData[0].name,
            color: partData[0].color,
            needed: needed,
            available: partData[0].quantity,
          });
        }
      }

      if (insufficientParts.length > 0) {
        await connection.rollback();
        return res.status(400).json({
          success: false,
          error: 'Insufficient stock for some parts',
          insufficientParts,
        });
      }
    }

    // Create equipment with template reference
    const [result] = await connection.query(
      `INSERT INTO equipment 
       (template_id, created_from_template, model, brand, category, serial_number, year_manufactured, production_date, article_id, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        usedTemplateId,
        templateName || null,
        finalModel,
        finalBrand || null,
        finalCategory || null,
        serial_number || null,
        year_manufactured || null,
        production_date || null,
        finalArticleId || null,
        status,
      ],
    );

    const equipmentId = result.insertId;

    // Add parts and reduce stock
    if (finalParts.length > 0) {
      for (const part of finalParts) {
        const quantityNeeded = part.quantity_needed || part.quantity || 1;

        // Add to equipment_parts
        await connection.query(
          'INSERT INTO equipment_parts (equipment_id, part_id, quantity_needed, notes) VALUES (?, ?, ?, ?)',
          [equipmentId, part.part_id, quantityNeeded, part.notes || null],
        );

        // Reduce stock if enabled
        if (reduce_stock) {
          await connection.query(
            'UPDATE parts SET quantity = quantity - ? WHERE id = ?',
            [quantityNeeded, part.part_id],
          );

          await connection.query(
            `INSERT INTO stock_movements 
             (part_id, movement_type, quantity, reference_type, reference_id, user_id, notes)
             VALUES (?, 'out', ?, 'production', ?, ?, ?)`,
            [
              part.part_id,
              quantityNeeded,
              equipmentId,
              userId,
              `Equipment production: ${finalModel} (${serial_number || 'no serial'})`,
            ],
          );
        }
      }
    }

    await connection.commit();

    // Fetch created equipment with parts
    const [created] = await db.query('SELECT * FROM equipment WHERE id = ?', [
      equipmentId,
    ]);
    const [createdParts] = await db.query(
      `SELECT ep.*, p.name, p.color, p.quantity AS current_stock
       FROM equipment_parts ep
       JOIN parts p ON ep.part_id = p.id
       WHERE ep.equipment_id = ?`,
      [equipmentId],
    );

    res.status(201).json({
      success: true,
      data: {
        ...created[0],
        parts: createdParts,
      },
      stock_reduced: reduce_stock,
      created_from_template: templateName,
      template_saved: save_as_template,
      new_template_id: newTemplateId,
    });
  } catch (error) {
    await connection.rollback();
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
