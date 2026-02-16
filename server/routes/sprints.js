const express = require("express");
const router = express.Router();
const { v4: uuidv4 } = require("uuid");
const db = require("../models/db");

/* ===== Helper: compute days between two ISO date strings ===== */
function daysBetween(a, b) {
  return Math.round((new Date(b) - new Date(a)) / 86400000) + 1;
}

function addDays(dateStr, n) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + n);
  return d.toISOString().split("T")[0];
}

/* ===== PATCH /api/sprints/:id — Update sprint ===== */
router.patch("/:id", (req, res) => {
  try {
    const sprint = db.prepare("SELECT * FROM sprints WHERE id = ?").get(req.params.id);
    if (!sprint) return res.status(404).json({ error: "Sprint not found" });

    const { days, start_date } = req.body;

    // If start_date is provided alongside days, update start_date first
    if (start_date && start_date !== sprint.start_date) {
      db.prepare("UPDATE sprints SET start_date = ? WHERE id = ?").run(start_date, sprint.id);
      sprint.start_date = start_date;
    }

    // Special handling: if `days` is provided, recalculate end_date and cascade
    if (days !== undefined && days >= 1) {
      const newEnd = addDays(sprint.start_date, days - 1);
      const oldEnd = sprint.end_date;
      const delta = daysBetween(sprint.start_date, newEnd) - daysBetween(sprint.start_date, oldEnd);

      db.prepare("UPDATE sprints SET end_date = ? WHERE id = ?").run(newEnd, sprint.id);

      // Cascade: make subsequent sprints contiguous, each keeping its own duration
      const subsequent = db.prepare(
        "SELECT * FROM sprints WHERE roadmap_id = ? AND sort_order > ? ORDER BY sort_order ASC"
      ).all(sprint.roadmap_id, sprint.sort_order);

      if (subsequent.length > 0) {
        const updateStmt = db.prepare("UPDATE sprints SET start_date = ?, end_date = ? WHERE id = ?");
        let prevEnd = newEnd;
        for (const s of subsequent) {
          const sDays = daysBetween(s.start_date, s.end_date);
          const nextStart = addDays(prevEnd, 1);
          const nextEnd = addDays(nextStart, sDays - 1);
          updateStmt.run(nextStart, nextEnd, s.id);
          prevEnd = nextEnd;
        }
      }

      // Return all sprints for this roadmap
      const all = db.prepare(
        "SELECT * FROM sprints WHERE roadmap_id = ? ORDER BY sort_order ASC"
      ).all(sprint.roadmap_id);
      return res.json(all);
    }

    // Regular field updates
    const allowed = ["name", "start_date", "end_date", "goal", "status"];
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
      db.prepare(`UPDATE sprints SET ${sets.join(", ")} WHERE id = ?`).run(...values);
    }

    const updated = db.prepare("SELECT * FROM sprints WHERE id = ?").get(req.params.id);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ===== DELETE /api/sprints/:id — Delete sprint ===== */
router.delete("/:id", (req, res) => {
  try {
    const sprint = db.prepare("SELECT * FROM sprints WHERE id = ?").get(req.params.id);
    if (!sprint) return res.status(404).json({ error: "Sprint not found" });

    // Find adjacent sprint to receive orphaned cards
    const moveToId = req.query.move_to || null;
    if (moveToId) {
      db.prepare("UPDATE cards SET start_sprint_id = ? WHERE start_sprint_id = ?").run(moveToId, sprint.id);
      db.prepare("UPDATE cards SET end_sprint_id = ? WHERE end_sprint_id = ?").run(moveToId, sprint.id);
    } else {
      // Default: move to next sprint, or previous if this is the last
      const next = db.prepare(
        "SELECT id FROM sprints WHERE roadmap_id = ? AND sort_order > ? ORDER BY sort_order ASC LIMIT 1"
      ).get(sprint.roadmap_id, sprint.sort_order);
      const prev = db.prepare(
        "SELECT id FROM sprints WHERE roadmap_id = ? AND sort_order < ? ORDER BY sort_order DESC LIMIT 1"
      ).get(sprint.roadmap_id, sprint.sort_order);
      const targetId = next?.id || prev?.id || null;
      if (targetId) {
        db.prepare("UPDATE cards SET start_sprint_id = ? WHERE start_sprint_id = ?").run(targetId, sprint.id);
        db.prepare("UPDATE cards SET end_sprint_id = ? WHERE end_sprint_id = ?").run(targetId, sprint.id);
      } else {
        db.prepare("UPDATE cards SET start_sprint_id = NULL WHERE start_sprint_id = ?").run(sprint.id);
        db.prepare("UPDATE cards SET end_sprint_id = NULL WHERE end_sprint_id = ?").run(sprint.id);
      }
    }

    db.prepare("DELETE FROM sprints WHERE id = ?").run(sprint.id);

    // Re-sort remaining sprints
    const remaining = db.prepare(
      "SELECT * FROM sprints WHERE roadmap_id = ? ORDER BY start_date ASC"
    ).all(sprint.roadmap_id);
    const updateStmt = db.prepare("UPDATE sprints SET sort_order = ? WHERE id = ?");
    remaining.forEach((s, i) => updateStmt.run(i, s.id));

    res.json(remaining);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
