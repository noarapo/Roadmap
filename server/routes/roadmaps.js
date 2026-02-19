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

// Helper: create a default roadmap with sprints, row, and sample cards
async function createDefaultRoadmap(workspaceId, userId, roadmapName) {
  const id = uuidv4();
  await db.query(
    `INSERT INTO roadmaps (id, workspace_id, name, status, created_by)
     VALUES ($1, $2, $3, $4, $5)`,
    [id, workspaceId, sanitizeHtml(roadmapName), "draft", userId]
  );

  // Create default row
  const rowId = uuidv4();
  await db.query(
    "INSERT INTO roadmap_rows (id, roadmap_id, name, color, sort_order) VALUES ($1, $2, $3, $4, $5)",
    [rowId, id, "Features", null, 0]
  );

  // Generate 12 two-week sprints starting from 1st of current month
  const now = new Date();
  const startDate = new Date(now.getFullYear(), now.getMonth(), 1);
  const sprintIds = [];
  for (let i = 0; i < 12; i++) {
    const sStart = new Date(startDate);
    sStart.setDate(sStart.getDate() + i * 14);
    const sEnd = new Date(sStart);
    sEnd.setDate(sEnd.getDate() + 13);
    const sprintId = uuidv4();
    sprintIds.push(sprintId);
    await db.query(
      "INSERT INTO sprints (id, roadmap_id, name, start_date, end_date, sort_order) VALUES ($1, $2, $3, $4, $5, $6)",
      [sprintId, id, `Sprint ${i + 1}`, sStart.toISOString().split("T")[0], sEnd.toISOString().split("T")[0], i]
    );
  }

  // Create sample teams
  const appTeamId = uuidv4();
  const dataTeamId = uuidv4();
  await db.query(
    "INSERT INTO teams (id, workspace_id, name, color) VALUES ($1, $2, $3, $4)",
    [appTeamId, workspaceId, "App", "#2D6A5E"]
  );
  await db.query(
    "INSERT INTO teams (id, workspace_id, name, color) VALUES ($1, $2, $3, $4)",
    [dataTeamId, workspaceId, "Data", "#4F87C5"]
  );

  // Create sample tags
  const tagDefs = [
    { name: "Quick Win", color: "#38A169" },
    { name: "High Impact", color: "#E53E3E" },
    { name: "Foundation", color: "#4F87C5" },
  ];
  const tagIds = {};
  for (const t of tagDefs) {
    const tagId = uuidv4();
    tagIds[t.name] = tagId;
    await db.query(
      "INSERT INTO tags (id, workspace_id, name, color) VALUES ($1, $2, $3, $4)",
      [tagId, workspaceId, t.name, t.color]
    );
  }

  // Add sample feature cards with teams, effort, statuses, and tags
  const sampleCards = [
    { name: "User authentication", description: "Login, signup, and session management for secure user access.", sprint: 0, sort: 0, status: "In Progress", teams: [{ id: appTeamId, effort: 5 }, { id: dataTeamId, effort: 2 }], tags: ["Foundation"] },
    { name: "Dashboard redesign", description: "Modernize the main dashboard with improved layout and data visualizations.", sprint: 1, sort: 0, status: "Planned", teams: [{ id: appTeamId, effort: 5 }, { id: dataTeamId, effort: 3 }], tags: ["High Impact"] },
    { name: "API integration", description: "Connect to third-party services and build out the REST API layer.", sprint: 2, sort: 0, status: "In Progress", teams: [{ id: appTeamId, effort: 5 }], tags: ["Foundation"] },
    { name: "Mobile app v2", description: "Rebuild the mobile experience with better performance and offline support.", sprint: 4, sort: 0, status: "Planned", teams: [{ id: appTeamId, effort: 2 }, { id: dataTeamId, effort: 1 }], tags: ["Quick Win", "High Impact"] },
  ];

  for (const card of sampleCards) {
    const cardId = uuidv4();
    await db.query(
      `INSERT INTO cards (id, roadmap_id, row_id, start_sprint_id, name, description, status, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [cardId, id, rowId, sprintIds[card.sprint], card.name, card.description, card.status, card.sort]
    );
    // Assign teams with effort
    for (const t of card.teams) {
      await db.query(
        "INSERT INTO card_teams (id, card_id, team_id, effort) VALUES ($1, $2, $3, $4)",
        [uuidv4(), cardId, t.id, t.effort]
      );
    }
    // Assign tags
    for (const tagName of card.tags) {
      await db.query(
        "INSERT INTO card_tags (id, card_id, tag_id) VALUES ($1, $2, $3)",
        [uuidv4(), cardId, tagIds[tagName]]
      );
    }
  }

  // Update user's last_roadmap_id
  await db.query("UPDATE users SET last_roadmap_id = $1 WHERE id = $2", [id, userId]);

  return id;
}

// All routes require authentication
router.use(authMiddleware);

// =====================
// ROADMAP CRUD
// =====================

// GET /api/roadmaps - List roadmaps for the user's workspace
router.get("/", async (req, res) => {
  try {
    // Always scope to user's workspace
    const workspace_id = req.user.workspace_id;
    const { rows: roadmaps } = await db.query(
      "SELECT * FROM roadmaps WHERE workspace_id = $1 ORDER BY created_at DESC",
      [workspace_id]
    );
    res.json(roadmaps);
  } catch (err) {
    res.status(500).json({ error: safeError(err) });
  }
});

// POST /api/roadmaps - Create roadmap
router.post("/", async (req, res) => {
  try {
    const { name, status, time_start, time_end, subdivision_type } = req.body;
    const workspace_id = req.user.workspace_id;

    if (!name) {
      return res.status(400).json({ error: "name is required" });
    }

    const nameErr = validateLength(name, "Name", MAX_NAME_LENGTH);
    if (nameErr) return res.status(400).json({ error: nameErr });

    const id = uuidv4();
    await db.query(
      `INSERT INTO roadmaps (id, workspace_id, name, status, time_start, time_end, subdivision_type, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [id, workspace_id, sanitizeHtml(name), status || "draft", time_start || null, time_end || null, subdivision_type || null, req.user.id]
    );

    // Auto-create a default row so the roadmap is immediately usable
    const rowId = uuidv4();
    await db.query(
      "INSERT INTO roadmap_rows (id, roadmap_id, name, color, sort_order) VALUES ($1, $2, $3, $4, $5)",
      [rowId, id, "Features", null, 0]
    );

    // Auto-generate 12 default two-week sprints starting from the 1st of current month
    const now = new Date();
    const startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    for (let i = 0; i < 12; i++) {
      const sStart = new Date(startDate);
      sStart.setDate(sStart.getDate() + i * 14);
      const sEnd = new Date(sStart);
      sEnd.setDate(sEnd.getDate() + 13);
      await db.query(
        "INSERT INTO sprints (id, roadmap_id, name, start_date, end_date, sort_order) VALUES ($1, $2, $3, $4, $5, $6)",
        [uuidv4(), id, `Sprint ${i + 1}`, sStart.toISOString().split("T")[0], sEnd.toISOString().split("T")[0], i]
      );
    }

    const { rows } = await db.query("SELECT * FROM roadmaps WHERE id = $1", [id]);
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: safeError(err) });
  }
});

// GET /api/roadmaps/:id - Get roadmap with rows, cards, and sprints
router.get("/:id", async (req, res) => {
  try {
    const { rows: roadmapRows } = await db.query("SELECT * FROM roadmaps WHERE id = $1", [req.params.id]);
    const roadmap = roadmapRows[0];
    if (!roadmap) {
      return res.status(404).json({ error: "Roadmap not found" });
    }

    // Workspace isolation check
    if (roadmap.workspace_id !== req.user.workspace_id) {
      return res.status(403).json({ error: "Access denied" });
    }

    const { rows: rowsList } = await db.query(
      "SELECT * FROM roadmap_rows WHERE roadmap_id = $1 ORDER BY sort_order ASC",
      [req.params.id]
    );

    const { rows: cards } = await db.query(
      "SELECT * FROM cards WHERE roadmap_id = $1 ORDER BY sort_order ASC",
      [req.params.id]
    );

    const { rows: sprints } = await db.query(
      "SELECT * FROM sprints WHERE roadmap_id = $1 ORDER BY sort_order ASC",
      [req.params.id]
    );

    // Attach tags to each card
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

    // Attach cards to their rows
    const rowsWithCards = rowsList.map((row) => ({
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
    res.status(500).json({ error: safeError(err) });
  }
});

// PATCH /api/roadmaps/:id - Update roadmap
router.patch("/:id", async (req, res) => {
  try {
    const { rows: roadmapRows } = await db.query("SELECT * FROM roadmaps WHERE id = $1", [req.params.id]);
    const roadmap = roadmapRows[0];
    if (!roadmap) {
      return res.status(404).json({ error: "Roadmap not found" });
    }

    if (roadmap.workspace_id !== req.user.workspace_id) {
      return res.status(403).json({ error: "Access denied" });
    }

    // Validate name if provided
    if (req.body.name !== undefined) {
      const nameErr = validateLength(req.body.name, "Name", MAX_NAME_LENGTH);
      if (nameErr) return res.status(400).json({ error: nameErr });
    }

    const allowed = ["name", "status", "time_start", "time_end", "subdivision_type"];
    const sets = [];
    const values = [];
    let paramIndex = 1;
    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        let val = req.body[key];
        if (key === "name") val = sanitizeHtml(val);
        sets.push(`${key} = $${paramIndex}`);
        values.push(val);
        paramIndex++;
      }
    }

    if (sets.length > 0) {
      values.push(req.params.id);
      await db.query(`UPDATE roadmaps SET ${sets.join(", ")} WHERE id = $${paramIndex}`, values);
    }

    const { rows: updatedRows } = await db.query("SELECT * FROM roadmaps WHERE id = $1", [req.params.id]);
    res.json(updatedRows[0]);
  } catch (err) {
    res.status(500).json({ error: safeError(err) });
  }
});

// DELETE /api/roadmaps/:id - Delete roadmap
router.delete("/:id", async (req, res) => {
  try {
    const { rows: roadmapRows } = await db.query("SELECT * FROM roadmaps WHERE id = $1", [req.params.id]);
    const roadmap = roadmapRows[0];
    if (!roadmap) {
      return res.status(404).json({ error: "Roadmap not found" });
    }

    if (roadmap.workspace_id !== req.user.workspace_id) {
      return res.status(403).json({ error: "Access denied" });
    }

    await db.query("DELETE FROM roadmaps WHERE id = $1", [req.params.id]);
    res.status(204).end();
  } catch (err) {
    res.status(500).json({ error: safeError(err) });
  }
});

// =====================
// SPRINTS (nested under roadmap)
// =====================

// Helper: verify roadmap belongs to user's workspace
async function verifyRoadmapAccess(req, res) {
  const { rows } = await db.query("SELECT * FROM roadmaps WHERE id = $1", [req.params.id]);
  const roadmap = rows[0];
  if (!roadmap) {
    res.status(404).json({ error: "Roadmap not found" });
    return null;
  }
  if (roadmap.workspace_id !== req.user.workspace_id) {
    res.status(403).json({ error: "Access denied" });
    return null;
  }
  return roadmap;
}

// GET /api/roadmaps/:id/sprints - List sprints for a roadmap
router.get("/:id/sprints", async (req, res) => {
  try {
    if (!(await verifyRoadmapAccess(req, res))) return;

    const { rows: sprints } = await db.query(
      "SELECT * FROM sprints WHERE roadmap_id = $1 ORDER BY sort_order ASC",
      [req.params.id]
    );
    res.json(sprints);
  } catch (err) {
    res.status(500).json({ error: safeError(err) });
  }
});

// POST /api/roadmaps/:id/sprints - Create a single sprint
router.post("/:id/sprints", async (req, res) => {
  try {
    if (!(await verifyRoadmapAccess(req, res))) return;

    const { name, start_date, end_date, goal, status } = req.body;
    if (!name || !start_date || !end_date) {
      return res.status(400).json({ error: "name, start_date, and end_date are required" });
    }

    const nameErr = validateLength(name, "Name", MAX_NAME_LENGTH);
    if (nameErr) return res.status(400).json({ error: nameErr });

    const { rows: maxOrderRows } = await db.query(
      "SELECT COALESCE(MAX(sort_order), -1) + 1 as next_order FROM sprints WHERE roadmap_id = $1",
      [req.params.id]
    );

    const id = uuidv4();
    await db.query(
      "INSERT INTO sprints (id, roadmap_id, name, start_date, end_date, sort_order, goal, status) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)",
      [id, req.params.id, sanitizeHtml(name), start_date, end_date, maxOrderRows[0].next_order, goal ? sanitizeHtml(goal) : null, status || "planned"]
    );

    // Re-sort all sprints chronologically
    const { rows: allSprints } = await db.query(
      "SELECT * FROM sprints WHERE roadmap_id = $1 ORDER BY start_date ASC",
      [req.params.id]
    );
    for (let i = 0; i < allSprints.length; i++) {
      await db.query("UPDATE sprints SET sort_order = $1 WHERE id = $2", [i, allSprints[i].id]);
    }

    const { rows: createdRows } = await db.query("SELECT * FROM sprints WHERE id = $1", [id]);
    res.status(201).json(createdRows[0]);
  } catch (err) {
    res.status(500).json({ error: safeError(err) });
  }
});

// POST /api/roadmaps/:id/sprints/bulk-generate - Generate multiple sprints
router.post("/:id/sprints/bulk-generate", async (req, res) => {
  try {
    if (!(await verifyRoadmapAccess(req, res))) return;

    const { duration_days, start_date, count, name_pattern } = req.body;
    if (!start_date || !count || !duration_days) {
      return res.status(400).json({ error: "start_date, count, and duration_days are required" });
    }

    const daysErr = validateNonNegativeNumber(duration_days, "duration_days");
    if (daysErr) return res.status(400).json({ error: daysErr });

    const countErr = validateNonNegativeNumber(count, "count");
    if (countErr) return res.status(400).json({ error: countErr });

    if (count > 52) {
      return res.status(400).json({ error: "count must be 52 or less" });
    }

    const pattern = name_pattern || "Sprint {n}";
    const { rows: countRows } = await db.query(
      "SELECT COUNT(*) as cnt FROM sprints WHERE roadmap_id = $1",
      [req.params.id]
    );
    const existingCount = parseInt(countRows[0].cnt, 10);

    let current = new Date(start_date);
    const created = [];
    for (let i = 0; i < count; i++) {
      const sStart = new Date(current);
      const sEnd = new Date(current);
      sEnd.setDate(sEnd.getDate() + duration_days - 1);

      const sprintId = uuidv4();
      const sprintName = pattern.replace("{n}", existingCount + i + 1);
      await db.query(
        "INSERT INTO sprints (id, roadmap_id, name, start_date, end_date, sort_order) VALUES ($1, $2, $3, $4, $5, $6)",
        [sprintId, req.params.id, sanitizeHtml(sprintName), sStart.toISOString().split("T")[0], sEnd.toISOString().split("T")[0], existingCount + i]
      );
      const { rows: sprintRows } = await db.query("SELECT * FROM sprints WHERE id = $1", [sprintId]);
      created.push(sprintRows[0]);

      // Next sprint starts the day after this one ends
      current = new Date(sEnd);
      current.setDate(current.getDate() + 1);
    }

    // Re-sort all sprints chronologically
    const { rows: allSprints } = await db.query(
      "SELECT * FROM sprints WHERE roadmap_id = $1 ORDER BY start_date ASC",
      [req.params.id]
    );
    for (let i = 0; i < allSprints.length; i++) {
      await db.query("UPDATE sprints SET sort_order = $1 WHERE id = $2", [i, allSprints[i].id]);
    }

    const { rows: finalSprints } = await db.query(
      "SELECT * FROM sprints WHERE roadmap_id = $1 ORDER BY sort_order ASC",
      [req.params.id]
    );
    res.status(201).json(finalSprints);
  } catch (err) {
    res.status(500).json({ error: safeError(err) });
  }
});

// =====================
// ROADMAP ROW CRUD
// =====================

// GET /api/roadmaps/:id/rows - List rows for a roadmap
router.get("/:id/rows", async (req, res) => {
  try {
    if (!(await verifyRoadmapAccess(req, res))) return;

    const { rows } = await db.query(
      "SELECT * FROM roadmap_rows WHERE roadmap_id = $1 ORDER BY sort_order ASC",
      [req.params.id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: safeError(err) });
  }
});

// POST /api/roadmaps/:id/rows - Create row
router.post("/:id/rows", async (req, res) => {
  try {
    if (!(await verifyRoadmapAccess(req, res))) return;

    const { name, color, sort_order } = req.body;
    if (!name) {
      return res.status(400).json({ error: "name is required" });
    }

    const nameErr = validateLength(name, "Name", MAX_NAME_LENGTH);
    if (nameErr) return res.status(400).json({ error: nameErr });

    const id = uuidv4();
    const { rows: maxOrderRows } = await db.query(
      "SELECT COALESCE(MAX(sort_order), -1) + 1 as next_order FROM roadmap_rows WHERE roadmap_id = $1",
      [req.params.id]
    );

    await db.query(
      "INSERT INTO roadmap_rows (id, roadmap_id, name, color, sort_order) VALUES ($1, $2, $3, $4, $5)",
      [id, req.params.id, sanitizeHtml(name), color || null, sort_order !== undefined ? sort_order : maxOrderRows[0].next_order]
    );

    const { rows } = await db.query("SELECT * FROM roadmap_rows WHERE id = $1", [id]);
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: safeError(err) });
  }
});

// PATCH /api/roadmaps/:roadmapId/rows/:rowId - Update row
router.patch("/:roadmapId/rows/:rowId", async (req, res) => {
  try {
    // Verify roadmap access using roadmapId param
    const { rows: roadmapRows } = await db.query("SELECT * FROM roadmaps WHERE id = $1", [req.params.roadmapId]);
    const roadmap = roadmapRows[0];
    if (!roadmap) return res.status(404).json({ error: "Roadmap not found" });
    if (roadmap.workspace_id !== req.user.workspace_id) return res.status(403).json({ error: "Access denied" });

    const { rows: rowRows } = await db.query("SELECT * FROM roadmap_rows WHERE id = $1", [req.params.rowId]);
    const row = rowRows[0];
    if (!row) {
      return res.status(404).json({ error: "Row not found" });
    }

    if (req.body.name !== undefined) {
      const nameErr = validateLength(req.body.name, "Name", MAX_NAME_LENGTH);
      if (nameErr) return res.status(400).json({ error: nameErr });
    }

    const allowed = ["name", "color", "sort_order"];
    const sets = [];
    const values = [];
    let paramIndex = 1;
    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        let val = req.body[key];
        if (key === "name") val = sanitizeHtml(val);
        sets.push(`${key} = $${paramIndex}`);
        values.push(val);
        paramIndex++;
      }
    }

    if (sets.length > 0) {
      values.push(req.params.rowId);
      await db.query(`UPDATE roadmap_rows SET ${sets.join(", ")} WHERE id = $${paramIndex}`, values);
    }

    const { rows: updatedRows } = await db.query("SELECT * FROM roadmap_rows WHERE id = $1", [req.params.rowId]);
    res.json(updatedRows[0]);
  } catch (err) {
    res.status(500).json({ error: safeError(err) });
  }
});

// DELETE /api/roadmaps/:roadmapId/rows/:rowId - Delete row
router.delete("/:roadmapId/rows/:rowId", async (req, res) => {
  try {
    const { rows: roadmapRows } = await db.query("SELECT * FROM roadmaps WHERE id = $1", [req.params.roadmapId]);
    const roadmap = roadmapRows[0];
    if (!roadmap) return res.status(404).json({ error: "Roadmap not found" });
    if (roadmap.workspace_id !== req.user.workspace_id) return res.status(403).json({ error: "Access denied" });

    const { rows: rowRows } = await db.query("SELECT * FROM roadmap_rows WHERE id = $1", [req.params.rowId]);
    const row = rowRows[0];
    if (!row) {
      return res.status(404).json({ error: "Row not found" });
    }
    // Cards in this row will have row_id set to NULL (ON DELETE SET NULL)
    await db.query("DELETE FROM roadmap_rows WHERE id = $1", [req.params.rowId]);
    res.status(204).end();
  } catch (err) {
    res.status(500).json({ error: safeError(err) });
  }
});

// PATCH /api/roadmaps/:id/rows/reorder - Reorder rows
router.patch("/:id/rows/reorder", async (req, res) => {
  try {
    if (!(await verifyRoadmapAccess(req, res))) return;

    const { order } = req.body;
    if (!Array.isArray(order)) {
      return res.status(400).json({ error: "order must be an array of row IDs" });
    }

    for (let i = 0; i < order.length; i++) {
      await db.query(
        "UPDATE roadmap_rows SET sort_order = $1 WHERE id = $2 AND roadmap_id = $3",
        [i, order[i], req.params.id]
      );
    }

    const { rows } = await db.query(
      "SELECT * FROM roadmap_rows WHERE roadmap_id = $1 ORDER BY sort_order ASC",
      [req.params.id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: safeError(err) });
  }
});

// =====================
// CAPACITY DATA
// =====================

// GET /api/roadmaps/:id/capacity - Get capacity data for a roadmap
// Returns per-sprint per-team effort totals, team capacities, and overall capacity
router.get("/:id/capacity", async (req, res) => {
  try {
    if (!(await verifyRoadmapAccess(req, res))) return;

    const { rows: roadmapRows } = await db.query("SELECT * FROM roadmaps WHERE id = $1", [req.params.id]);
    const roadmap = roadmapRows[0];

    // Get workspace settings for overall capacity
    const { rows: settingsRows } = await db.query(
      "SELECT * FROM workspace_settings WHERE workspace_id = $1",
      [roadmap.workspace_id]
    );
    const settings = settingsRows[0] || {};

    // Get teams with their sprint capacities
    const { rows: teams } = await db.query(
      "SELECT id, name, color, sprint_capacity FROM teams WHERE workspace_id = $1",
      [roadmap.workspace_id]
    );

    // Get sprints for this roadmap
    const { rows: sprintsList } = await db.query(
      "SELECT id FROM sprints WHERE roadmap_id = $1 ORDER BY sort_order ASC",
      [req.params.id]
    );
    const sprintIds = sprintsList.map((s) => s.id);

    // Get all cards with their sprint assignments
    const { rows: cards } = await db.query(
      "SELECT id, start_sprint_id, end_sprint_id, effort FROM cards WHERE roadmap_id = $1",
      [req.params.id]
    );

    // Get all card_teams for cards in this roadmap
    const cardIds = cards.map((c) => c.id);
    let cardTeamRows = [];
    if (cardIds.length > 0) {
      // Build parameterized query for IN clause
      const placeholders = cardIds.map((_, i) => `$${i + 1}`).join(", ");
      const { rows } = await db.query(
        `SELECT ct.card_id, ct.team_id, ct.effort FROM card_teams ct WHERE ct.card_id IN (${placeholders})`,
        cardIds
      );
      cardTeamRows = rows;
    }

    // Build sprint index for lookup
    const sprintIndexMap = {};
    sprintIds.forEach((id, idx) => { sprintIndexMap[id] = idx; });

    // For each card, determine which sprints it spans
    // Then accumulate per-team per-sprint effort
    // Key: "sprintId:teamId" => total effort
    const sprintTeamEffort = {}; // { sprintId: { teamId: totalEffort } }
    const sprintTotalEffort = {}; // { sprintId: totalEffort }

    for (const card of cards) {
      const startIdx = sprintIndexMap[card.start_sprint_id];
      const endIdx = sprintIndexMap[card.end_sprint_id];
      if (startIdx === undefined) continue;
      const eIdx = endIdx !== undefined ? endIdx : startIdx;
      const spanCount = eIdx - startIdx + 1;

      // Get this card's team efforts
      const teamEfforts = cardTeamRows.filter((ct) => ct.card_id === card.id);

      // Also use card-level effort if no team-specific effort exists
      const cardEffort = card.effort || 0;

      for (let si = startIdx; si <= eIdx; si++) {
        const sprintId = sprintIds[si];
        if (!sprintId) continue;

        if (!sprintTeamEffort[sprintId]) sprintTeamEffort[sprintId] = {};
        if (!sprintTotalEffort[sprintId]) sprintTotalEffort[sprintId] = 0;

        if (teamEfforts.length > 0) {
          // Distribute each team's effort evenly across the sprints the card spans
          for (const te of teamEfforts) {
            const perSprint = (te.effort || 0) / spanCount;
            if (!sprintTeamEffort[sprintId][te.team_id]) sprintTeamEffort[sprintId][te.team_id] = 0;
            sprintTeamEffort[sprintId][te.team_id] += perSprint;
            sprintTotalEffort[sprintId] += perSprint;
          }
        } else if (cardEffort > 0) {
          // Card has effort but no team assignments — count toward overall only
          const perSprint = cardEffort / spanCount;
          sprintTotalEffort[sprintId] += perSprint;
        }
      }
    }

    res.json({
      teams: teams.map((t) => ({ id: t.id, name: t.name, color: t.color, sprint_capacity: t.sprint_capacity })),
      overall_sprint_capacity: teams.reduce((sum, t) => sum + (t.sprint_capacity || 0), 0) || null,
      effort_unit: settings.effort_unit || "Story Points",
      sprint_effort: sprintTeamEffort,
      sprint_totals: sprintTotalEffort,
    });
  } catch (err) {
    res.status(500).json({ error: safeError(err) });
  }
});

// =====================
// CARDS NESTED UNDER ROADMAPS
// =====================

// GET /api/roadmaps/:id/cards - List all cards for a roadmap
router.get("/:id/cards", async (req, res) => {
  try {
    if (!(await verifyRoadmapAccess(req, res))) return;

    const { rows: cards } = await db.query(
      "SELECT * FROM cards WHERE roadmap_id = $1 ORDER BY sort_order ASC",
      [req.params.id]
    );

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

    res.json(cardsWithTags);
  } catch (err) {
    res.status(500).json({ error: safeError(err) });
  }
});

// POST /api/roadmaps/:id/cards - Create card
router.post("/:id/cards", async (req, res) => {
  try {
    if (!(await verifyRoadmapAccess(req, res))) return;

    const {
      row_id, name, description, status, team_id, effort,
      headcount, start_sprint, duration_sprints, sort_order,
      start_sprint_id, end_sprint_id
    } = req.body;

    if (!name) {
      return res.status(400).json({ error: "name is required" });
    }

    const nameErr = validateLength(name, "Name", MAX_NAME_LENGTH);
    if (nameErr) return res.status(400).json({ error: nameErr });

    if (description) {
      const descErr = validateLength(description, "Description", MAX_DESCRIPTION_LENGTH);
      if (descErr) return res.status(400).json({ error: descErr });
    }

    if (effort !== undefined && effort !== null) {
      const effortErr = validateNonNegativeNumber(effort, "effort");
      if (effortErr) return res.status(400).json({ error: effortErr });
    }

    if (headcount !== undefined && headcount !== null) {
      const hcErr = validateNonNegativeNumber(headcount, "headcount");
      if (hcErr) return res.status(400).json({ error: hcErr });
    }

    const id = uuidv4();
    const { rows: maxOrderRows } = await db.query(
      "SELECT COALESCE(MAX(sort_order), -1) + 1 as next_order FROM cards WHERE roadmap_id = $1",
      [req.params.id]
    );

    await db.query(
      `INSERT INTO cards (id, roadmap_id, row_id, name, description, status, team_id, effort, headcount, start_sprint, duration_sprints, sort_order, created_by, start_sprint_id, end_sprint_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
      [
        id, req.params.id, row_id || null, sanitizeHtml(name), description ? sanitizeHtml(description) : null,
        status || "placeholder", team_id || null, effort || null,
        headcount || 1, start_sprint || null, duration_sprints || 1,
        sort_order !== undefined ? sort_order : maxOrderRows[0].next_order,
        req.user.id, start_sprint_id || null, end_sprint_id || null
      ]
    );

    const { rows } = await db.query("SELECT * FROM cards WHERE id = $1", [id]);
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: safeError(err) });
  }
});

router.createDefaultRoadmap = createDefaultRoadmap;
module.exports = router;
