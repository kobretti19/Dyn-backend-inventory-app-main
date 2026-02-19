const express = require("express");
const router = express.Router();
const usersController = require("../controllers/users.controller");
const auth = require("../middleware/auth");

// All routes require authentication
router.use(auth);

// GET users by type (before :id to avoid conflict)
router.get("/type/:type", usersController.getByType);

// CRUD routes
router.get("/", usersController.getAll);
router.get("/:id", usersController.getById);
router.post("/", usersController.create);
router.put("/:id", usersController.update);
router.delete("/:id", usersController.delete);

module.exports = router;
