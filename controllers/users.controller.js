const bcrypt = require("bcryptjs");
const db = require("../db");

// GET all users
exports.getAll = async (req, res) => {
  try {
    const [users] = await db.query(`
      SELECT id, email, full_name, userType, company, nick, name, 
             address, zip, city, lat, lng, contact, tel, url, language, loginName,
             created_at, updated_at
      FROM users
      ORDER BY created_at DESC
    `);

    res.status(200).json({
      success: true,
      count: users.length,
      data: users,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// GET single user
exports.getById = async (req, res) => {
  try {
    const [users] = await db.query(
      `SELECT id, email, full_name, userType, company, nick, name, 
              address, zip, city, lat, lng, contact, tel, tels, url, language, loginName,
              created_at, updated_at
       FROM users WHERE id = ?`,
      [req.params.id],
    );

    if (users.length === 0) {
      return res.status(404).json({ success: false, error: "User not found" });
    }

    res.status(200).json({
      success: true,
      data: users[0],
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// CREATE user
exports.create = async (req, res) => {
  try {
    const {
      email,
      password,
      full_name,
      userType = "client",
      company,
      nick,
      name,
      address,
      zip,
      city,
      lat,
      lng,
      contact,
      tel,
      tels,
      url,
      language = "en",
      loginName,
    } = req.body;

    // Check if email exists
    const [existing] = await db.query("SELECT id FROM users WHERE email = ?", [
      email,
    ]);
    if (existing.length > 0) {
      return res
        .status(400)
        .json({ success: false, error: "Email already exists" });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    const [result] = await db.query(
      `INSERT INTO users (
        email, password, full_name, userType, company, nick, name, 
        address, zip, city, lat, lng, contact, tel, tels, url, language, loginName
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        email,
        hashedPassword,
        full_name,
        userType,
        company,
        nick,
        name,
        address,
        zip,
        city,
        lat,
        lng,
        contact,
        tel,
        tels,
        url,
        language,
        loginName,
      ],
    );

    res.status(201).json({
      success: true,
      data: { id: result.insertId, email, full_name, userType },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// UPDATE user
exports.update = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      email,
      password,
      full_name,
      userType,
      company,
      nick,
      name,
      address,
      zip,
      city,
      lat,
      lng,
      contact,
      tel,
      tels,
      url,
      language,
      loginName,
    } = req.body;

    // Check if user exists
    const [existing] = await db.query("SELECT id FROM users WHERE id = ?", [
      id,
    ]);
    if (existing.length === 0) {
      return res.status(404).json({ success: false, error: "User not found" });
    }

    // Check if email is taken by another user
    if (email) {
      const [emailCheck] = await db.query(
        "SELECT id FROM users WHERE email = ? AND id != ?",
        [email, id],
      );
      if (emailCheck.length > 0) {
        return res
          .status(400)
          .json({ success: false, error: "Email already in use" });
      }
    }

    // Build update query dynamically
    const updates = [];
    const values = [];

    if (email) {
      updates.push("email = ?");
      values.push(email);
    }
    if (password) {
      const hashedPassword = await bcrypt.hash(password, 10);
      updates.push("password = ?");
      values.push(hashedPassword);
    }
    if (full_name) {
      updates.push("full_name = ?");
      values.push(full_name);
    }
    if (userType) {
      updates.push("userType = ?");
      values.push(userType);
    }
    if (company !== undefined) {
      updates.push("company = ?");
      values.push(company);
    }
    if (nick !== undefined) {
      updates.push("nick = ?");
      values.push(nick);
    }
    if (name !== undefined) {
      updates.push("name = ?");
      values.push(name);
    }
    if (address !== undefined) {
      updates.push("address = ?");
      values.push(address);
    }
    if (zip !== undefined) {
      updates.push("zip = ?");
      values.push(zip);
    }
    if (city !== undefined) {
      updates.push("city = ?");
      values.push(city);
    }
    if (lat !== undefined) {
      updates.push("lat = ?");
      values.push(lat);
    }
    if (lng !== undefined) {
      updates.push("lng = ?");
      values.push(lng);
    }
    if (contact !== undefined) {
      updates.push("contact = ?");
      values.push(contact);
    }
    if (tel !== undefined) {
      updates.push("tel = ?");
      values.push(tel);
    }
    if (tels !== undefined) {
      updates.push("tels = ?");
      values.push(tels);
    }
    if (url !== undefined) {
      updates.push("url = ?");
      values.push(url);
    }
    if (language !== undefined) {
      updates.push("language = ?");
      values.push(language);
    }
    if (loginName !== undefined) {
      updates.push("loginName = ?");
      values.push(loginName);
    }

    if (updates.length === 0) {
      return res
        .status(400)
        .json({ success: false, error: "No fields to update" });
    }

    values.push(id);

    await db.query(
      `UPDATE users SET ${updates.join(", ")} WHERE id = ?`,
      values,
    );

    // Get updated user
    const [users] = await db.query(
      `SELECT id, email, full_name, userType, company, nick, name, 
              address, zip, city, lat, lng, contact, tel, url, language, loginName
       FROM users WHERE id = ?`,
      [id],
    );

    res.status(200).json({
      success: true,
      data: users[0],
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// DELETE user
exports.delete = async (req, res) => {
  try {
    const [result] = await db.query("DELETE FROM users WHERE id = ?", [
      req.params.id,
    ]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, error: "User not found" });
    }

    res.status(200).json({
      success: true,
      message: "User deleted successfully",
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// GET users by type
exports.getByType = async (req, res) => {
  try {
    const { type } = req.params;

    const validTypes = ["client", "handler", "admin", "employee"];
    if (!validTypes.includes(type)) {
      return res
        .status(400)
        .json({ success: false, error: "Invalid user type" });
    }

    const [users] = await db.query(
      `SELECT id, email, full_name, userType, company, nick, name, 
              address, zip, city, contact, tel, url
       FROM users WHERE userType = ?
       ORDER BY full_name`,
      [type],
    );

    res.status(200).json({
      success: true,
      count: users.length,
      data: users,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};
