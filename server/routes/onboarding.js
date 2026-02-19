const express = require("express");
const router = express.Router();
const { v4: uuidv4 } = require("uuid");
const db = require("../models/db");
const authRoutes = require("./auth");

const authMiddleware = authRoutes.authMiddleware;

// POST /api/onboarding — save survey responses and mark onboarding complete
router.post("/", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      company_size,
      company_nature,
      current_roadmap_tool,
      tracks_feature_requests,
      crm,
      dev_task_tool,
    } = req.body;

    // Upsert onboarding responses
    await db.query(
      `INSERT INTO onboarding_responses (id, user_id, company_size, company_nature, current_roadmap_tool, tracks_feature_requests, crm, dev_task_tool)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (user_id) DO UPDATE SET
         company_size = EXCLUDED.company_size,
         company_nature = EXCLUDED.company_nature,
         current_roadmap_tool = EXCLUDED.current_roadmap_tool,
         tracks_feature_requests = EXCLUDED.tracks_feature_requests,
         crm = EXCLUDED.crm,
         dev_task_tool = EXCLUDED.dev_task_tool`,
      [uuidv4(), userId, company_size || null, company_nature || null, current_roadmap_tool || null, tracks_feature_requests || null, crm || null, dev_task_tool || null]
    );

    // Mark onboarding as completed
    await db.query("UPDATE users SET onboarding_completed = TRUE WHERE id = $1", [userId]);

    // Return updated user
    const { rows } = await db.query("SELECT * FROM users WHERE id = $1", [userId]);
    const user = rows[0];
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const { password_hash, ...safeUser } = user;
    res.json({ user: safeUser });
  } catch (err) {
    console.error("Onboarding error:", err);
    res.status(500).json({ error: process.env.NODE_ENV === "production" ? "Internal server error" : err.message });
  }
});

module.exports = router;
