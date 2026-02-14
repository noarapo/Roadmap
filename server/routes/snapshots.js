const express = require("express");
const router = express.Router();
const { v4: uuidv4 } = require("uuid");
const db = require("../models/db");

// GET /api/snapshots - List snapshots for a roadmap
router.get("/", (req, res) => {
  try {
    const { roadmap_id } = req.query;
    if (!roadmap_id) {
      return res.status(400).json({ error: "roadmap_id query parameter is required" });
    }

    const snapshots = db.prepare(
      `SELECT s.id, s.roadmap_id, s.name, s.created_at, s.created_by, u.name as creator_name
       FROM snapshots s
       LEFT JOIN users u ON u.id = s.created_by
       WHERE s.roadmap_id = ?
       ORDER BY s.created_at DESC`
    ).all(roadmap_id);

    res.json(snapshots);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/snapshots/:id - Get a single snapshot with data
router.get("/:id", (req, res) => {
  try {
    const snapshot = db.prepare("SELECT * FROM snapshots WHERE id = ?").get(req.params.id);
    if (!snapshot) {
      return res.status(404).json({ error: "Snapshot not found" });
    }

    res.json({
      ...snapshot,
      data: snapshot.data ? JSON.parse(snapshot.data) : null,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/snapshots - Create snapshot (captures current roadmap state)
router.post("/", (req, res) => {
  try {
    const { roadmap_id, name, created_by } = req.body;
    if (!roadmap_id || !name) {
      return res.status(400).json({ error: "roadmap_id and name are required" });
    }

    // Capture current roadmap state
    const roadmap = db.prepare("SELECT * FROM roadmaps WHERE id = ?").get(roadmap_id);
    if (!roadmap) {
      return res.status(404).json({ error: "Roadmap not found" });
    }

    const rows = db.prepare(
      "SELECT * FROM roadmap_rows WHERE roadmap_id = ? ORDER BY sort_order"
    ).all(roadmap_id);

    const cards = db.prepare(
      "SELECT * FROM cards WHERE roadmap_id = ? ORDER BY sort_order"
    ).all(roadmap_id);

    // Get tags for all cards
    const cardsWithTags = cards.map((card) => {
      const tags = db.prepare(
        `SELECT t.* FROM tags t
         JOIN card_tags ct ON ct.tag_id = t.id
         WHERE ct.card_id = ?`
      ).all(card.id);
      return { ...card, tags };
    });

    // Get dependencies
    const cardIds = cards.map((c) => c.id);
    let dependencies = [];
    if (cardIds.length > 0) {
      dependencies = db.prepare(
        `SELECT * FROM card_dependencies WHERE from_card_id IN (${cardIds.map(() => "?").join(",")}) OR to_card_id IN (${cardIds.map(() => "?").join(",")})`
      ).all(...cardIds, ...cardIds);
    }

    const snapshotData = {
      roadmap,
      rows,
      cards: cardsWithTags,
      dependencies,
      captured_at: new Date().toISOString(),
    };

    const id = uuidv4();
    db.prepare(
      "INSERT INTO snapshots (id, roadmap_id, name, data, created_by) VALUES (?, ?, ?, ?, ?)"
    ).run(id, roadmap_id, name, JSON.stringify(snapshotData), created_by || null);

    const snapshot = db.prepare("SELECT * FROM snapshots WHERE id = ?").get(id);
    res.status(201).json({
      ...snapshot,
      data: snapshotData,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/snapshots/:id/restore - Restore a snapshot
router.post("/:id/restore", (req, res) => {
  try {
    const snapshot = db.prepare("SELECT * FROM snapshots WHERE id = ?").get(req.params.id);
    if (!snapshot) {
      return res.status(404).json({ error: "Snapshot not found" });
    }

    const data = JSON.parse(snapshot.data);
    if (!data || !data.roadmap) {
      return res.status(400).json({ error: "Snapshot data is invalid or empty" });
    }

    const restore = db.transaction(() => {
      const roadmapId = data.roadmap.id;

      // Delete existing rows and cards for this roadmap (cascade deletes related records)
      db.prepare("DELETE FROM cards WHERE roadmap_id = ?").run(roadmapId);
      db.prepare("DELETE FROM roadmap_rows WHERE roadmap_id = ?").run(roadmapId);

      // Update roadmap fields
      db.prepare(
        "UPDATE roadmaps SET name = ?, status = ?, time_start = ?, time_end = ?, subdivision_type = ? WHERE id = ?"
      ).run(
        data.roadmap.name, data.roadmap.status,
        data.roadmap.time_start, data.roadmap.time_end,
        data.roadmap.subdivision_type, roadmapId
      );

      // Restore rows
      const insertRow = db.prepare(
        "INSERT INTO roadmap_rows (id, roadmap_id, name, color, sort_order) VALUES (?, ?, ?, ?, ?)"
      );
      for (const row of data.rows || []) {
        insertRow.run(row.id, roadmapId, row.name, row.color, row.sort_order);
      }

      // Restore cards
      const insertCard = db.prepare(
        `INSERT INTO cards (id, roadmap_id, row_id, name, description, status, team_id, effort, headcount, start_sprint, duration_sprints, sort_order, created_at, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );
      for (const card of data.cards || []) {
        insertCard.run(
          card.id, roadmapId, card.row_id, card.name, card.description,
          card.status, card.team_id, card.effort, card.headcount,
          card.start_sprint, card.duration_sprints, card.sort_order,
          card.created_at, card.created_by
        );

        // Restore card tags
        if (card.tags && card.tags.length > 0) {
          const insertCardTag = db.prepare(
            "INSERT OR IGNORE INTO card_tags (id, card_id, tag_id) VALUES (?, ?, ?)"
          );
          for (const tag of card.tags) {
            insertCardTag.run(uuidv4(), card.id, tag.id);
          }
        }
      }

      // Restore dependencies
      const insertDep = db.prepare(
        "INSERT OR IGNORE INTO card_dependencies (id, from_card_id, to_card_id, type) VALUES (?, ?, ?, ?)"
      );
      for (const dep of data.dependencies || []) {
        insertDep.run(dep.id, dep.from_card_id, dep.to_card_id, dep.type);
      }
    });

    restore();

    res.json({ message: "Snapshot restored successfully", snapshot_id: snapshot.id, roadmap_id: data.roadmap.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/snapshots/:id - Delete snapshot
router.delete("/:id", (req, res) => {
  try {
    const snapshot = db.prepare("SELECT * FROM snapshots WHERE id = ?").get(req.params.id);
    if (!snapshot) {
      return res.status(404).json({ error: "Snapshot not found" });
    }
    db.prepare("DELETE FROM snapshots WHERE id = ?").run(req.params.id);
    res.status(204).end();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
