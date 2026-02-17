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
async function verifyCardAccess(req, res) {
  const { rows: cardRows } = await db.query("SELECT * FROM cards WHERE id = $1", [req.params.id]);
  const card = cardRows[0];
  if (!card) {
    res.status(404).json({ error: "Card not found" });
    return null;
  }
  const { rows: roadmapRows } = await db.query("SELECT * FROM roadmaps WHERE id = $1", [card.roadmap_id]);
  const roadmap = roadmapRows[0];
  if (!roadmap || roadmap.workspace_id !== req.user.workspace_id) {
    res.status(403).json({ error: "Access denied" });
    return null;
  }
  return card;
}

// GET /api/cards/:id - Get single card with tags and dependencies
router.get("/:id", async (req, res) => {
  try {
    const card = await verifyCardAccess(req, res);
    if (!card) return;

    // Get tags
    const { rows: tags } = await db.query(
      `SELECT t.* FROM tags t
       JOIN card_tags ct ON ct.tag_id = t.id
       WHERE ct.card_id = $1`,
      [card.id]
    );

    // Get dependencies (cards this card blocks)
    const { rows: blocks } = await db.query(
      `SELECT cd.*, c.name as to_card_name FROM card_dependencies cd
       JOIN cards c ON c.id = cd.to_card_id
       WHERE cd.from_card_id = $1`,
      [card.id]
    );

    // Get dependencies (cards that block this card)
    const { rows: blocked_by } = await db.query(
      `SELECT cd.*, c.name as from_card_name FROM card_dependencies cd
       JOIN cards c ON c.id = cd.from_card_id
       WHERE cd.to_card_id = $1`,
      [card.id]
    );

    // Get custom field values
    const { rows: custom_fields } = await db.query(
      `SELECT cfv.*, cf.name as field_name, cf.field_type
       FROM custom_field_values cfv
       JOIN custom_fields cf ON cf.id = cfv.custom_field_id
       WHERE cfv.card_id = $1`,
      [card.id]
    );

    // Get card teams
    const { rows: card_teams } = await db.query(
      `SELECT ct.*, t.name as team_name, t.color as team_color
       FROM card_teams ct
       JOIN teams t ON t.id = ct.team_id
       WHERE ct.card_id = $1`,
      [card.id]
    );

    // Get comments
    const { rows: comments } = await db.query(
      `SELECT cm.*, u.name as user_name, u.avatar_url
       FROM comments cm
       LEFT JOIN users u ON u.id = cm.user_id
       WHERE cm.card_id = $1
       ORDER BY cm.created_at ASC`,
      [card.id]
    );

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
router.patch("/:id", async (req, res) => {
  try {
    const card = await verifyCardAccess(req, res);
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
    let paramIndex = 1;
    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        let val = req.body[key];
        if (key === "name") val = sanitizeHtml(val);
        if (key === "description" && val !== null) val = sanitizeHtml(val);
        sets.push(`${key} = $${paramIndex}`);
        values.push(val);
        paramIndex++;
      }
    }

    if (sets.length > 0) {
      values.push(req.params.id);
      await db.query(`UPDATE cards SET ${sets.join(", ")} WHERE id = $${paramIndex}`, values);
    }

    const { rows: updatedRows } = await db.query("SELECT * FROM cards WHERE id = $1", [req.params.id]);
    const updated = updatedRows[0];

    // Return with tags
    const { rows: tags } = await db.query(
      `SELECT t.* FROM tags t
       JOIN card_tags ct ON ct.tag_id = t.id
       WHERE ct.card_id = $1`,
      [updated.id]
    );

    res.json({ ...updated, tags });
  } catch (err) {
    res.status(500).json({ error: safeError(err) });
  }
});

// DELETE /api/cards/:id - Delete card
router.delete("/:id", async (req, res) => {
  try {
    const card = await verifyCardAccess(req, res);
    if (!card) return;

    await db.query("DELETE FROM cards WHERE id = $1", [req.params.id]);
    res.status(204).end();
  } catch (err) {
    res.status(500).json({ error: safeError(err) });
  }
});

// PATCH /api/cards/:id/position - Update card position (row and sort order)
router.patch("/:id/position", async (req, res) => {
  try {
    const card = await verifyCardAccess(req, res);
    if (!card) return;

    const { row_id, sort_order, start_sprint, duration_sprints, start_sprint_id, end_sprint_id } = req.body;

    const sets = [];
    const values = [];
    let paramIndex = 1;

    if (row_id !== undefined) {
      sets.push(`row_id = $${paramIndex}`);
      values.push(row_id);
      paramIndex++;
    }
    if (sort_order !== undefined) {
      sets.push(`sort_order = $${paramIndex}`);
      values.push(sort_order);
      paramIndex++;
    }
    if (start_sprint !== undefined) {
      sets.push(`start_sprint = $${paramIndex}`);
      values.push(start_sprint);
      paramIndex++;
    }
    if (duration_sprints !== undefined) {
      sets.push(`duration_sprints = $${paramIndex}`);
      values.push(duration_sprints);
      paramIndex++;
    }
    if (start_sprint_id !== undefined) {
      sets.push(`start_sprint_id = $${paramIndex}`);
      values.push(start_sprint_id);
      paramIndex++;
    }
    if (end_sprint_id !== undefined) {
      sets.push(`end_sprint_id = $${paramIndex}`);
      values.push(end_sprint_id);
      paramIndex++;
    }

    if (sets.length > 0) {
      values.push(req.params.id);
      await db.query(`UPDATE cards SET ${sets.join(", ")} WHERE id = $${paramIndex}`, values);
    }

    const { rows: updatedRows } = await db.query("SELECT * FROM cards WHERE id = $1", [req.params.id]);
    const updated = updatedRows[0];

    // Keep card-anchored comments in sync with card position
    const commentSets = [];
    const commentVals = [];
    let commentParamIndex = 1;
    if (row_id !== undefined) {
      commentSets.push(`anchor_row_id = $${commentParamIndex}`);
      commentVals.push(row_id);
      commentParamIndex++;
    }
    if (start_sprint_id !== undefined) {
      commentSets.push(`anchor_sprint_id = $${commentParamIndex}`);
      commentVals.push(start_sprint_id);
      commentParamIndex++;
    }
    if (commentSets.length > 0) {
      commentVals.push(req.params.id);
      await db.query(
        `UPDATE comments SET ${commentSets.join(", ")} WHERE card_id = $${commentParamIndex} AND anchor_type = 'card'`,
        commentVals
      );
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
router.post("/:id/dependencies", async (req, res) => {
  try {
    const card = await verifyCardAccess(req, res);
    if (!card) return;

    const { to_card_id, type } = req.body;
    if (!to_card_id) {
      return res.status(400).json({ error: "to_card_id is required" });
    }

    const id = uuidv4();
    await db.query(
      "INSERT INTO card_dependencies (id, from_card_id, to_card_id, type) VALUES ($1, $2, $3, $4)",
      [id, req.params.id, to_card_id, type || "blocks"]
    );

    const { rows } = await db.query("SELECT * FROM card_dependencies WHERE id = $1", [id]);
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: safeError(err) });
  }
});

// DELETE /api/cards/:id/dependencies/:depId - Remove dependency
router.delete("/:id/dependencies/:depId", async (req, res) => {
  try {
    const card = await verifyCardAccess(req, res);
    if (!card) return;

    await db.query("DELETE FROM card_dependencies WHERE id = $1", [req.params.depId]);
    res.status(204).end();
  } catch (err) {
    res.status(500).json({ error: safeError(err) });
  }
});

// =====================
// CARD TEAMS
// =====================

// GET /api/cards/:id/teams - Get teams assigned to a card with effort
router.get("/:id/teams", async (req, res) => {
  try {
    const card = await verifyCardAccess(req, res);
    if (!card) return;

    const { rows: teams } = await db.query(
      `SELECT ct.*, t.name as team_name, t.color as team_color
       FROM card_teams ct
       JOIN teams t ON t.id = ct.team_id
       WHERE ct.card_id = $1`,
      [req.params.id]
    );

    res.json(teams);
  } catch (err) {
    res.status(500).json({ error: safeError(err) });
  }
});

// PUT /api/cards/:id/teams - Replace all card teams
router.put("/:id/teams", async (req, res) => {
  try {
    const card = await verifyCardAccess(req, res);
    if (!card) return;

    const { teams } = req.body;
    if (!Array.isArray(teams)) {
      return res.status(400).json({ error: "teams must be an array" });
    }

    // Delete existing card teams
    await db.query("DELETE FROM card_teams WHERE card_id = $1", [req.params.id]);

    // Insert new card teams
    for (const { team_id, effort } of teams) {
      if (effort !== undefined && effort !== null) {
        const effortErr = validateNonNegativeNumber(effort, "effort");
        if (effortErr) return res.status(400).json({ error: effortErr });
      }
      const id = uuidv4();
      await db.query(
        "INSERT INTO card_teams (id, card_id, team_id, effort) VALUES ($1, $2, $3, $4)",
        [id, req.params.id, team_id, effort || 0]
      );
    }

    // Return updated card teams
    const { rows: updatedTeams } = await db.query(
      `SELECT ct.*, t.name as team_name, t.color as team_color
       FROM card_teams ct
       JOIN teams t ON t.id = ct.team_id
       WHERE ct.card_id = $1`,
      [req.params.id]
    );

    res.json(updatedTeams);
  } catch (err) {
    res.status(500).json({ error: safeError(err) });
  }
});

// =====================
// CARD CUSTOM FIELDS
// =====================

// PUT /api/cards/:id/custom-fields - Set all custom field values for a card
router.put("/:id/custom-fields", async (req, res) => {
  try {
    const card = await verifyCardAccess(req, res);
    if (!card) return;

    const { fields } = req.body;
    if (!Array.isArray(fields)) {
      return res.status(400).json({ error: "fields must be an array" });
    }

    // Delete existing custom field values for this card
    await db.query("DELETE FROM custom_field_values WHERE card_id = $1", [req.params.id]);

    // Insert new custom field values
    for (const { custom_field_id, value } of fields) {
      const id = uuidv4();
      await db.query(
        "INSERT INTO custom_field_values (id, card_id, custom_field_id, value) VALUES ($1, $2, $3, $4)",
        [id, req.params.id, custom_field_id, value ?? null]
      );
    }

    // Return updated custom field values
    const { rows: updatedFields } = await db.query(
      `SELECT cfv.*, cf.name as field_name, cf.field_type, cf.options
       FROM custom_field_values cfv
       JOIN custom_fields cf ON cf.id = cfv.custom_field_id
       WHERE cfv.card_id = $1`,
      [req.params.id]
    );

    res.json(updatedFields);
  } catch (err) {
    res.status(500).json({ error: safeError(err) });
  }
});

module.exports = router;
