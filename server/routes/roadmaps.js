const express = require("express");
const router = express.Router();
const { v4: uuidv4 } = require("uuid");
const db = require("../models/db");

// =====================
// ROADMAP CRUD
// =====================

// GET /api/roadmaps - List all roadmaps (optionally filtered by workspace_id query param)
router.get("/", (req, res) => {
  try {
    const { workspace_id } = req.query;
    let roadmaps;
    if (workspace_id) {
      roadmaps = db.prepare(
        "SELECT * FROM roadmaps WHERE workspace_id = ? ORDER BY created_at DESC"
      ).all(workspace_id);
    } else {
      roadmaps = db.prepare("SELECT * FROM roadmaps ORDER BY created_at DESC").all();
    }
    res.json(roadmaps);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/roadmaps - Create roadmap
router.post("/", (req, res) => {
  try {
    const { workspace_id, name, status, time_start, time_end, subdivision_type, created_by } = req.body;
    if (!workspace_id || !name) {
      return res.status(400).json({ error: "workspace_id and name are required" });
    }

    const id = uuidv4();
    db.prepare(
      `INSERT INTO roadmaps (id, workspace_id, name, status, time_start, time_end, subdivision_type, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(id, workspace_id, name, status || "draft", time_start || null, time_end || null, subdivision_type || null, created_by || null);

    // Auto-create a default row so the roadmap is immediately usable
    const rowId = uuidv4();
    db.prepare(
      "INSERT INTO roadmap_rows (id, roadmap_id, name, color, sort_order) VALUES (?, ?, ?, ?, ?)"
    ).run(rowId, id, "Features", null, 0);

    // Auto-generate 12 default two-week sprints starting from the 1st of current month
    const now = new Date();
    const startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    const sprintInsert = db.prepare(
      "INSERT INTO sprints (id, roadmap_id, name, start_date, end_date, sort_order) VALUES (?, ?, ?, ?, ?, ?)"
    );
    for (let i = 0; i < 12; i++) {
      const sStart = new Date(startDate);
      sStart.setDate(sStart.getDate() + i * 14);
      const sEnd = new Date(sStart);
      sEnd.setDate(sEnd.getDate() + 13);
      sprintInsert.run(
        uuidv4(), id, `Sprint ${i + 1}`,
        sStart.toISOString().split("T")[0],
        sEnd.toISOString().split("T")[0],
        i
      );
    }

    const roadmap = db.prepare("SELECT * FROM roadmaps WHERE id = ?").get(id);
    res.status(201).json(roadmap);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/roadmaps/:id - Get roadmap with rows, cards, and sprints
router.get("/:id", (req, res) => {
  try {
    const roadmap = db.prepare("SELECT * FROM roadmaps WHERE id = ?").get(req.params.id);
    if (!roadmap) {
      return res.status(404).json({ error: "Roadmap not found" });
    }

    const rows = db.prepare(
      "SELECT * FROM roadmap_rows WHERE roadmap_id = ? ORDER BY sort_order ASC"
    ).all(req.params.id);

    const cards = db.prepare(
      "SELECT * FROM cards WHERE roadmap_id = ? ORDER BY sort_order ASC"
    ).all(req.params.id);

    const sprints = db.prepare(
      "SELECT * FROM sprints WHERE roadmap_id = ? ORDER BY sort_order ASC"
    ).all(req.params.id);

    // Attach tags to each card
    const cardsWithTags = cards.map((card) => {
      const tags = db.prepare(
        `SELECT t.* FROM tags t
         JOIN card_tags ct ON ct.tag_id = t.id
         WHERE ct.card_id = ?`
      ).all(card.id);
      return { ...card, tags };
    });

    // Attach cards to their rows
    const rowsWithCards = rows.map((row) => ({
      ...row,
      cards: cardsWithTags.filter((c) => c.row_id === row.id),
    }));

    // Cards without a row (unassigned)
    const unassignedCards = cardsWithTags.filter((c) => !c.row_id);

    res.json({
      ...roadmap,
      rows: rowsWithCards,
      unassigned_cards: unassignedCards,
      sprints,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/roadmaps/:id - Update roadmap
router.patch("/:id", (req, res) => {
  try {
    const roadmap = db.prepare("SELECT * FROM roadmaps WHERE id = ?").get(req.params.id);
    if (!roadmap) {
      return res.status(404).json({ error: "Roadmap not found" });
    }

    const allowed = ["name", "status", "time_start", "time_end", "subdivision_type"];
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
      db.prepare(`UPDATE roadmaps SET ${sets.join(", ")} WHERE id = ?`).run(...values);
    }

    const updated = db.prepare("SELECT * FROM roadmaps WHERE id = ?").get(req.params.id);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/roadmaps/:id - Delete roadmap
router.delete("/:id", (req, res) => {
  try {
    const roadmap = db.prepare("SELECT * FROM roadmaps WHERE id = ?").get(req.params.id);
    if (!roadmap) {
      return res.status(404).json({ error: "Roadmap not found" });
    }
    db.prepare("DELETE FROM roadmaps WHERE id = ?").run(req.params.id);
    res.status(204).end();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// =====================
// SPRINTS (nested under roadmap)
// =====================

// GET /api/roadmaps/:id/sprints - List sprints for a roadmap
router.get("/:id/sprints", (req, res) => {
  try {
    const sprints = db.prepare(
      "SELECT * FROM sprints WHERE roadmap_id = ? ORDER BY sort_order ASC"
    ).all(req.params.id);
    res.json(sprints);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/roadmaps/:id/sprints - Create a single sprint
router.post("/:id/sprints", (req, res) => {
  try {
    const { name, start_date, end_date, goal, status } = req.body;
    if (!name || !start_date || !end_date) {
      return res.status(400).json({ error: "name, start_date, and end_date are required" });
    }

    const maxOrder = db.prepare(
      "SELECT COALESCE(MAX(sort_order), -1) + 1 as next_order FROM sprints WHERE roadmap_id = ?"
    ).get(req.params.id);

    const id = uuidv4();
    db.prepare(
      "INSERT INTO sprints (id, roadmap_id, name, start_date, end_date, sort_order, goal, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    ).run(id, req.params.id, name, start_date, end_date, maxOrder.next_order, goal || null, status || "planned");

    // Re-sort all sprints chronologically
    const all = db.prepare(
      "SELECT * FROM sprints WHERE roadmap_id = ? ORDER BY start_date ASC"
    ).all(req.params.id);
    const updateStmt = db.prepare("UPDATE sprints SET sort_order = ? WHERE id = ?");
    all.forEach((s, i) => updateStmt.run(i, s.id));

    res.status(201).json(
      db.prepare("SELECT * FROM sprints WHERE id = ?").get(id)
    );
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/roadmaps/:id/sprints/bulk-generate - Generate multiple sprints
router.post("/:id/sprints/bulk-generate", (req, res) => {
  try {
    const { duration_days, start_date, count, name_pattern } = req.body;
    if (!start_date || !count || !duration_days) {
      return res.status(400).json({ error: "start_date, count, and duration_days are required" });
    }

    const pattern = name_pattern || "Sprint {n}";
    const existingCount = db.prepare(
      "SELECT COUNT(*) as cnt FROM sprints WHERE roadmap_id = ?"
    ).get(req.params.id).cnt;

    const insertStmt = db.prepare(
      "INSERT INTO sprints (id, roadmap_id, name, start_date, end_date, sort_order) VALUES (?, ?, ?, ?, ?, ?)"
    );

    let current = new Date(start_date);
    const created = [];
    for (let i = 0; i < count; i++) {
      const sStart = new Date(current);
      const sEnd = new Date(current);
      sEnd.setDate(sEnd.getDate() + duration_days - 1);

      const sprintId = uuidv4();
      const name = pattern.replace("{n}", existingCount + i + 1);
      insertStmt.run(
        sprintId, req.params.id, name,
        sStart.toISOString().split("T")[0],
        sEnd.toISOString().split("T")[0],
        existingCount + i
      );
      created.push(db.prepare("SELECT * FROM sprints WHERE id = ?").get(sprintId));

      // Next sprint starts the day after this one ends
      current = new Date(sEnd);
      current.setDate(current.getDate() + 1);
    }

    // Re-sort all sprints chronologically
    const all = db.prepare(
      "SELECT * FROM sprints WHERE roadmap_id = ? ORDER BY start_date ASC"
    ).all(req.params.id);
    const updateStmt = db.prepare("UPDATE sprints SET sort_order = ? WHERE id = ?");
    all.forEach((s, i) => updateStmt.run(i, s.id));

    res.status(201).json(
      db.prepare("SELECT * FROM sprints WHERE roadmap_id = ? ORDER BY sort_order ASC").all(req.params.id)
    );
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// =====================
// ROADMAP ROW CRUD
// =====================

// GET /api/roadmaps/:id/rows - List rows for a roadmap
router.get("/:id/rows", (req, res) => {
  try {
    const rows = db.prepare(
      "SELECT * FROM roadmap_rows WHERE roadmap_id = ? ORDER BY sort_order ASC"
    ).all(req.params.id);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/roadmaps/:id/rows - Create row
router.post("/:id/rows", (req, res) => {
  try {
    const { name, color, sort_order } = req.body;
    if (!name) {
      return res.status(400).json({ error: "name is required" });
    }

    const id = uuidv4();
    const maxOrder = db.prepare(
      "SELECT COALESCE(MAX(sort_order), -1) + 1 as next_order FROM roadmap_rows WHERE roadmap_id = ?"
    ).get(req.params.id);

    db.prepare(
      "INSERT INTO roadmap_rows (id, roadmap_id, name, color, sort_order) VALUES (?, ?, ?, ?, ?)"
    ).run(id, req.params.id, name, color || null, sort_order !== undefined ? sort_order : maxOrder.next_order);

    const row = db.prepare("SELECT * FROM roadmap_rows WHERE id = ?").get(id);
    res.status(201).json(row);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/roadmaps/:roadmapId/rows/:rowId - Update row
router.patch("/:roadmapId/rows/:rowId", (req, res) => {
  try {
    const row = db.prepare("SELECT * FROM roadmap_rows WHERE id = ?").get(req.params.rowId);
    if (!row) {
      return res.status(404).json({ error: "Row not found" });
    }

    const allowed = ["name", "color", "sort_order"];
    const sets = [];
    const values = [];
    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        sets.push(`${key} = ?`);
        values.push(req.body[key]);
      }
    }

    if (sets.length > 0) {
      values.push(req.params.rowId);
      db.prepare(`UPDATE roadmap_rows SET ${sets.join(", ")} WHERE id = ?`).run(...values);
    }

    const updated = db.prepare("SELECT * FROM roadmap_rows WHERE id = ?").get(req.params.rowId);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/roadmaps/:roadmapId/rows/:rowId - Delete row
router.delete("/:roadmapId/rows/:rowId", (req, res) => {
  try {
    const row = db.prepare("SELECT * FROM roadmap_rows WHERE id = ?").get(req.params.rowId);
    if (!row) {
      return res.status(404).json({ error: "Row not found" });
    }
    // Cards in this row will have row_id set to NULL (ON DELETE SET NULL)
    db.prepare("DELETE FROM roadmap_rows WHERE id = ?").run(req.params.rowId);
    res.status(204).end();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/roadmaps/:id/rows/reorder - Reorder rows
router.patch("/:id/rows/reorder", (req, res) => {
  try {
    const { order } = req.body;
    if (!Array.isArray(order)) {
      return res.status(400).json({ error: "order must be an array of row IDs" });
    }

    const updateStmt = db.prepare("UPDATE roadmap_rows SET sort_order = ? WHERE id = ? AND roadmap_id = ?");
    const reorder = db.transaction(() => {
      for (let i = 0; i < order.length; i++) {
        updateStmt.run(i, order[i], req.params.id);
      }
    });
    reorder();

    const rows = db.prepare(
      "SELECT * FROM roadmap_rows WHERE roadmap_id = ? ORDER BY sort_order ASC"
    ).all(req.params.id);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// =====================
// CARDS NESTED UNDER ROADMAPS
// =====================

// GET /api/roadmaps/:id/cards - List all cards for a roadmap
router.get("/:id/cards", (req, res) => {
  try {
    const cards = db.prepare(
      "SELECT * FROM cards WHERE roadmap_id = ? ORDER BY sort_order ASC"
    ).all(req.params.id);

    const cardsWithTags = cards.map((card) => {
      const tags = db.prepare(
        `SELECT t.* FROM tags t
         JOIN card_tags ct ON ct.tag_id = t.id
         WHERE ct.card_id = ?`
      ).all(card.id);
      return { ...card, tags };
    });

    res.json(cardsWithTags);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/roadmaps/:id/cards - Create card
router.post("/:id/cards", (req, res) => {
  try {
    const {
      row_id, name, description, status, team_id, effort,
      headcount, start_sprint, duration_sprints, sort_order, created_by,
      start_sprint_id, end_sprint_id
    } = req.body;

    if (!name) {
      return res.status(400).json({ error: "name is required" });
    }

    const id = uuidv4();
    const maxOrder = db.prepare(
      "SELECT COALESCE(MAX(sort_order), -1) + 1 as next_order FROM cards WHERE roadmap_id = ?"
    ).get(req.params.id);

    db.prepare(
      `INSERT INTO cards (id, roadmap_id, row_id, name, description, status, team_id, effort, headcount, start_sprint, duration_sprints, sort_order, created_by, start_sprint_id, end_sprint_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id, req.params.id, row_id || null, name, description || null,
      status || "placeholder", team_id || null, effort || null,
      headcount || 1, start_sprint || null, duration_sprints || 1,
      sort_order !== undefined ? sort_order : maxOrder.next_order,
      created_by || null, start_sprint_id || null, end_sprint_id || null
    );

    const card = db.prepare("SELECT * FROM cards WHERE id = ?").get(id);
    res.status(201).json(card);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
