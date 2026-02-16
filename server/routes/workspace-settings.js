const express = require("express");
const router = express.Router();
const db = require("../models/db");
const { authMiddleware } = require("./auth");

// GET /api/workspace-settings/:workspaceId - Get settings (create defaults if none exist)
router.get("/:workspaceId", authMiddleware, (req, res) => {
  try {
    let settings = db.prepare(
      "SELECT * FROM workspace_settings WHERE workspace_id = ?"
    ).get(req.params.workspaceId);

    if (!settings) {
      // Create default settings for this workspace
      db.prepare(
        "INSERT INTO workspace_settings (workspace_id) VALUES (?)"
      ).run(req.params.workspaceId);

      settings = db.prepare(
        "SELECT * FROM workspace_settings WHERE workspace_id = ?"
      ).get(req.params.workspaceId);
    }

    res.json(settings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/workspace-settings/:workspaceId - Update settings
router.patch("/:workspaceId", authMiddleware, (req, res) => {
  try {
    // Ensure settings row exists
    let settings = db.prepare(
      "SELECT * FROM workspace_settings WHERE workspace_id = ?"
    ).get(req.params.workspaceId);

    if (!settings) {
      db.prepare(
        "INSERT INTO workspace_settings (workspace_id) VALUES (?)"
      ).run(req.params.workspaceId);
    }

    const allowed = [
      "effort_unit",
      "custom_statuses",
      "status_colors",
      "drawer_field_order",
      "drawer_hidden_fields",
    ];
    const sets = [];
    const values = [];
    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        sets.push(`${key} = ?`);
        values.push(req.body[key]);
      }
    }

    if (sets.length > 0) {
      values.push(req.params.workspaceId);
      db.prepare(
        `UPDATE workspace_settings SET ${sets.join(", ")} WHERE workspace_id = ?`
      ).run(...values);
    }

    const updated = db.prepare(
      "SELECT * FROM workspace_settings WHERE workspace_id = ?"
    ).get(req.params.workspaceId);

    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
