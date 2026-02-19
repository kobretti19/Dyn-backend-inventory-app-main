const jwt = require("jsonwebtoken");
const db = require("../db");

// Main auth middleware
const auth = async (req, res, next) => {
  try {
    const token = req.header("Authorization")?.replace("Bearer ", "");

    if (!token) {
      return res
        .status(401)
        .json({ success: false, error: "No token provided" });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const [users] = await db.query(
      "SELECT id, email, full_name, userType FROM users WHERE id = ?",
      [decoded.id],
    );

    if (users.length === 0) {
      return res.status(401).json({ success: false, error: "User not found" });
    }

    req.user = users[0];
    next();
  } catch (error) {
    res.status(401).json({ success: false, error: "Invalid token" });
  }
};

// Export both ways for compatibility
module.exports = auth;
module.exports.verifyToken = auth;
module.exports.auth = auth;
