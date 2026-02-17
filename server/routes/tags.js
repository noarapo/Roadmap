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

// Helper: verify tag belongs to user's workspace
function verifyTagAccess(tagId, req, res) {
  const tag = db.prepare("SELECT * FROM tags WHERE id = ?").get(tagId);
  if (!tag) {
    res.status(404).json({ error: "Tag not found" });
    return null;
  }
  if (tag.workspace_id !== req.user.workspace_id) {
    res.status(403).json({ error: "Access denied" });
    return null;
  }
  return tag;
}

// =====================
// TAG CRUD
// =====================

// GET /api/tags - List tags for the user's workspace
router.get("/", (req, res) => {
  try {
    const workspace_id = req.user.workspace_id;
    const tags = db.prepare("SELECT * FROM tags WHERE workspace_id = ? ORDER BY name").all(workspace_id);
    res.json(tags);
  } catch (err) {
    res.status(500).json({ error: safeError(err) });
  }
});

// POST /api/tags - Create tag
router.post("/", (req, res) => {
  try {
    const workspace_id = req.user.workspace_id;
    const { name, color } = req.body;
    if (!name) {
      return res.status(400).json({ error: "name is required" });
    }

    const nameErr = validateLength(name, "Name", MAX_NAME_LENGTH);
    if (nameErr) return res.status(400).json({ error: nameErr });

    const id = uuidv4();
    db.prepare(
      "INSERT INTO tags (id, workspace_id, name, color) VALUES (?, ?, ?, ?)"
    ).run(id, workspace_id, sanitizeHtml(name), color || null);

    const tag = db.prepare("SELECT * FROM tags WHERE id = ?").get(id);
    res.status(201).json(tag);
  } catch (err) {
    res.status(500).json({ error: safeError(err) });
  }
});

// PATCH /api/tags/:id - Update tag
router.patch("/:id", (req, res) => {
  try {
    const tag = verifyTagAccess(req.params.id, req, res);
    if (!tag) return;

    if (req.body.name !== undefined) {
      const nameErr = validateLength(req.body.name, "Name", MAX_NAME_LENGTH);
      if (nameErr) return res.status(400).json({ error: nameErr });
    }

    const allowed = ["name", "color"];
    const sets = [];
    const values = [];
    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        let val = req.body[key];
        if (key === "name") val = sanitizeHtml(val);
        sets.push(`${key} = ?`);
        values.push(val);
      }
    }

    if (sets.length > 0) {
      values.push(req.params.id);
      db.prepare(`UPDATE tags SET ${sets.join(", ")} WHERE id = ?`).run(...values);
    }

    const updated = db.prepare("SELECT * FROM tags WHERE id = ?").get(req.params.id);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: safeError(err) });
  }
});

// DELETE /api/tags/:id - Delete tag
router.delete("/:id", (req, res) => {
  try {
    const tag = verifyTagAccess(req.params.id, req, res);
    if (!tag) return;

    db.prepare("DELETE FROM tags WHERE id = ?").run(req.params.id);
    res.status(204).end();
  } catch (err) {
    res.status(500).json({ error: safeError(err) });
  }
});

// =====================
// CARD-TAG ASSOCIATIONS
// =====================

// GET /api/tags/card/:cardId - Get tags for a card
router.get("/card/:cardId", (req, res) => {
  try {
    // Verify card belongs to user's workspace
    const card = db.prepare("SELECT * FROM cards WHERE id = ?").get(req.params.cardId);
    if (!card) return res.status(404).json({ error: "Card not found" });
    const roadmap = db.prepare("SELECT * FROM roadmaps WHERE id = ?").get(card.roadmap_id);
    if (!roadmap || roadmap.workspace_id !== req.user.workspace_id) {
      return res.status(403).json({ error: "Access denied" });
    }

    const tags = db.prepare(
      `SELECT t.*, ct.id as card_tag_id FROM tags t
       JOIN card_tags ct ON ct.tag_id = t.id
       WHERE ct.card_id = ?
       ORDER BY t.name`
    ).all(req.params.cardId);
    res.json(tags);
  } catch (err) {
    res.status(500).json({ error: safeError(err) });
  }
});

// POST /api/tags/card/:cardId - Add tag to card
router.post("/card/:cardId", (req, res) => {
  try {
    // Verify card belongs to user's workspace
    const card = db.prepare("SELECT * FROM cards WHERE id = ?").get(req.params.cardId);
    if (!card) return res.status(404).json({ error: "Card not found" });
    const roadmap = db.prepare("SELECT * FROM roadmaps WHERE id = ?").get(card.roadmap_id);
    if (!roadmap || roadmap.workspace_id !== req.user.workspace_id) {
      return res.status(403).json({ error: "Access denied" });
    }

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
    res.status(500).json({ error: safeError(err) });
  }
});

// DELETE /api/tags/card/:cardId/:tagId - Remove tag from card
router.delete("/card/:cardId/:tagId", (req, res) => {
  try {
    // Verify card belongs to user's workspace
    const card = db.prepare("SELECT * FROM cards WHERE id = ?").get(req.params.cardId);
    if (!card) return res.status(404).json({ error: "Card not found" });
    const roadmap = db.prepare("SELECT * FROM roadmaps WHERE id = ?").get(card.roadmap_id);
    if (!roadmap || roadmap.workspace_id !== req.user.workspace_id) {
      return res.status(403).json({ error: "Access denied" });
    }

    db.prepare(
      "DELETE FROM card_tags WHERE card_id = ? AND tag_id = ?"
    ).run(req.params.cardId, req.params.tagId);
    res.status(204).end();
  } catch (err) {
    res.status(500).json({ error: safeError(err) });
  }
});

module.exports = router;
