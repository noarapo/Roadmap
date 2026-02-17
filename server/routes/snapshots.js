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

// Helper: verify roadmap belongs to user's workspace
async function verifyRoadmapWorkspace(roadmapId, req) {
  const { rows } = await db.query("SELECT * FROM roadmaps WHERE id = $1", [roadmapId]);
  const roadmap = rows[0];
  if (!roadmap) return null;
  if (roadmap.workspace_id !== req.user.workspace_id) return null;
  return roadmap;
}

// GET /api/snapshots - List snapshots for a roadmap
router.get("/", async (req, res) => {
  try {
    const { roadmap_id } = req.query;
    if (!roadmap_id) {
      return res.status(400).json({ error: "roadmap_id query parameter is required" });
    }

    // Verify roadmap belongs to user's workspace
    if (!await verifyRoadmapWorkspace(roadmap_id, req)) {
      return res.status(403).json({ error: "Access denied" });
    }

    const { rows: snapshots } = await db.query(
      `SELECT s.id, s.roadmap_id, s.name, s.created_at, s.created_by, u.name as creator_name
       FROM snapshots s
       LEFT JOIN users u ON u.id = s.created_by
       WHERE s.roadmap_id = $1
       ORDER BY s.created_at DESC`,
      [roadmap_id]
    );

    res.json(snapshots);
  } catch (err) {
    res.status(500).json({ error: safeError(err) });
  }
});

// GET /api/snapshots/:id - Get a single snapshot with data
router.get("/:id", async (req, res) => {
  try {
    const { rows } = await db.query("SELECT * FROM snapshots WHERE id = $1", [req.params.id]);
    const snapshot = rows[0];
    if (!snapshot) {
      return res.status(404).json({ error: "Snapshot not found" });
    }

    // Verify via roadmap workspace
    if (!await verifyRoadmapWorkspace(snapshot.roadmap_id, req)) {
      return res.status(403).json({ error: "Access denied" });
    }

    res.json({
      ...snapshot,
      data: snapshot.data ? JSON.parse(snapshot.data) : null,
    });
  } catch (err) {
    res.status(500).json({ error: safeError(err) });
  }
});

// POST /api/snapshots - Create snapshot (captures current roadmap state)
router.post("/", async (req, res) => {
  try {
    const { roadmap_id, name } = req.body;
    if (!roadmap_id || !name) {
      return res.status(400).json({ error: "roadmap_id and name are required" });
    }

    const nameErr = validateLength(name, "Name", MAX_NAME_LENGTH);
    if (nameErr) return res.status(400).json({ error: nameErr });

    // Capture current roadmap state
    const roadmap = await verifyRoadmapWorkspace(roadmap_id, req);
    if (!roadmap) {
      return res.status(403).json({ error: "Access denied" });
    }

    const { rows: rowsData } = await db.query(
      "SELECT * FROM roadmap_rows WHERE roadmap_id = $1 ORDER BY sort_order",
      [roadmap_id]
    );

    const { rows: cards } = await db.query(
      "SELECT * FROM cards WHERE roadmap_id = $1 ORDER BY sort_order",
      [roadmap_id]
    );

    // Get tags for all cards
    const cardsWithTags = [];
    for (const card of cards) {
      const { rows: tags } = await db.query(
        `SELECT t.* FROM tags t
         JOIN card_tags ct ON ct.tag_id = t.id
         WHERE ct.card_id = $1`,
        [card.id]
      );
      cardsWithTags.push({ ...card, tags });
    }

    // Get dependencies
    const cardIds = cards.map((c) => c.id);
    let dependencies = [];
    if (cardIds.length > 0) {
      const fromPlaceholders = cardIds.map((_, i) => `$${i + 1}`).join(",");
      const toPlaceholders = cardIds.map((_, i) => `$${i + 1 + cardIds.length}`).join(",");
      const { rows: depRows } = await db.query(
        `SELECT * FROM card_dependencies WHERE from_card_id IN (${fromPlaceholders}) OR to_card_id IN (${toPlaceholders})`,
        [...cardIds, ...cardIds]
      );
      dependencies = depRows;
    }

    const snapshotData = {
      roadmap,
      rows: rowsData,
      cards: cardsWithTags,
      dependencies,
      captured_at: new Date().toISOString(),
    };

    const id = uuidv4();
    await db.query(
      "INSERT INTO snapshots (id, roadmap_id, name, data, created_by) VALUES ($1, $2, $3, $4, $5)",
      [id, roadmap_id, sanitizeHtml(name), JSON.stringify(snapshotData), req.user.id]
    );

    const { rows: snapshotRows } = await db.query("SELECT * FROM snapshots WHERE id = $1", [id]);
    const snapshot = snapshotRows[0];
    res.status(201).json({
      ...snapshot,
      data: snapshotData,
    });
  } catch (err) {
    res.status(500).json({ error: safeError(err) });
  }
});

// POST /api/snapshots/:id/restore - Restore a snapshot
router.post("/:id/restore", async (req, res) => {
  try {
    const { rows } = await db.query("SELECT * FROM snapshots WHERE id = $1", [req.params.id]);
    const snapshot = rows[0];
    if (!snapshot) {
      return res.status(404).json({ error: "Snapshot not found" });
    }

    // Verify via roadmap workspace
    if (!await verifyRoadmapWorkspace(snapshot.roadmap_id, req)) {
      return res.status(403).json({ error: "Access denied" });
    }

    const data = JSON.parse(snapshot.data);
    if (!data || !data.roadmap) {
      return res.status(400).json({ error: "Snapshot data is invalid or empty" });
    }

    const roadmapId = data.roadmap.id;

    // Delete existing rows and cards for this roadmap (cascade deletes related records)
    await db.query("DELETE FROM cards WHERE roadmap_id = $1", [roadmapId]);
    await db.query("DELETE FROM roadmap_rows WHERE roadmap_id = $1", [roadmapId]);

    // Update roadmap fields
    await db.query(
      "UPDATE roadmaps SET name = $1, status = $2, time_start = $3, time_end = $4, subdivision_type = $5 WHERE id = $6",
      [
        data.roadmap.name, data.roadmap.status,
        data.roadmap.time_start, data.roadmap.time_end,
        data.roadmap.subdivision_type, roadmapId
      ]
    );

    // Restore rows
    for (const row of data.rows || []) {
      await db.query(
        "INSERT INTO roadmap_rows (id, roadmap_id, name, color, sort_order) VALUES ($1, $2, $3, $4, $5)",
        [row.id, roadmapId, row.name, row.color, row.sort_order]
      );
    }

    // Restore cards
    for (const card of data.cards || []) {
      await db.query(
        `INSERT INTO cards (id, roadmap_id, row_id, name, description, status, team_id, effort, headcount, start_sprint, duration_sprints, sort_order, created_at, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
        [
          card.id, roadmapId, card.row_id, card.name, card.description,
          card.status, card.team_id, card.effort, card.headcount,
          card.start_sprint, card.duration_sprints, card.sort_order,
          card.created_at, card.created_by
        ]
      );

      // Restore card tags
      if (card.tags && card.tags.length > 0) {
        for (const tag of card.tags) {
          await db.query(
            "INSERT INTO card_tags (id, card_id, tag_id) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING",
            [uuidv4(), card.id, tag.id]
          );
        }
      }
    }

    // Restore dependencies
    for (const dep of data.dependencies || []) {
      await db.query(
        "INSERT INTO card_dependencies (id, from_card_id, to_card_id, type) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING",
        [dep.id, dep.from_card_id, dep.to_card_id, dep.type]
      );
    }

    res.json({ message: "Snapshot restored successfully", snapshot_id: snapshot.id, roadmap_id: data.roadmap.id });
  } catch (err) {
    res.status(500).json({ error: safeError(err) });
  }
});

// DELETE /api/snapshots/:id - Delete snapshot
router.delete("/:id", async (req, res) => {
  try {
    const { rows } = await db.query("SELECT * FROM snapshots WHERE id = $1", [req.params.id]);
    const snapshot = rows[0];
    if (!snapshot) {
      return res.status(404).json({ error: "Snapshot not found" });
    }

    // Verify via roadmap workspace
    if (!await verifyRoadmapWorkspace(snapshot.roadmap_id, req)) {
      return res.status(403).json({ error: "Access denied" });
    }

    await db.query("DELETE FROM snapshots WHERE id = $1", [req.params.id]);
    res.status(204).end();
  } catch (err) {
    res.status(500).json({ error: safeError(err) });
  }
});

module.exports = router;
