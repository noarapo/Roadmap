const express = require("express");
const router = express.Router();
const { v4: uuidv4 } = require("uuid");
const db = require("../models/db");
const { authMiddleware } = require("./auth");
const {
  sanitizeHtml,
  validateLength,
  validateNonNegativeNumber,
  MAX_NAME_LENGTH,
  MAX_DESCRIPTION_LENGTH,
} = require("../middleware/validate");

function safeError(err) {
  if (process.env.NODE_ENV === "production") return "Internal server error";
  return err.message;
}

// All routes require authentication
router.use(authMiddleware);

// Helper: verify card belongs to user's workspace via its roadmap
function verifyCardAccess(req, res) {
  const card = db.prepare("SELECT * FROM cards WHERE id = ?").get(req.params.id);
  if (!card) {
    res.status(404).json({ error: "Card not found" });
    return null;
  }
  const roadmap = db.prepare("SELECT * FROM roadmaps WHERE id = ?").get(card.roadmap_id);
  if (!roadmap || roadmap.workspace_id !== req.user.workspace_id) {
    res.status(403).json({ error: "Access denied" });
    return null;
  }
  return card;
}

// GET /api/cards/:id - Get single card with tags and dependencies
router.get("/:id", (req, res) => {
  try {
    const card = verifyCardAccess(req, res);
    if (!card) return;

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

    // Get card teams
    const card_teams = db.prepare(
      `SELECT ct.*, t.name as team_name, t.color as team_color
       FROM card_teams ct
       JOIN teams t ON t.id = ct.team_id
       WHERE ct.card_id = ?`
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
      card_teams,
      comments,
    });
  } catch (err) {
    res.status(500).json({ error: safeError(err) });
  }
});

// PATCH /api/cards/:id - Update card
router.patch("/:id", (req, res) => {
  try {
    const card = verifyCardAccess(req, res);
    if (!card) return;

    // Validate inputs
    if (req.body.name !== undefined) {
      const nameErr = validateLength(req.body.name, "Name", MAX_NAME_LENGTH);
      if (nameErr) return res.status(400).json({ error: nameErr });
    }
    if (req.body.description !== undefined && req.body.description !== null) {
      const descErr = validateLength(req.body.description, "Description", MAX_DESCRIPTION_LENGTH);
      if (descErr) return res.status(400).json({ error: descErr });
    }
    if (req.body.effort !== undefined && req.body.effort !== null) {
      const effortErr = validateNonNegativeNumber(req.body.effort, "effort");
      if (effortErr) return res.status(400).json({ error: effortErr });
    }
    if (req.body.headcount !== undefined && req.body.headcount !== null) {
      const hcErr = validateNonNegativeNumber(req.body.headcount, "headcount");
      if (hcErr) return res.status(400).json({ error: hcErr });
    }

    const allowed = [
      "row_id", "name", "description", "status", "team_id",
      "effort", "headcount", "start_sprint", "duration_sprints", "sort_order",
      "start_sprint_id", "end_sprint_id"
    ];
    const sets = [];
    const values = [];
    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        let val = req.body[key];
        if (key === "name") val = sanitizeHtml(val);
        if (key === "description" && val !== null) val = sanitizeHtml(val);
        sets.push(`${key} = ?`);
        values.push(val);
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
    res.status(500).json({ error: safeError(err) });
  }
});

// DELETE /api/cards/:id - Delete card
router.delete("/:id", (req, res) => {
  try {
    const card = verifyCardAccess(req, res);
    if (!card) return;

    db.prepare("DELETE FROM cards WHERE id = ?").run(req.params.id);
    res.status(204).end();
  } catch (err) {
    res.status(500).json({ error: safeError(err) });
  }
});

// PATCH /api/cards/:id/position - Update card position (row and sort order)
router.patch("/:id/position", (req, res) => {
  try {
    const card = verifyCardAccess(req, res);
    if (!card) return;

    const { row_id, sort_order, start_sprint, duration_sprints, start_sprint_id, end_sprint_id } = req.body;

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
    if (start_sprint_id !== undefined) {
      sets.push("start_sprint_id = ?");
      values.push(start_sprint_id);
    }
    if (end_sprint_id !== undefined) {
      sets.push("end_sprint_id = ?");
      values.push(end_sprint_id);
    }

    if (sets.length > 0) {
      values.push(req.params.id);
      db.prepare(`UPDATE cards SET ${sets.join(", ")} WHERE id = ?`).run(...values);
    }

    const updated = db.prepare("SELECT * FROM cards WHERE id = ?").get(req.params.id);

    // Keep card-anchored comments in sync with card position
    const commentSets = [];
    const commentVals = [];
    if (row_id !== undefined) {
      commentSets.push("anchor_row_id = ?");
      commentVals.push(row_id);
    }
    if (start_sprint_id !== undefined) {
      commentSets.push("anchor_sprint_id = ?");
      commentVals.push(start_sprint_id);
    }
    if (commentSets.length > 0) {
      commentVals.push(req.params.id);
      db.prepare(
        `UPDATE comments SET ${commentSets.join(", ")} WHERE card_id = ? AND anchor_type = 'card'`
      ).run(...commentVals);
    }

    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: safeError(err) });
  }
});

// =====================
// CARD DEPENDENCIES
// =====================

// POST /api/cards/:id/dependencies - Add dependency
router.post("/:id/dependencies", (req, res) => {
  try {
    const card = verifyCardAccess(req, res);
    if (!card) return;

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
    res.status(500).json({ error: safeError(err) });
  }
});

// DELETE /api/cards/:id/dependencies/:depId - Remove dependency
router.delete("/:id/dependencies/:depId", (req, res) => {
  try {
    const card = verifyCardAccess(req, res);
    if (!card) return;

    db.prepare("DELETE FROM card_dependencies WHERE id = ?").run(req.params.depId);
    res.status(204).end();
  } catch (err) {
    res.status(500).json({ error: safeError(err) });
  }
});

// =====================
// CARD TEAMS
// =====================

// GET /api/cards/:id/teams - Get teams assigned to a card with effort
router.get("/:id/teams", (req, res) => {
  try {
    const card = verifyCardAccess(req, res);
    if (!card) return;

    const teams = db.prepare(
      `SELECT ct.*, t.name as team_name, t.color as team_color
       FROM card_teams ct
       JOIN teams t ON t.id = ct.team_id
       WHERE ct.card_id = ?`
    ).all(req.params.id);

    res.json(teams);
  } catch (err) {
    res.status(500).json({ error: safeError(err) });
  }
});

// PUT /api/cards/:id/teams - Replace all card teams
router.put("/:id/teams", (req, res) => {
  try {
    const card = verifyCardAccess(req, res);
    if (!card) return;

    const { teams } = req.body;
    if (!Array.isArray(teams)) {
      return res.status(400).json({ error: "teams must be an array" });
    }

    // Delete existing card teams
    db.prepare("DELETE FROM card_teams WHERE card_id = ?").run(req.params.id);

    // Insert new card teams
    const insertStmt = db.prepare(
      "INSERT INTO card_teams (id, card_id, team_id, effort) VALUES (?, ?, ?, ?)"
    );

    for (const { team_id, effort } of teams) {
      if (effort !== undefined && effort !== null) {
        const effortErr = validateNonNegativeNumber(effort, "effort");
        if (effortErr) return res.status(400).json({ error: effortErr });
      }
      const id = uuidv4();
      insertStmt.run(id, req.params.id, team_id, effort || 0);
    }

    // Return updated card teams
    const updatedTeams = db.prepare(
      `SELECT ct.*, t.name as team_name, t.color as team_color
       FROM card_teams ct
       JOIN teams t ON t.id = ct.team_id
       WHERE ct.card_id = ?`
    ).all(req.params.id);

    res.json(updatedTeams);
  } catch (err) {
    res.status(500).json({ error: safeError(err) });
  }
});

// =====================
// CARD CUSTOM FIELDS
// =====================

// PUT /api/cards/:id/custom-fields - Set all custom field values for a card
router.put("/:id/custom-fields", (req, res) => {
  try {
    const card = verifyCardAccess(req, res);
    if (!card) return;

    const { fields } = req.body;
    if (!Array.isArray(fields)) {
      return res.status(400).json({ error: "fields must be an array" });
    }

    // Delete existing custom field values for this card
    db.prepare("DELETE FROM custom_field_values WHERE card_id = ?").run(req.params.id);

    // Insert new custom field values
    const insertStmt = db.prepare(
      "INSERT INTO custom_field_values (id, card_id, custom_field_id, value) VALUES (?, ?, ?, ?)"
    );

    for (const { custom_field_id, value } of fields) {
      const id = uuidv4();
      insertStmt.run(id, req.params.id, custom_field_id, value ?? null);
    }

    // Return updated custom field values
    const updatedFields = db.prepare(
      `SELECT cfv.*, cf.name as field_name, cf.field_type, cf.options
       FROM custom_field_values cfv
       JOIN custom_fields cf ON cf.id = cfv.custom_field_id
       WHERE cfv.card_id = ?`
    ).all(req.params.id);

    res.json(updatedFields);
  } catch (err) {
    res.status(500).json({ error: safeError(err) });
  }
});

module.exports = router;
