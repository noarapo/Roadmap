const express = require("express");
const router = express.Router();
const { v4: uuidv4 } = require("uuid");
const db = require("../models/db");

// GET /api/cards/:id - Get single card with tags and dependencies
router.get("/:id", (req, res) => {
  try {
    const card = db.prepare("SELECT * FROM cards WHERE id = ?").get(req.params.id);
    if (!card) {
      return res.status(404).json({ error: "Card not found" });
    }

    // Get tags
    const tags = db.prepare(
      `SELECT t.* FROM tags t
       JOIN card_tags ct ON ct.tag_id = t.id
       WHERE ct.card_id = ?`
    ).all(card.id);

    // Get dependencies (cards this card blocks)
    const blocks = db.prepare(
      `SELECT cd.*, c.name as to_card_name FROM card_dependencies cd
       JOIN cards c ON c.id = cd.to_card_id
       WHERE cd.from_card_id = ?`
    ).all(card.id);

    // Get dependencies (cards that block this card)
    const blocked_by = db.prepare(
      `SELECT cd.*, c.name as from_card_name FROM card_dependencies cd
       JOIN cards c ON c.id = cd.from_card_id
       WHERE cd.to_card_id = ?`
    ).all(card.id);

    // Get custom field values
    const custom_fields = db.prepare(
      `SELECT cfv.*, cf.name as field_name, cf.field_type
       FROM custom_field_values cfv
       JOIN custom_fields cf ON cf.id = cfv.custom_field_id
       WHERE cfv.card_id = ?`
    ).all(card.id);

    // Get comments
    const comments = db.prepare(
      `SELECT cm.*, u.name as user_name, u.avatar_url
       FROM comments cm
       LEFT JOIN users u ON u.id = cm.user_id
       WHERE cm.card_id = ?
       ORDER BY cm.created_at ASC`
    ).all(card.id);

    res.json({
      ...card,
      tags,
      blocks,
      blocked_by,
      custom_fields,
      comments,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/cards/:id - Update card
router.patch("/:id", (req, res) => {
  try {
    const card = db.prepare("SELECT * FROM cards WHERE id = ?").get(req.params.id);
    if (!card) {
      return res.status(404).json({ error: "Card not found" });
    }

    const allowed = [
      "row_id", "name", "description", "status", "team_id",
      "effort", "headcount", "start_sprint", "duration_sprints", "sort_order"
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
      values.push(req.params.id);
      db.prepare(`UPDATE cards SET ${sets.join(", ")} WHERE id = ?`).run(...values);
    }

    const updated = db.prepare("SELECT * FROM cards WHERE id = ?").get(req.params.id);

    // Return with tags
    const tags = db.prepare(
      `SELECT t.* FROM tags t
       JOIN card_tags ct ON ct.tag_id = t.id
       WHERE ct.card_id = ?`
    ).all(updated.id);

    res.json({ ...updated, tags });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/cards/:id - Delete card
router.delete("/:id", (req, res) => {
  try {
    const card = db.prepare("SELECT * FROM cards WHERE id = ?").get(req.params.id);
    if (!card) {
      return res.status(404).json({ error: "Card not found" });
    }
    db.prepare("DELETE FROM cards WHERE id = ?").run(req.params.id);
    res.status(204).end();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/cards/:id/position - Update card position (row and sort order)
router.patch("/:id/position", (req, res) => {
  try {
    const card = db.prepare("SELECT * FROM cards WHERE id = ?").get(req.params.id);
    if (!card) {
      return res.status(404).json({ error: "Card not found" });
    }

    const { row_id, sort_order, start_sprint, duration_sprints } = req.body;

    const sets = [];
    const values = [];

    if (row_id !== undefined) {
      sets.push("row_id = ?");
      values.push(row_id);
    }
    if (sort_order !== undefined) {
      sets.push("sort_order = ?");
      values.push(sort_order);
    }
    if (start_sprint !== undefined) {
      sets.push("start_sprint = ?");
      values.push(start_sprint);
    }
    if (duration_sprints !== undefined) {
      sets.push("duration_sprints = ?");
      values.push(duration_sprints);
    }

    if (sets.length > 0) {
      values.push(req.params.id);
      db.prepare(`UPDATE cards SET ${sets.join(", ")} WHERE id = ?`).run(...values);
    }

    const updated = db.prepare("SELECT * FROM cards WHERE id = ?").get(req.params.id);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// =====================
// CARD DEPENDENCIES
// =====================

// POST /api/cards/:id/dependencies - Add dependency
router.post("/:id/dependencies", (req, res) => {
  try {
    const { to_card_id, type } = req.body;
    if (!to_card_id) {
      return res.status(400).json({ error: "to_card_id is required" });
    }

    const id = uuidv4();
    db.prepare(
      "INSERT INTO card_dependencies (id, from_card_id, to_card_id, type) VALUES (?, ?, ?, ?)"
    ).run(id, req.params.id, to_card_id, type || "blocks");

    const dep = db.prepare("SELECT * FROM card_dependencies WHERE id = ?").get(id);
    res.status(201).json(dep);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/cards/:id/dependencies/:depId - Remove dependency
router.delete("/:id/dependencies/:depId", (req, res) => {
  try {
    db.prepare("DELETE FROM card_dependencies WHERE id = ?").run(req.params.depId);
    res.status(204).end();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
