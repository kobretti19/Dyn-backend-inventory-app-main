const db = require('../db');

// GET all templates
exports.getAllTemplates = async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT 
        t.id,
        t.name,
        t.description,
        t.category_id,
        t.brand_id,
        t.parts_data,
        t.user_id,
        t.created_at,
        t.updated_at,
        c.name AS category_name,
        b.name AS brand_name,
        u.username AS created_by_username
      FROM equipment_templates t
      LEFT JOIN categories c ON t.category_id = c.id
      LEFT JOIN brands b ON t.brand_id = b.id
      LEFT JOIN users u ON t.user_id = u.id
      ORDER BY t.name ASC
    `);

    // Parse parts_data JSON for each template
    const templates = rows.map(row => ({
      ...row,
      parts_data: typeof row.parts_data === 'string' ? JSON.parse(row.parts_data) : row.parts_data
    }));

    res.status(200).json({
      success: true,
      count: templates.length,
      data: templates,
    });
  } catch (error) {
    console.error('Get all templates error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// GET single template by ID
exports.getTemplateById = async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT 
        t.*,
        c.name AS category_name,
        b.name AS brand_name,
        u.username AS created_by_username
      FROM equipment_templates t
      LEFT JOIN categories c ON t.category_id = c.id
      LEFT JOIN brands b ON t.brand_id = b.id
      LEFT JOIN users u ON t.user_id = u.id
      WHERE t.id = ?
    `, [req.params.id]);

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Template not found',
      });
    }

    const template = {
      ...rows[0],
      parts_data: typeof rows[0].parts_data === 'string' ? JSON.parse(rows[0].parts_data) : rows[0].parts_data
    };

    res.status(200).json({
      success: true,
      data: template,
    });
  } catch (error) {
    console.error('Get template by ID error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// POST - Create new template
exports.createTemplate = async (req, res) => {
  try {
    const { name, description, category_id, brand_id, parts_data } = req.body;
    const user_id = req.user?.id || null;

    if (!name) {
      return res.status(400).json({
        success: false,
        error: 'Template name is required',
      });
    }

    if (!parts_data || !Array.isArray(parts_data) || parts_data.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Parts data is required and must be a non-empty array',
      });
    }

    // Check if template with same name exists
    const [existing] = await db.query(
      'SELECT id FROM equipment_templates WHERE name = ?',
      [name]
    );

    if (existing.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'A template with this name already exists',
      });
    }

    const [result] = await db.query(
      `INSERT INTO equipment_templates (name, description, category_id, brand_id, parts_data, user_id) 
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        name,
        description || null,
        category_id || null,
        brand_id || null,
        JSON.stringify(parts_data),
        user_id,
      ]
    );

    res.status(201).json({
      success: true,
      data: {
        id: result.insertId,
        name,
        description,
        category_id,
        brand_id,
        parts_data,
        user_id,
      },
    });
  } catch (error) {
    console.error('Create template error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// PUT - Update template
exports.updateTemplate = async (req, res) => {
  try {
    const { name, description, category_id, brand_id, parts_data } = req.body;

    // Check if template exists
    const [existing] = await db.query(
      'SELECT * FROM equipment_templates WHERE id = ?',
      [req.params.id]
    );

    if (existing.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Template not found',
      });
    }

    // Check if new name conflicts with another template
    if (name && name !== existing[0].name) {
      const [nameCheck] = await db.query(
        'SELECT id FROM equipment_templates WHERE name = ? AND id != ?',
        [name, req.params.id]
      );

      if (nameCheck.length > 0) {
        return res.status(400).json({
          success: false,
          error: 'A template with this name already exists',
        });
      }
    }

    const finalName = name !== undefined ? name : existing[0].name;
    const finalDescription = description !== undefined ? description : existing[0].description;
    const finalCategoryId = category_id !== undefined ? category_id : existing[0].category_id;
    const finalBrandId = brand_id !== undefined ? brand_id : existing[0].brand_id;
    const finalPartsData = parts_data !== undefined ? JSON.stringify(parts_data) : existing[0].parts_data;

    await db.query(
      `UPDATE equipment_templates 
       SET name = ?, description = ?, category_id = ?, brand_id = ?, parts_data = ?
       WHERE id = ?`,
      [finalName, finalDescription, finalCategoryId, finalBrandId, finalPartsData, req.params.id]
    );

    res.status(200).json({
      success: true,
      data: {
        id: parseInt(req.params.id),
        name: finalName,
        description: finalDescription,
        category_id: finalCategoryId,
        brand_id: finalBrandId,
        parts_data: parts_data || (typeof existing[0].parts_data === 'string' ? JSON.parse(existing[0].parts_data) : existing[0].parts_data),
      },
    });
  } catch (error) {
    console.error('Update template error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// DELETE - Delete template
exports.deleteTemplate = async (req, res) => {
  try {
    const [result] = await db.query(
      'DELETE FROM equipment_templates WHERE id = ?',
      [req.params.id]
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
    console.error('Delete template error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// POST - Create template from existing equipment
exports.createFromEquipment = async (req, res) => {
  try {
    const { equipment_id, template_name } = req.body;
    const user_id = req.user?.id || null;

    if (!equipment_id || !template_name) {
      return res.status(400).json({
        success: false,
        error: 'Equipment ID and template name are required',
      });
    }

    // Get equipment details
    const [equipment] = await db.query(
      'SELECT * FROM equipment WHERE id = ?',
      [equipment_id]
    );

    if (equipment.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Equipment not found',
      });
    }

    // Get parts used in this equipment
    const [partsUsed] = await db.query(`
      SELECT 
        ep.part_id,
        ep.color_id,
        ep.quantity,
        ep.notes,
        p.name AS part_name,
        c.name AS color_name
      FROM equipment_parts ep
      LEFT JOIN parts p ON ep.part_id = p.id
      LEFT JOIN colors c ON ep.color_id = c.id
      WHERE ep.equipment_id = ?
    `, [equipment_id]);

    if (partsUsed.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'This equipment has no parts to save as template',
      });
    }

    // Check if template name already exists
    const [existing] = await db.query(
      'SELECT id FROM equipment_templates WHERE name = ?',
      [template_name]
    );

    if (existing.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'A template with this name already exists',
      });
    }

    // Create template
    const [result] = await db.query(
      `INSERT INTO equipment_templates (name, description, category_id, brand_id, parts_data, user_id) 
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        template_name,
        `Template created from ${equipment[0].model_name}`,
        equipment[0].category_id,
        equipment[0].brand_id,
        JSON.stringify(partsUsed),
        user_id,
      ]
    );

    res.status(201).json({
      success: true,
      data: {
        id: result.insertId,
        name: template_name,
        description: `Template created from ${equipment[0].model_name}`,
        category_id: equipment[0].category_id,
        brand_id: equipment[0].brand_id,
        parts_data: partsUsed,
        user_id,
      },
    });
  } catch (error) {
    console.error('Create template from equipment error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};