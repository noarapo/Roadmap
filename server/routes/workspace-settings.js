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
router.get("/:workspaceId", (req, res) => {
  try {
    // Workspace isolation: user can only access their own workspace settings
    if (req.params.workspaceId !== req.user.workspace_id) {
      return res.status(403).json({ error: "Access denied" });
    }

    const workspace = db.prepare(
      "SELECT id, name FROM workspaces WHERE id = ?"
    ).get(req.params.workspaceId);

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

    res.json({ ...settings, workspace_name: workspace ? workspace.name : "" });
  } catch (err) {
    res.status(500).json({ error: safeError(err) });
  }
});

// PATCH /api/workspace-settings/:workspaceId - Update settings
router.patch("/:workspaceId", (req, res) => {
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
      db.prepare("UPDATE workspaces SET name = ? WHERE id = ?").run(
        sanitizeHtml(req.body.workspace_name), req.params.workspaceId
      );
    }

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

    const workspace = db.prepare(
      "SELECT id, name FROM workspaces WHERE id = ?"
    ).get(req.params.workspaceId);

    const updated = db.prepare(
      "SELECT * FROM workspace_settings WHERE workspace_id = ?"
    ).get(req.params.workspaceId);

    res.json({ ...updated, workspace_name: workspace ? workspace.name : "" });
  } catch (err) {
    res.status(500).json({ error: safeError(err) });
  }
});

module.exports = router;
