const express = require("express");
const router = express.Router();
const { v4: uuidv4 } = require("uuid");
const db = require("../models/db");

// =====================
// TAG CRUD
// =====================

// GET /api/tags - List tags (optionally by workspace_id)
router.get("/", (req, res) => {
  try {
    const { workspace_id } = req.query;
    let tags;
    if (workspace_id) {
      tags = db.prepare("SELECT * FROM tags WHERE workspace_id = ? ORDER BY name").all(workspace_id);
    } else {
      tags = db.prepare("SELECT * FROM tags ORDER BY name").all();
    }
    res.json(tags);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/tags - Create tag
router.post("/", (req, res) => {
  try {
    const { workspace_id, name, color } = req.body;
    if (!workspace_id || !name) {
      return res.status(400).json({ error: "workspace_id and name are required" });
    }

    const id = uuidv4();
    db.prepare(
      "INSERT INTO tags (id, workspace_id, name, color) VALUES (?, ?, ?, ?)"
    ).run(id, workspace_id, name, color || null);

    const tag = db.prepare("SELECT * FROM tags WHERE id = ?").get(id);
    res.status(201).json(tag);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/tags/:id - Update tag
router.patch("/:id", (req, res) => {
  try {
    const tag = db.prepare("SELECT * FROM tags WHERE id = ?").get(req.params.id);
    if (!tag) {
      return res.status(404).json({ error: "Tag not found" });
    }

    const allowed = ["name", "color"];
    const sets = [];
    const values = [];
    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        sets.push(`${key} = ?`);
        values.push(req.body[key]);
      }
    }

    if (sets.length > 0) {
      values.push(req.params.id);
      db.prepare(`UPDATE tags SET ${sets.join(", ")} WHERE id = ?`).run(...values);
    }

    const updated = db.prepare("SELECT * FROM tags WHERE id = ?").get(req.params.id);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/tags/:id - Delete tag
router.delete("/:id", (req, res) => {
  try {
    const tag = db.prepare("SELECT * FROM tags WHERE id = ?").get(req.params.id);
    if (!tag) {
      return res.status(404).json({ error: "Tag not found" });
    }
    db.prepare("DELETE FROM tags WHERE id = ?").run(req.params.id);
    res.status(204).end();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// =====================
// CARD-TAG ASSOCIATIONS
// =====================

// GET /api/tags/card/:cardId - Get tags for a card
router.get("/card/:cardId", (req, res) => {
  try {
    const tags = db.prepare(
      `SELECT t.*, ct.id as card_tag_id FROM tags t
       JOIN card_tags ct ON ct.tag_id = t.id
       WHERE ct.card_id = ?
       ORDER BY t.name`
    ).all(req.params.cardId);
    res.json(tags);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/tags/card/:cardId - Add tag to card
router.post("/card/:cardId", (req, res) => {
  try {
    const { tag_id } = req.body;
    if (!tag_id) {
      return res.status(400).json({ error: "tag_id is required" });
    }

    // Check if association already exists
    const existing = db.prepare(
      "SELECT id FROM card_tags WHERE card_id = ? AND tag_id = ?"
    ).get(req.params.cardId, tag_id);

    if (existing) {
      return res.status(409).json({ error: "Tag already attached to card" });
    }

    const id = uuidv4();
    db.prepare(
      "INSERT INTO card_tags (id, card_id, tag_id) VALUES (?, ?, ?)"
    ).run(id, req.params.cardId, tag_id);

    const cardTag = db.prepare(
      `SELECT t.*, ct.id as card_tag_id FROM tags t
       JOIN card_tags ct ON ct.tag_id = t.id
       WHERE ct.id = ?`
    ).get(id);

    res.status(201).json(cardTag);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/tags/card/:cardId/:tagId - Remove tag from card
router.delete("/card/:cardId/:tagId", (req, res) => {
  try {
    db.prepare(
      "DELETE FROM card_tags WHERE card_id = ? AND tag_id = ?"
    ).run(req.params.cardId, req.params.tagId);
    res.status(204).end();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
