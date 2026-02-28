const express = require("express");
const router = express.Router();
const { v4: uuidv4 } = require("uuid");
const db = require("../models/db");
const authRoutes = require("./auth");

const authMiddleware = authRoutes.authMiddleware;
const adminMiddleware = authRoutes.adminMiddleware;

// POST /api/feedback — submit feedback
router.post("/", authMiddleware, async (req, res) => {
  try {
    const { category, message } = req.body;

    if (!message || !message.trim()) {
      return res.status(400).json({ error: "Message is required" });
    }

    const allowedCategories = ["bug", "feature", "feedback"];
    if (category && !allowedCategories.includes(category)) {
      return res.status(400).json({ error: "Invalid category" });
    }

    const id = uuidv4();
    const userId = req.user.id;
    const workspaceId = req.user.workspace_id || null;

    await db.query(
      `INSERT INTO feedback (id, workspace_id, user_id, category, message)
       VALUES ($1, $2, $3, $4, $5)`,
      [id, workspaceId, userId, category || "feedback", message.trim()]
    );

    res.status(201).json({ id });
  } catch (err) {
    console.error("Feedback submit error:", err);
    res.status(500).json({ error: process.env.NODE_ENV === "production" ? "Internal server error" : err.message });
  }
});

// GET /api/feedback — retrieve all feedback (admin only)
router.get("/", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT f.*, u.name as user_name, u.email as user_email
       FROM feedback f
       LEFT JOIN users u ON f.user_id = u.id
       ORDER BY f.created_at DESC`
    );
    res.json(rows);
  } catch (err) {
    console.error("Feedback fetch error:", err);
    res.status(500).json({ error: process.env.NODE_ENV === "production" ? "Internal server error" : err.message });
  }
});

module.exports = router;
