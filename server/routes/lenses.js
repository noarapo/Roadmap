const express = require("express");
const router = express.Router();
const { v4: uuidv4 } = require("uuid");
const db = require("../models/db");

// =====================
// LENS CRUD
// =====================

// GET /api/lenses - List lenses (optionally by workspace_id)
router.get("/", (req, res) => {
  try {
    const { workspace_id } = req.query;
    let lenses;
    if (workspace_id) {
      lenses = db.prepare("SELECT * FROM lenses WHERE workspace_id = ? ORDER BY name").all(workspace_id);
    } else {
      lenses = db.prepare("SELECT * FROM lenses ORDER BY name").all();
    }

    // Parse JSON fields
    const parsed = lenses.map((lens) => ({
      ...lens,
      priority_fields: lens.priority_fields ? JSON.parse(lens.priority_fields) : [],
      is_active: Boolean(lens.is_active),
    }));

    res.json(parsed);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/lenses - Create lens
router.post("/", (req, res) => {
  try {
    const { workspace_id, name, icon, description, is_active, strategy_context, data_source, priority_fields } = req.body;
    if (!workspace_id || !name) {
      return res.status(400).json({ error: "workspace_id and name are required" });
    }

    const id = uuidv4();
    db.prepare(
      `INSERT INTO lenses (id, workspace_id, name, icon, description, is_active, strategy_context, data_source, priority_fields)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id, workspace_id, name, icon || null, description || null,
      is_active !== undefined ? (is_active ? 1 : 0) : 1,
      strategy_context || null,
      data_source || "manual",
      priority_fields ? JSON.stringify(priority_fields) : null
    );

    const lens = db.prepare("SELECT * FROM lenses WHERE id = ?").get(id);
    res.status(201).json({
      ...lens,
      priority_fields: lens.priority_fields ? JSON.parse(lens.priority_fields) : [],
      is_active: Boolean(lens.is_active),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/lenses/:id - Get lens with perspectives
router.get("/:id", (req, res) => {
  try {
    const lens = db.prepare("SELECT * FROM lenses WHERE id = ?").get(req.params.id);
    if (!lens) {
      return res.status(404).json({ error: "Lens not found" });
    }

    const perspectives = db.prepare(
      `SELECT lp.*, c.name as card_name, c.status as card_status
       FROM lens_perspectives lp
       JOIN cards c ON c.id = lp.card_id
       WHERE lp.lens_id = ?
       ORDER BY lp.updated_at DESC`
    ).all(req.params.id);

    res.json({
      ...lens,
      priority_fields: lens.priority_fields ? JSON.parse(lens.priority_fields) : [],
      is_active: Boolean(lens.is_active),
      perspectives,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/lenses/:id - Update lens
router.patch("/:id", (req, res) => {
  try {
    const lens = db.prepare("SELECT * FROM lenses WHERE id = ?").get(req.params.id);
    if (!lens) {
      return res.status(404).json({ error: "Lens not found" });
    }

    const allowed = ["name", "icon", "description", "is_active", "strategy_context", "data_source", "priority_fields"];
    const sets = [];
    const values = [];
    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        if (key === "is_active") {
          sets.push("is_active = ?");
          values.push(req.body[key] ? 1 : 0);
        } else if (key === "priority_fields") {
          sets.push("priority_fields = ?");
          values.push(JSON.stringify(req.body[key]));
        } else {
          sets.push(`${key} = ?`);
          values.push(req.body[key]);
        }
      }
    }

    if (sets.length > 0) {
      values.push(req.params.id);
      db.prepare(`UPDATE lenses SET ${sets.join(", ")} WHERE id = ?`).run(...values);
    }

    const updated = db.prepare("SELECT * FROM lenses WHERE id = ?").get(req.params.id);
    res.json({
      ...updated,
      priority_fields: updated.priority_fields ? JSON.parse(updated.priority_fields) : [],
      is_active: Boolean(updated.is_active),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/lenses/:id - Delete lens
router.delete("/:id", (req, res) => {
  try {
    const lens = db.prepare("SELECT * FROM lenses WHERE id = ?").get(req.params.id);
    if (!lens) {
      return res.status(404).json({ error: "Lens not found" });
    }
    db.prepare("DELETE FROM lenses WHERE id = ?").run(req.params.id);
    res.status(204).end();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// =====================
// LENS PERSPECTIVES
// =====================

// GET /api/lenses/:id/perspectives - Get perspectives for a lens
router.get("/:id/perspectives", (req, res) => {
  try {
    const perspectives = db.prepare(
      `SELECT lp.*, c.name as card_name, c.status as card_status, c.effort, c.team_id
       FROM lens_perspectives lp
       JOIN cards c ON c.id = lp.card_id
       WHERE lp.lens_id = ?
       ORDER BY lp.score DESC`
    ).all(req.params.id);
    res.json(perspectives);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/lenses/:id/perspectives - Add or update a perspective
router.post("/:id/perspectives", (req, res) => {
  try {
    const { card_id, score, narrative } = req.body;
    if (!card_id) {
      return res.status(400).json({ error: "card_id is required" });
    }

    // Check if perspective already exists
    const existing = db.prepare(
      "SELECT * FROM lens_perspectives WHERE lens_id = ? AND card_id = ?"
    ).get(req.params.id, card_id);

    if (existing) {
      // Update existing perspective
      db.prepare(
        "UPDATE lens_perspectives SET score = ?, narrative = ?, updated_at = datetime('now') WHERE id = ?"
      ).run(score || existing.score, narrative || existing.narrative, existing.id);

      const updated = db.prepare("SELECT * FROM lens_perspectives WHERE id = ?").get(existing.id);
      return res.json(updated);
    }

    // Create new perspective
    const id = uuidv4();
    db.prepare(
      "INSERT INTO lens_perspectives (id, lens_id, card_id, score, narrative) VALUES (?, ?, ?, ?, ?)"
    ).run(id, req.params.id, card_id, score || null, narrative || null);

    const perspective = db.prepare("SELECT * FROM lens_perspectives WHERE id = ?").get(id);
    res.status(201).json(perspective);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/lenses/:lensId/perspectives/:perspId - Delete a perspective
router.delete("/:lensId/perspectives/:perspId", (req, res) => {
  try {
    db.prepare("DELETE FROM lens_perspectives WHERE id = ?").run(req.params.perspId);
    res.status(204).end();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/lenses/:id/evaluate - Evaluate all cards in a roadmap through this lens
router.post("/:id/evaluate", (req, res) => {
  try {
    const lens = db.prepare("SELECT * FROM lenses WHERE id = ?").get(req.params.id);
    if (!lens) {
      return res.status(404).json({ error: "Lens not found" });
    }

    const { roadmap_id } = req.body;
    if (!roadmap_id) {
      return res.status(400).json({ error: "roadmap_id is required" });
    }

    // Get all cards for the roadmap
    const cards = db.prepare("SELECT * FROM cards WHERE roadmap_id = ?").all(roadmap_id);

    const priorityFields = lens.priority_fields ? JSON.parse(lens.priority_fields) : [];
    const results = [];

    const upsertStmt = db.prepare(
      `INSERT INTO lens_perspectives (id, lens_id, card_id, score, narrative, updated_at)
       VALUES (?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT(id) DO UPDATE SET score = excluded.score, narrative = excluded.narrative, updated_at = datetime('now')`
    );

    const findExisting = db.prepare(
      "SELECT * FROM lens_perspectives WHERE lens_id = ? AND card_id = ?"
    );

    const evaluate = db.transaction(() => {
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
        const existing = findExisting.get(req.params.id, card.id);
        const perspId = existing ? existing.id : uuidv4();

        if (existing) {
          db.prepare(
            "UPDATE lens_perspectives SET score = ?, narrative = ?, updated_at = datetime('now') WHERE id = ?"
          ).run(String(score), narrative, perspId);
        } else {
          db.prepare(
            "INSERT INTO lens_perspectives (id, lens_id, card_id, score, narrative) VALUES (?, ?, ?, ?, ?)"
          ).run(perspId, req.params.id, card.id, String(score), narrative);
        }

        results.push({
          card_id: card.id,
          card_name: card.name,
          score: String(score),
          narrative,
        });
      }
    });

    evaluate();

    res.json({
      lens_id: req.params.id,
      lens_name: lens.name,
      roadmap_id,
      evaluated_count: results.length,
      perspectives: results,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
