const express = require("express");
const router = express.Router();
const { v4: uuidv4 } = require("uuid");
const db = require("../models/db");
const { authMiddleware } = require("./auth");
const {
  sanitizeHtml,
  validateLength,
  MAX_NAME_LENGTH,
  MAX_DESCRIPTION_LENGTH,
} = require("../middleware/validate");

function safeError(err) {
  if (process.env.NODE_ENV === "production") return "Internal server error";
  return err.message;
}

// All routes require authentication
router.use(authMiddleware);

// Helper: verify lens belongs to user's workspace
async function verifyLensAccess(lensId, req, res) {
  const { rows } = await db.query("SELECT * FROM lenses WHERE id = $1", [lensId]);
  const lens = rows[0];
  if (!lens) {
    res.status(404).json({ error: "Lens not found" });
    return null;
  }
  if (lens.workspace_id !== req.user.workspace_id) {
    res.status(403).json({ error: "Access denied" });
    return null;
  }
  return lens;
}

// =====================
// LENS CRUD
// =====================

// GET /api/lenses - List lenses for the user's workspace
router.get("/", async (req, res) => {
  try {
    const workspace_id = req.user.workspace_id;
    const { rows: lenses } = await db.query("SELECT * FROM lenses WHERE workspace_id = $1 ORDER BY name", [workspace_id]);

    // Parse JSON fields
    const parsed = lenses.map((lens) => ({
      ...lens,
      priority_fields: lens.priority_fields ? JSON.parse(lens.priority_fields) : [],
      is_active: Boolean(lens.is_active),
    }));

    res.json(parsed);
  } catch (err) {
    res.status(500).json({ error: safeError(err) });
  }
});

// POST /api/lenses - Create lens
router.post("/", async (req, res) => {
  try {
    const workspace_id = req.user.workspace_id;
    const { name, icon, description, is_active, strategy_context, data_source, priority_fields } = req.body;
    if (!name) {
      return res.status(400).json({ error: "name is required" });
    }

    const nameErr = validateLength(name, "Name", MAX_NAME_LENGTH);
    if (nameErr) return res.status(400).json({ error: nameErr });

    if (description) {
      const descErr = validateLength(description, "Description", MAX_DESCRIPTION_LENGTH);
      if (descErr) return res.status(400).json({ error: descErr });
    }

    const id = uuidv4();
    await db.query(
      `INSERT INTO lenses (id, workspace_id, name, icon, description, is_active, strategy_context, data_source, priority_fields)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        id, workspace_id, sanitizeHtml(name), icon || null, description ? sanitizeHtml(description) : null,
        is_active !== undefined ? (is_active ? 1 : 0) : 1,
        strategy_context ? sanitizeHtml(strategy_context) : null,
        data_source || "manual",
        priority_fields ? JSON.stringify(priority_fields) : null
      ]
    );

    const { rows } = await db.query("SELECT * FROM lenses WHERE id = $1", [id]);
    const lens = rows[0];
    res.status(201).json({
      ...lens,
      priority_fields: lens.priority_fields ? JSON.parse(lens.priority_fields) : [],
      is_active: Boolean(lens.is_active),
    });
  } catch (err) {
    res.status(500).json({ error: safeError(err) });
  }
});

// GET /api/lenses/:id - Get lens with perspectives
router.get("/:id", async (req, res) => {
  try {
    const lens = await verifyLensAccess(req.params.id, req, res);
    if (!lens) return;

    const { rows: perspectives } = await db.query(
      `SELECT lp.*, c.name as card_name, c.status as card_status
       FROM lens_perspectives lp
       JOIN cards c ON c.id = lp.card_id
       WHERE lp.lens_id = $1
       ORDER BY lp.updated_at DESC`,
      [req.params.id]
    );

    res.json({
      ...lens,
      priority_fields: lens.priority_fields ? JSON.parse(lens.priority_fields) : [],
      is_active: Boolean(lens.is_active),
      perspectives,
    });
  } catch (err) {
    res.status(500).json({ error: safeError(err) });
  }
});

// PATCH /api/lenses/:id - Update lens
router.patch("/:id", async (req, res) => {
  try {
    const lens = await verifyLensAccess(req.params.id, req, res);
    if (!lens) return;

    if (req.body.name !== undefined) {
      const nameErr = validateLength(req.body.name, "Name", MAX_NAME_LENGTH);
      if (nameErr) return res.status(400).json({ error: nameErr });
    }
    if (req.body.description !== undefined && req.body.description !== null) {
      const descErr = validateLength(req.body.description, "Description", MAX_DESCRIPTION_LENGTH);
      if (descErr) return res.status(400).json({ error: descErr });
    }

    const allowed = ["name", "icon", "description", "is_active", "strategy_context", "data_source", "priority_fields"];
    const sets = [];
    const values = [];
    let paramIndex = 1;
    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        if (key === "is_active") {
          sets.push(`is_active = $${paramIndex++}`);
          values.push(req.body[key] ? 1 : 0);
        } else if (key === "priority_fields") {
          sets.push(`priority_fields = $${paramIndex++}`);
          values.push(JSON.stringify(req.body[key]));
        } else {
          let val = req.body[key];
          if (["name", "description", "strategy_context"].includes(key) && val !== null) {
            val = sanitizeHtml(val);
          }
          sets.push(`${key} = $${paramIndex++}`);
          values.push(val);
        }
      }
    }

    if (sets.length > 0) {
      values.push(req.params.id);
      await db.query(`UPDATE lenses SET ${sets.join(", ")} WHERE id = $${paramIndex}`, values);
    }

    const { rows } = await db.query("SELECT * FROM lenses WHERE id = $1", [req.params.id]);
    const updated = rows[0];
    res.json({
      ...updated,
      priority_fields: updated.priority_fields ? JSON.parse(updated.priority_fields) : [],
      is_active: Boolean(updated.is_active),
    });
  } catch (err) {
    res.status(500).json({ error: safeError(err) });
  }
});

// DELETE /api/lenses/:id - Delete lens
router.delete("/:id", async (req, res) => {
  try {
    const lens = await verifyLensAccess(req.params.id, req, res);
    if (!lens) return;

    await db.query("DELETE FROM lenses WHERE id = $1", [req.params.id]);
    res.status(204).end();
  } catch (err) {
    res.status(500).json({ error: safeError(err) });
  }
});

// =====================
// LENS PERSPECTIVES
// =====================

// GET /api/lenses/:id/perspectives - Get perspectives for a lens
router.get("/:id/perspectives", async (req, res) => {
  try {
    const lens = await verifyLensAccess(req.params.id, req, res);
    if (!lens) return;

    const { rows: perspectives } = await db.query(
      `SELECT lp.*, c.name as card_name, c.status as card_status, c.effort, c.team_id
       FROM lens_perspectives lp
       JOIN cards c ON c.id = lp.card_id
       WHERE lp.lens_id = $1
       ORDER BY lp.score DESC`,
      [req.params.id]
    );
    res.json(perspectives);
  } catch (err) {
    res.status(500).json({ error: safeError(err) });
  }
});

// POST /api/lenses/:id/perspectives - Add or update a perspective
router.post("/:id/perspectives", async (req, res) => {
  try {
    const lens = await verifyLensAccess(req.params.id, req, res);
    if (!lens) return;

    const { card_id, score, narrative } = req.body;
    if (!card_id) {
      return res.status(400).json({ error: "card_id is required" });
    }

    // Check if perspective already exists
    const { rows: existingRows } = await db.query(
      "SELECT * FROM lens_perspectives WHERE lens_id = $1 AND card_id = $2",
      [req.params.id, card_id]
    );
    const existing = existingRows[0];

    if (existing) {
      // Update existing perspective
      await db.query(
        "UPDATE lens_perspectives SET score = $1, narrative = $2, updated_at = NOW() WHERE id = $3",
        [score || existing.score, narrative ? sanitizeHtml(narrative) : existing.narrative, existing.id]
      );

      const { rows } = await db.query("SELECT * FROM lens_perspectives WHERE id = $1", [existing.id]);
      const updated = rows[0];
      return res.json(updated);
    }

    // Create new perspective
    const id = uuidv4();
    await db.query(
      "INSERT INTO lens_perspectives (id, lens_id, card_id, score, narrative) VALUES ($1, $2, $3, $4, $5)",
      [id, req.params.id, card_id, score || null, narrative ? sanitizeHtml(narrative) : null]
    );

    const { rows } = await db.query("SELECT * FROM lens_perspectives WHERE id = $1", [id]);
    const perspective = rows[0];
    res.status(201).json(perspective);
  } catch (err) {
    res.status(500).json({ error: safeError(err) });
  }
});

// DELETE /api/lenses/:lensId/perspectives/:perspId - Delete a perspective
router.delete("/:lensId/perspectives/:perspId", async (req, res) => {
  try {
    const lens = await verifyLensAccess(req.params.lensId, req, res);
    if (!lens) return;

    await db.query("DELETE FROM lens_perspectives WHERE id = $1", [req.params.perspId]);
    res.status(204).end();
  } catch (err) {
    res.status(500).json({ error: safeError(err) });
  }
});

// POST /api/lenses/:id/evaluate - Evaluate all cards in a roadmap through this lens
router.post("/:id/evaluate", async (req, res) => {
  try {
    const lens = await verifyLensAccess(req.params.id, req, res);
    if (!lens) return;

    const { roadmap_id } = req.body;
    if (!roadmap_id) {
      return res.status(400).json({ error: "roadmap_id is required" });
    }

    // Verify roadmap belongs to same workspace
    const { rows: roadmapRows } = await db.query("SELECT * FROM roadmaps WHERE id = $1", [roadmap_id]);
    const roadmap = roadmapRows[0];
    if (!roadmap || roadmap.workspace_id !== req.user.workspace_id) {
      return res.status(403).json({ error: "Access denied" });
    }

    // Get all cards for the roadmap
    const { rows: cards } = await db.query("SELECT * FROM cards WHERE roadmap_id = $1", [roadmap_id]);

    const priorityFields = lens.priority_fields ? JSON.parse(lens.priority_fields) : [];
    const results = [];

    for (const card of cards) {
      // Simple rule-based scoring based on lens type and card properties
      let score = 50; // base score
      let narrative = "";

      // Score based on effort (lower effort = higher score for efficiency lenses)
      if (card.effort) {
        score += Math.max(0, 100 - card.effort * 10);
      }

      // Score based on status
      if (card.status === "committed") score += 20;
      else if (card.status === "tentative") score += 10;

      // Score based on headcount needs
      if (card.headcount && card.headcount <= 2) score += 10;

      // Normalize to 0-100
      score = Math.min(100, Math.max(0, Math.round(score)));

      narrative = `Score ${score}/100 based on effort (${card.effort || "unestimated"}), status (${card.status}), and resource needs (${card.headcount || 1} headcount).`;

      // Upsert perspective
      const { rows: existingRows } = await db.query(
        "SELECT * FROM lens_perspectives WHERE lens_id = $1 AND card_id = $2",
        [req.params.id, card.id]
      );
      const existing = existingRows[0];
      const perspId = existing ? existing.id : uuidv4();

      if (existing) {
        await db.query(
          "UPDATE lens_perspectives SET score = $1, narrative = $2, updated_at = NOW() WHERE id = $3",
          [String(score), narrative, perspId]
        );
      } else {
        await db.query(
          "INSERT INTO lens_perspectives (id, lens_id, card_id, score, narrative) VALUES ($1, $2, $3, $4, $5)",
          [perspId, req.params.id, card.id, String(score), narrative]
        );
      }

      results.push({
        card_id: card.id,
        card_name: card.name,
        score: String(score),
        narrative,
      });
    }

    res.json({
      lens_id: req.params.id,
      lens_name: lens.name,
      roadmap_id,
      evaluated_count: results.length,
      perspectives: results,
    });
  } catch (err) {
    res.status(500).json({ error: safeError(err) });
  }
});

module.exports = router;
