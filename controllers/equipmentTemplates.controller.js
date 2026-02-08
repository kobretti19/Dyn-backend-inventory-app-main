const db = require('../db');

// GET all templates
exports.getAll = async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT
        et.*, 
        u.username AS created_by
      FROM equipment_templates et
      LEFT JOIN users u ON et.user_id = u.id
      ORDER BY et.name
    `);

    // Parse parts_data JSON (handle both string and object)
    const templates = rows.map((row) => {
      let partsData = [];
      if (row.parts_data) {
        // Check if already object or string
        if (typeof row.parts_data === 'string') {
          try {
            partsData = JSON.parse(row.parts_data);
          } catch (e) {
            partsData = [];
          }
        } else {
          partsData = row.parts_data;
        }
      }
      return {
        ...row,
        parts_data: partsData,
      };
    });

    res.status(200).json({
      success: true,
      count: templates.length,
      data: templates,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

// GET single template by ID (with parts details)
exports.getById = async (req, res) => {
  try {
    const [templates] = await db.query(
      `
      SELECT 
        et.*,
        u.username AS created_by
      FROM equipment_templates et
      LEFT JOIN users u ON et.user_id = u.id
      WHERE et.id = ?
    `,
      [req.params.id],
    );

    if (templates.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Template not found',
      });
    }

    const template = templates[0];
    let partsData = [];

    // Handle both string and object
    if (template.parts_data) {
      if (typeof template.parts_data === 'string') {
        try {
          partsData = JSON.parse(template.parts_data);
        } catch (e) {
          partsData = [];
        }
      } else {
        partsData = template.parts_data;
      }
    }

    // Get full part details
    if (partsData.length > 0) {
      const partIds = partsData.map((p) => p.part_id);
      const [parts] = await db.query(
        `SELECT * FROM parts WHERE id IN (?) AND deleted_at IS NULL`,
        [partIds],
      );

      // Merge quantity info with part details
      partsData = partsData.map((pd) => {
        const partInfo = parts.find((p) => p.id === pd.part_id);
        return {
          ...pd,
          part_name: partInfo?.name,
          part_color: partInfo?.color,
          part_category: partInfo?.category,
          sku: partInfo?.sku,
          purchase_price: partInfo?.purchase_price,
          current_stock: partInfo?.quantity,
        };
      });
    }

    res.status(200).json({
      success: true,
      data: {
        ...template,
        parts_data: partsData,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// POST create template
exports.create = async (req, res) => {
  try {
    const {
      name,
      description,
      brand,
      category,
      article_id,
      parts = [],
      parts_data = [],
    } = req.body;

    const userId = req.user?.id;

    if (!name) {
      return res.status(400).json({
        success: false,
        error: 'Template name is required',
      });
    }

    const partsArray = parts.length > 0 ? parts : parts_data;

    const partsDataJson = JSON.stringify(
      partsArray.map((p) => ({
        part_id: p.part_id,
        quantity: p.quantity || 1,
      })),
    );

    const [result] = await db.query(
      `INSERT INTO equipment_templates 
       (name, description, brand, category, article_id, parts_data, user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        name,
        description || null,
        brand || null,
        category || null,
        article_id || null,
        partsDataJson,
        userId,
      ],
    );

    const [created] = await db.query(
      'SELECT * FROM equipment_templates WHERE id = ?',
      [result.insertId],
    );

    // Handle response - check if string or object
    let responsePartsData = [];
    if (created[0].parts_data) {
      if (typeof created[0].parts_data === 'string') {
        responsePartsData = JSON.parse(created[0].parts_data);
      } else {
        responsePartsData = created[0].parts_data;
      }
    }

    res.status(201).json({
      success: true,
      data: {
        ...created[0],
        parts_data: responsePartsData,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// POST create template from existing equipment
exports.createFromEquipment = async (req, res) => {
  try {
    const { equipment_id, name, description, article_id } = req.body;
    const userId = req.user?.id;

    // Get equipment
    const [equipment] = await db.query(
      'SELECT * FROM equipment WHERE id = ? AND deleted_at IS NULL',
      [equipment_id],
    );

    if (equipment.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Equipment not found',
      });
    }

    // Get equipment parts
    const [parts] = await db.query(
      'SELECT part_id, quantity_needed FROM equipment_parts WHERE equipment_id = ?',
      [equipment_id],
    );

    const partsData = JSON.stringify(
      parts.map((p) => ({
        part_id: p.part_id,
        quantity: p.quantity_needed,
      })),
    );

    const [result] = await db.query(
      `INSERT INTO equipment_templates 
       (name, description, brand, category, article_id, parts_data, user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        name || `${equipment[0].model} Template`,
        description || null,
        equipment[0].brand,
        equipment[0].category,
        article_id || equipment[0].article_id,
        partsData,
        userId,
      ],
    );

    const [created] = await db.query(
      'SELECT * FROM equipment_templates WHERE id = ?',
      [result.insertId],
    );

    // Fixed: Handle both string and object
    let responsePartsData = [];
    if (created[0].parts_data) {
      if (typeof created[0].parts_data === 'string') {
        responsePartsData = JSON.parse(created[0].parts_data);
      } else {
        responsePartsData = created[0].parts_data;
      }
    }

    res.status(201).json({
      success: true,
      data: {
        ...created[0],
        parts_data: responsePartsData,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// PUT update template
exports.update = async (req, res) => {
  try {
    const {
      name,
      description,
      brand,
      category,
      article_id,
      parts,
      parts_data,
    } = req.body;

    const [existing] = await db.query(
      'SELECT * FROM equipment_templates WHERE id = ?',
      [req.params.id],
    );

    if (existing.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Template not found',
      });
    }

    const template = existing[0];

    // Handle parts_data - keep existing or update
    let partsDataJson = null;

    // Check if new parts provided
    const newParts = parts || parts_data;

    if (newParts !== undefined) {
      // New parts provided - stringify them
      partsDataJson = JSON.stringify(
        newParts.map((p) => ({
          part_id: p.part_id,
          quantity: p.quantity || 1,
        })),
      );
    } else {
      // Keep existing - make sure it's a string
      if (template.parts_data) {
        if (typeof template.parts_data === 'string') {
          partsDataJson = template.parts_data;
        } else {
          partsDataJson = JSON.stringify(template.parts_data);
        }
      } else {
        partsDataJson = '[]';
      }
    }

    await db.query(
      `UPDATE equipment_templates SET
        name = ?,
        description = ?,
        brand = ?,
        category = ?,
        article_id = ?,
        parts_data = ?
       WHERE id = ?`,
      [
        name !== undefined ? name : template.name,
        description !== undefined ? description : template.description,
        brand !== undefined ? brand : template.brand,
        category !== undefined ? category : template.category,
        article_id !== undefined ? article_id : template.article_id,
        partsDataJson,
        req.params.id,
      ],
    );

    const [updated] = await db.query(
      'SELECT * FROM equipment_templates WHERE id = ?',
      [req.params.id],
    );

    // Handle response - check if string or object
    let responsePartsData = [];
    if (updated[0].parts_data) {
      if (typeof updated[0].parts_data === 'string') {
        responsePartsData = JSON.parse(updated[0].parts_data);
      } else {
        responsePartsData = updated[0].parts_data;
      }
    }

    res.status(200).json({
      success: true,
      data: {
        ...updated[0],
        parts_data: responsePartsData,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// POST create equipment from template
exports.createEquipment = async (req, res) => {
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const { serial_number, year_manufactured, production_date } = req.body;

    const userId = req.user?.id;

    // Get template
    const [templates] = await connection.query(
      'SELECT * FROM equipment_templates WHERE id = ?',
      [req.params.id],
    );

    if (templates.length === 0) {
      await connection.rollback();
      return res.status(404).json({
        success: false,
        error: 'Template not found',
      });
    }

    const template = templates[0];

    // Handle both string and object
    let partsData = [];
    if (template.parts_data) {
      if (typeof template.parts_data === 'string') {
        partsData = JSON.parse(template.parts_data);
      } else {
        partsData = template.parts_data;
      }
    }

    // Create equipment
    const [result] = await connection.query(
      `INSERT INTO equipment 
       (model, brand, category, serial_number, year_manufactured, production_date, article_id, user_Id, status,template_id,created_from_template)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active',?,?)`,
      [
        template.name,
        template.brand,
        template.category,
        serial_number || null,
        year_manufactured || null,
        production_date || null,
        template.article_id,
        userId,
        template.id,
        template.name,
      ],
    );

    const equipmentId = result.insertId;

    // Add parts from template
    for (const part of partsData) {
      await connection.query(
        'INSERT INTO equipment_parts (equipment_id, part_id, quantity_needed) VALUES (?, ?, ?)',
        [equipmentId, part.part_id, part.quantity || 1],
      );
    }

    await connection.commit();

    const [created] = await db.query('SELECT * FROM equipment WHERE id = ?', [
      equipmentId,
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

// DELETE template
exports.delete = async (req, res) => {
  try {
    const [result] = await db.query(
      'DELETE FROM equipment_templates WHERE id = ?',
      [req.params.id],
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        error: 'Template not found',
      });
    }

    res.status(200).json({
      success: true,
      message: 'Template deleted successfully',
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};
