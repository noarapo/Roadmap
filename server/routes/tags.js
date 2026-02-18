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
async function verifyTagAccess(tagId, req, res) {
  const { rows } = await db.query("SELECT * FROM tags WHERE id = $1", [tagId]);
  const tag = rows[0];
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
router.get("/", async (req, res) => {
  try {
    const workspace_id = req.user.workspace_id;
    const { rows: tags } = await db.query("SELECT * FROM tags WHERE workspace_id = $1 ORDER BY name", [workspace_id]);
    res.json(tags);
  } catch (err) {
    res.status(500).json({ error: safeError(err) });
  }
});

// POST /api/tags - Create tag
router.post("/", async (req, res) => {
  try {
    const workspace_id = req.user.workspace_id;
    const { name, color } = req.body;
    if (!name) {
      return res.status(400).json({ error: "name is required" });
    }

    const nameErr = validateLength(name, "Name", MAX_NAME_LENGTH);
    if (nameErr) return res.status(400).json({ error: nameErr });

    const id = uuidv4();
    await db.query(
      "INSERT INTO tags (id, workspace_id, name, color) VALUES ($1, $2, $3, $4)",
      [id, workspace_id, sanitizeHtml(name), color || null]
    );

    const { rows } = await db.query("SELECT * FROM tags WHERE id = $1", [id]);
    const tag = rows[0];
    res.status(201).json(tag);
  } catch (err) {
    res.status(500).json({ error: safeError(err) });
  }
});

// PATCH /api/tags/:id - Update tag
router.patch("/:id", async (req, res) => {
  try {
    const tag = await verifyTagAccess(req.params.id, req, res);
    if (!tag) return;

    if (req.body.name !== undefined) {
      const nameErr = validateLength(req.body.name, "Name", MAX_NAME_LENGTH);
      if (nameErr) return res.status(400).json({ error: nameErr });
    }

    const allowed = ["name", "color"];
    const sets = [];
    const values = [];
    let paramIndex = 1;
    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        let val = req.body[key];
        if (key === "name") val = sanitizeHtml(val);
        sets.push(`${key} = $${paramIndex++}`);
        values.push(val);
      }
    }

    if (sets.length > 0) {
      values.push(req.params.id);
      await db.query(`UPDATE tags SET ${sets.join(", ")} WHERE id = $${paramIndex}`, values);
    }

    const { rows } = await db.query("SELECT * FROM tags WHERE id = $1", [req.params.id]);
    const updated = rows[0];
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: safeError(err) });
  }
});

// DELETE /api/tags/:id - Delete tag
router.delete("/:id", async (req, res) => {
  try {
    const tag = await verifyTagAccess(req.params.id, req, res);
    if (!tag) return;

    await db.query("DELETE FROM tags WHERE id = $1", [req.params.id]);
    res.status(204).end();
  } catch (err) {
    res.status(500).json({ error: safeError(err) });
  }
});

// =====================
// CARD-TAG ASSOCIATIONS
// =====================

// GET /api/tags/card/:cardId - Get tags for a card
router.get("/card/:cardId", async (req, res) => {
  try {
    // Verify card belongs to user's workspace
    const { rows: cardRows } = await db.query("SELECT * FROM cards WHERE id = $1", [req.params.cardId]);
    const card = cardRows[0];
    if (!card) return res.status(404).json({ error: "Card not found" });
    const { rows: roadmapRows } = await db.query("SELECT * FROM roadmaps WHERE id = $1", [card.roadmap_id]);
    const roadmap = roadmapRows[0];
    if (!roadmap || roadmap.workspace_id !== req.user.workspace_id) {
      return res.status(403).json({ error: "Access denied" });
    }

    const { rows: tags } = await db.query(
      `SELECT t.*, ct.id as card_tag_id FROM tags t
       JOIN card_tags ct ON ct.tag_id = t.id
       WHERE ct.card_id = $1
       ORDER BY t.name`,
      [req.params.cardId]
    );
    res.json(tags);
  } catch (err) {
    res.status(500).json({ error: safeError(err) });
  }
});

// POST /api/tags/card/:cardId - Add tag to card
router.post("/card/:cardId", async (req, res) => {
  try {
    // Verify card belongs to user's workspace
    const { rows: cardRows } = await db.query("SELECT * FROM cards WHERE id = $1", [req.params.cardId]);
    const card = cardRows[0];
    if (!card) return res.status(404).json({ error: "Card not found" });
    const { rows: roadmapRows } = await db.query("SELECT * FROM roadmaps WHERE id = $1", [card.roadmap_id]);
    const roadmap = roadmapRows[0];
    if (!roadmap || roadmap.workspace_id !== req.user.workspace_id) {
      return res.status(403).json({ error: "Access denied" });
    }

    const { tag_id } = req.body;
    if (!tag_id) {
      return res.status(400).json({ error: "tag_id is required" });
    }

    // Check if association already exists
    const { rows: existingRows } = await db.query(
      "SELECT id FROM card_tags WHERE card_id = $1 AND tag_id = $2",
      [req.params.cardId, tag_id]
    );
    const existing = existingRows[0];

    if (existing) {
      return res.status(409).json({ error: "Tag already attached to card" });
    }

    const id = uuidv4();
    await db.query(
      "INSERT INTO card_tags (id, card_id, tag_id) VALUES ($1, $2, $3)",
      [id, req.params.cardId, tag_id]
    );

    const { rows } = await db.query(
      `SELECT t.*, ct.id as card_tag_id FROM tags t
       JOIN card_tags ct ON ct.tag_id = t.id
       WHERE ct.id = $1`,
      [id]
    );
    const cardTag = rows[0];

    res.status(201).json(cardTag);
  } catch (err) {
    res.status(500).json({ error: safeError(err) });
  }
});

// DELETE /api/tags/card/:cardId/:tagId - Remove tag from card
router.delete("/card/:cardId/:tagId", async (req, res) => {
  try {
    // Verify card belongs to user's workspace
    const { rows: cardRows } = await db.query("SELECT * FROM cards WHERE id = $1", [req.params.cardId]);
    const card = cardRows[0];
    if (!card) return res.status(404).json({ error: "Card not found" });
    const { rows: roadmapRows } = await db.query("SELECT * FROM roadmaps WHERE id = $1", [card.roadmap_id]);
    const roadmap = roadmapRows[0];
    if (!roadmap || roadmap.workspace_id !== req.user.workspace_id) {
      return res.status(403).json({ error: "Access denied" });
    }

    await db.query(
      "DELETE FROM card_tags WHERE card_id = $1 AND tag_id = $2",
      [req.params.cardId, req.params.tagId]
    );
    res.status(204).end();
  } catch (err) {
    res.status(500).json({ error: safeError(err) });
  }
});

module.exports = router;
