const express = require("express");
const router = express.Router();
const db = require("../models/db");
const { authMiddleware } = require("./auth");
const { sanitizeHtml, validateLength, MAX_NAME_LENGTH } = require("../middleware/validate");

function safeError(err) {
  if (process.env.NODE_ENV === "production") return "Internal server error";
  return err.message;
}

// All routes require authentication
router.use(authMiddleware);

// GET /api/workspace-settings/:workspaceId - Get settings (create defaults if none exist)
router.get("/:workspaceId", async (req, res) => {
  try {
    // Workspace isolation: user can only access their own workspace settings
    if (req.params.workspaceId !== req.user.workspace_id) {
      return res.status(403).json({ error: "Access denied" });
    }

    const { rows: workspaceRows } = await db.query(
      "SELECT id, name FROM workspaces WHERE id = $1",
      [req.params.workspaceId]
    );
    const workspace = workspaceRows[0];

    const { rows: settingsRows } = await db.query(
      "SELECT * FROM workspace_settings WHERE workspace_id = $1",
      [req.params.workspaceId]
    );
    let settings = settingsRows[0];

    if (!settings) {
      // Create default settings for this workspace
      const { rows: newSettingsRows } = await db.query(
        "INSERT INTO workspace_settings (workspace_id) VALUES ($1) RETURNING *",
        [req.params.workspaceId]
      );
      settings = newSettingsRows[0];
    }

    res.json({ ...settings, workspace_name: workspace ? workspace.name : "" });
  } catch (err) {
    res.status(500).json({ error: safeError(err) });
  }
});

// PATCH /api/workspace-settings/:workspaceId - Update settings
router.patch("/:workspaceId", async (req, res) => {
  try {
    // Workspace isolation
    if (req.params.workspaceId !== req.user.workspace_id) {
      return res.status(403).json({ error: "Access denied" });
    }

    // Update workspace name if provided
    if (req.body.workspace_name !== undefined) {
      const nameErr = validateLength(req.body.workspace_name, "Workspace name", MAX_NAME_LENGTH);
      if (nameErr) return res.status(400).json({ error: nameErr });
      if (!req.body.workspace_name.trim()) {
        return res.status(400).json({ error: "Workspace name cannot be empty" });
      }
      await db.query(
        "UPDATE workspaces SET name = $1 WHERE id = $2",
        [sanitizeHtml(req.body.workspace_name), req.params.workspaceId]
      );
    }

    // Ensure settings row exists
    const { rows: settingsRows } = await db.query(
      "SELECT * FROM workspace_settings WHERE workspace_id = $1",
      [req.params.workspaceId]
    );

    if (!settingsRows[0]) {
      await db.query(
        "INSERT INTO workspace_settings (workspace_id) VALUES ($1)",
        [req.params.workspaceId]
      );
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
    let paramIndex = 1;
    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        sets.push(`${key} = $${paramIndex++}`);
        values.push(req.body[key]);
      }
    }

    if (sets.length > 0) {
      values.push(req.params.workspaceId);
      await db.query(
        `UPDATE workspace_settings SET ${sets.join(", ")} WHERE workspace_id = $${paramIndex}`,
        values
      );
    }

    const { rows: workspaceRows } = await db.query(
      "SELECT id, name FROM workspaces WHERE id = $1",
      [req.params.workspaceId]
    );
    const workspace = workspaceRows[0];

    const { rows: updatedRows } = await db.query(
      "SELECT * FROM workspace_settings WHERE workspace_id = $1",
      [req.params.workspaceId]
    );

    res.json({ ...updatedRows[0], workspace_name: workspace ? workspace.name : "" });
  } catch (err) {
    res.status(500).json({ error: safeError(err) });
  }
});

module.exports = router;
