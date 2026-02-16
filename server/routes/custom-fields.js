const express = require("express");
const router = express.Router();
const { v4: uuidv4 } = require("uuid");
const db = require("../models/db");
const { authMiddleware } = require("./auth");

// GET /api/custom-fields?workspace_id=xxx - List custom fields for workspace
router.get("/", authMiddleware, (req, res) => {
  try {
    const { workspace_id } = req.query;
    if (!workspace_id) {
      return res.status(400).json({ error: "workspace_id is required" });
    }

    const fields = db.prepare(
      "SELECT * FROM custom_fields WHERE workspace_id = ? ORDER BY name"
    ).all(workspace_id);

    res.json(fields);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/custom-fields - Create custom field
router.post("/", authMiddleware, (req, res) => {
  try {
    const { workspace_id, name, field_type, options } = req.body;
    if (!workspace_id || !name || !field_type) {
      return res.status(400).json({ error: "workspace_id, name, and field_type are required" });
    }

    const validTypes = ["text", "number", "date", "select", "multi_select", "checkbox", "url"];
    if (!validTypes.includes(field_type)) {
      return res.status(400).json({ error: `field_type must be one of: ${validTypes.join(", ")}` });
    }

    const id = uuidv4();
    const optionsJson = options ? JSON.stringify(options) : null;

    db.prepare(
      "INSERT INTO custom_fields (id, workspace_id, name, field_type, options) VALUES (?, ?, ?, ?, ?)"
    ).run(id, workspace_id, name, field_type, optionsJson);

    const field = db.prepare("SELECT * FROM custom_fields WHERE id = ?").get(id);
    res.status(201).json(field);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/custom-fields/:id - Update custom field
router.patch("/:id", authMiddleware, (req, res) => {
  try {
    const field = db.prepare("SELECT * FROM custom_fields WHERE id = ?").get(req.params.id);
    if (!field) {
      return res.status(404).json({ error: "Custom field not found" });
    }

    const allowed = ["name", "field_type", "options"];
    const sets = [];
    const values = [];
    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        sets.push(`${key} = ?`);
        if (key === "options") {
          values.push(req.body[key] ? JSON.stringify(req.body[key]) : null);
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
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/custom-fields/:id - Delete custom field (cascades to values)
router.delete("/:id", authMiddleware, (req, res) => {
  try {
    const field = db.prepare("SELECT * FROM custom_fields WHERE id = ?").get(req.params.id);
    if (!field) {
      return res.status(404).json({ error: "Custom field not found" });
    }

    db.prepare("DELETE FROM custom_fields WHERE id = ?").run(req.params.id);
    res.status(204).end();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
