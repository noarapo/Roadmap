const express = require("express");
const router = express.Router();
const { v4: uuidv4 } = require("uuid");
const db = require("../models/db");
const { authMiddleware } = require("./auth");
const {
  sanitizeHtml,
  validateLength,
  MAX_NAME_LENGTH,
} = require("../middleware/validate");

function safeError(err) {
  if (process.env.NODE_ENV === "production") return "Internal server error";
  return err.message;
}

// All routes require authentication
router.use(authMiddleware);

// GET /api/custom-fields?workspace_id=xxx - List custom fields for workspace
router.get("/", (req, res) => {
  try {
    // Always scope to user's workspace
    const workspace_id = req.user.workspace_id;

    const fields = db.prepare(
      "SELECT * FROM custom_fields WHERE workspace_id = ? ORDER BY name"
    ).all(workspace_id);

    res.json(fields);
  } catch (err) {
    res.status(500).json({ error: safeError(err) });
  }
});

// POST /api/custom-fields - Create custom field
router.post("/", (req, res) => {
  try {
    const workspace_id = req.user.workspace_id;
    const { name, field_type, options } = req.body;
    if (!name || !field_type) {
      return res.status(400).json({ error: "name and field_type are required" });
    }

    const nameErr = validateLength(name, "Name", MAX_NAME_LENGTH);
    if (nameErr) return res.status(400).json({ error: nameErr });

    const validTypes = ["text", "number", "date", "select", "multi_select", "checkbox", "url"];
    if (!validTypes.includes(field_type)) {
      return res.status(400).json({ error: `field_type must be one of: ${validTypes.join(", ")}` });
    }

    const id = uuidv4();
    const optionsJson = options ? JSON.stringify(options) : null;

    db.prepare(
      "INSERT INTO custom_fields (id, workspace_id, name, field_type, options) VALUES (?, ?, ?, ?, ?)"
    ).run(id, workspace_id, sanitizeHtml(name), field_type, optionsJson);

    const field = db.prepare("SELECT * FROM custom_fields WHERE id = ?").get(id);
    res.status(201).json(field);
  } catch (err) {
    res.status(500).json({ error: safeError(err) });
  }
});

// PATCH /api/custom-fields/:id - Update custom field
router.patch("/:id", (req, res) => {
  try {
    const field = db.prepare("SELECT * FROM custom_fields WHERE id = ?").get(req.params.id);
    if (!field) {
      return res.status(404).json({ error: "Custom field not found" });
    }

    // Workspace isolation
    if (field.workspace_id !== req.user.workspace_id) {
      return res.status(403).json({ error: "Access denied" });
    }

    if (req.body.name !== undefined) {
      const nameErr = validateLength(req.body.name, "Name", MAX_NAME_LENGTH);
      if (nameErr) return res.status(400).json({ error: nameErr });
    }

    const allowed = ["name", "field_type", "options"];
    const sets = [];
    const values = [];
    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        sets.push(`${key} = ?`);
        if (key === "options") {
          values.push(req.body[key] ? JSON.stringify(req.body[key]) : null);
        } else if (key === "name") {
          values.push(sanitizeHtml(req.body[key]));
        } else {
          values.push(req.body[key]);
        }
      }
    }

    if (sets.length > 0) {
      values.push(req.params.id);
      db.prepare(`UPDATE custom_fields SET ${sets.join(", ")} WHERE id = ?`).run(...values);
    }

    const updated = db.prepare("SELECT * FROM custom_fields WHERE id = ?").get(req.params.id);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: safeError(err) });
  }
});

// DELETE /api/custom-fields/:id - Delete custom field (cascades to values)
router.delete("/:id", (req, res) => {
  try {
    const field = db.prepare("SELECT * FROM custom_fields WHERE id = ?").get(req.params.id);
    if (!field) {
      return res.status(404).json({ error: "Custom field not found" });
    }

    // Workspace isolation
    if (field.workspace_id !== req.user.workspace_id) {
      return res.status(403).json({ error: "Access denied" });
    }

    db.prepare("DELETE FROM custom_fields WHERE id = ?").run(req.params.id);
    res.status(204).end();
  } catch (err) {
    res.status(500).json({ error: safeError(err) });
  }
});

module.exports = router;
