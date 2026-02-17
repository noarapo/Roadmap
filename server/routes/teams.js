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
} = require("../middleware/validate");

function safeError(err) {
  if (process.env.NODE_ENV === "production") return "Internal server error";
  return err.message;
}

// All routes require authentication
router.use(authMiddleware);

// =====================
// TEAM CRUD
// =====================

// GET /api/teams - List teams for the user's workspace
router.get("/", (req, res) => {
  try {
    // Always scope to user's workspace
    const workspace_id = req.user.workspace_id;
    const teams = db.prepare("SELECT * FROM teams WHERE workspace_id = ? ORDER BY name").all(workspace_id);

    // Attach member count
    const teamsWithCounts = teams.map((team) => {
      const memberCount = db.prepare(
        "SELECT COUNT(*) as count FROM team_members WHERE team_id = ?"
      ).get(team.id);
      return { ...team, member_count: memberCount.count };
    });

    res.json(teamsWithCounts);
  } catch (err) {
    res.status(500).json({ error: safeError(err) });
  }
});

// POST /api/teams - Create team
router.post("/", (req, res) => {
  try {
    const workspace_id = req.user.workspace_id;
    const { name, color, dev_count, capacity_method, avg_output_per_dev, sprint_length_weeks } = req.body;
    if (!name) {
      return res.status(400).json({ error: "name is required" });
    }

    const nameErr = validateLength(name, "Name", MAX_NAME_LENGTH);
    if (nameErr) return res.status(400).json({ error: nameErr });

    if (dev_count !== undefined) {
      const dcErr = validateNonNegativeNumber(dev_count, "dev_count");
      if (dcErr) return res.status(400).json({ error: dcErr });
    }
    if (avg_output_per_dev !== undefined) {
      const aoErr = validateNonNegativeNumber(avg_output_per_dev, "avg_output_per_dev");
      if (aoErr) return res.status(400).json({ error: aoErr });
    }

    const id = uuidv4();
    db.prepare(
      `INSERT INTO teams (id, workspace_id, name, color, dev_count, capacity_method, avg_output_per_dev, sprint_length_weeks)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id, workspace_id, sanitizeHtml(name), color || null,
      dev_count || 5, capacity_method || "points",
      avg_output_per_dev || 8, sprint_length_weeks || 2
    );

    const team = db.prepare("SELECT * FROM teams WHERE id = ?").get(id);
    res.status(201).json(team);
  } catch (err) {
    res.status(500).json({ error: safeError(err) });
  }
});

// Helper: verify team belongs to user's workspace
function verifyTeamAccess(teamId, req, res) {
  const team = db.prepare("SELECT * FROM teams WHERE id = ?").get(teamId);
  if (!team) {
    res.status(404).json({ error: "Team not found" });
    return null;
  }
  if (team.workspace_id !== req.user.workspace_id) {
    res.status(403).json({ error: "Access denied" });
    return null;
  }
  return team;
}

// GET /api/teams/:id - Get team with members
router.get("/:id", (req, res) => {
  try {
    const team = verifyTeamAccess(req.params.id, req, res);
    if (!team) return;

    const members = db.prepare(
      "SELECT * FROM team_members WHERE team_id = ? ORDER BY name"
    ).all(req.params.id);

    // Get time off for each member
    const membersWithTimeOff = members.map((member) => {
      const time_off = db.prepare(
        "SELECT * FROM time_off WHERE team_member_id = ? ORDER BY start_date"
      ).all(member.id);
      return { ...member, time_off };
    });

    res.json({ ...team, members: membersWithTimeOff });
  } catch (err) {
    res.status(500).json({ error: safeError(err) });
  }
});

// PATCH /api/teams/:id - Update team
router.patch("/:id", (req, res) => {
  try {
    const team = verifyTeamAccess(req.params.id, req, res);
    if (!team) return;

    if (req.body.name !== undefined) {
      const nameErr = validateLength(req.body.name, "Name", MAX_NAME_LENGTH);
      if (nameErr) return res.status(400).json({ error: nameErr });
    }
    if (req.body.dev_count !== undefined) {
      const dcErr = validateNonNegativeNumber(req.body.dev_count, "dev_count");
      if (dcErr) return res.status(400).json({ error: dcErr });
    }
    if (req.body.avg_output_per_dev !== undefined) {
      const aoErr = validateNonNegativeNumber(req.body.avg_output_per_dev, "avg_output_per_dev");
      if (aoErr) return res.status(400).json({ error: aoErr });
    }

    const allowed = ["name", "color", "dev_count", "capacity_method", "avg_output_per_dev", "sprint_length_weeks"];
    const sets = [];
    const values = [];
    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        let val = req.body[key];
        if (key === "name") val = sanitizeHtml(val);
        sets.push(`${key} = ?`);
        values.push(val);
      }
    }

    if (sets.length > 0) {
      values.push(req.params.id);
      db.prepare(`UPDATE teams SET ${sets.join(", ")} WHERE id = ?`).run(...values);
    }

    const updated = db.prepare("SELECT * FROM teams WHERE id = ?").get(req.params.id);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: safeError(err) });
  }
});

// DELETE /api/teams/:id - Delete team
router.delete("/:id", (req, res) => {
  try {
    const team = verifyTeamAccess(req.params.id, req, res);
    if (!team) return;

    db.prepare("DELETE FROM teams WHERE id = ?").run(req.params.id);
    res.status(204).end();
  } catch (err) {
    res.status(500).json({ error: safeError(err) });
  }
});

// =====================
// TEAM MEMBERS CRUD
// =====================

// GET /api/teams/:id/members - List team members
router.get("/:id/members", (req, res) => {
  try {
    const team = verifyTeamAccess(req.params.id, req, res);
    if (!team) return;

    const members = db.prepare(
      "SELECT * FROM team_members WHERE team_id = ? ORDER BY name"
    ).all(req.params.id);
    res.json(members);
  } catch (err) {
    res.status(500).json({ error: safeError(err) });
  }
});

// POST /api/teams/:id/members - Add team member
router.post("/:id/members", (req, res) => {
  try {
    const team = verifyTeamAccess(req.params.id, req, res);
    if (!team) return;

    const { name } = req.body;
    if (!name) {
      return res.status(400).json({ error: "name is required" });
    }

    const nameErr = validateLength(name, "Name", MAX_NAME_LENGTH);
    if (nameErr) return res.status(400).json({ error: nameErr });

    const id = uuidv4();
    db.prepare(
      "INSERT INTO team_members (id, team_id, name) VALUES (?, ?, ?)"
    ).run(id, req.params.id, sanitizeHtml(name));

    const member = db.prepare("SELECT * FROM team_members WHERE id = ?").get(id);
    res.status(201).json(member);
  } catch (err) {
    res.status(500).json({ error: safeError(err) });
  }
});

// PATCH /api/teams/:teamId/members/:memberId - Update team member
router.patch("/:teamId/members/:memberId", (req, res) => {
  try {
    const team = verifyTeamAccess(req.params.teamId, req, res);
    if (!team) return;

    const member = db.prepare("SELECT * FROM team_members WHERE id = ?").get(req.params.memberId);
    if (!member) {
      return res.status(404).json({ error: "Team member not found" });
    }

    if (req.body.name !== undefined) {
      const nameErr = validateLength(req.body.name, "Name", MAX_NAME_LENGTH);
      if (nameErr) return res.status(400).json({ error: nameErr });
      db.prepare("UPDATE team_members SET name = ? WHERE id = ?").run(sanitizeHtml(req.body.name), req.params.memberId);
    }

    const updated = db.prepare("SELECT * FROM team_members WHERE id = ?").get(req.params.memberId);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: safeError(err) });
  }
});

// DELETE /api/teams/:teamId/members/:memberId - Delete team member
router.delete("/:teamId/members/:memberId", (req, res) => {
  try {
    const team = verifyTeamAccess(req.params.teamId, req, res);
    if (!team) return;

    const member = db.prepare("SELECT * FROM team_members WHERE id = ?").get(req.params.memberId);
    if (!member) {
      return res.status(404).json({ error: "Team member not found" });
    }
    db.prepare("DELETE FROM team_members WHERE id = ?").run(req.params.memberId);
    res.status(204).end();
  } catch (err) {
    res.status(500).json({ error: safeError(err) });
  }
});

// =====================
// TIME OFF CRUD
// =====================

// GET /api/teams/:teamId/members/:memberId/time-off - List time off
router.get("/:teamId/members/:memberId/time-off", (req, res) => {
  try {
    const team = verifyTeamAccess(req.params.teamId, req, res);
    if (!team) return;

    const timeOff = db.prepare(
      "SELECT * FROM time_off WHERE team_member_id = ? ORDER BY start_date"
    ).all(req.params.memberId);
    res.json(timeOff);
  } catch (err) {
    res.status(500).json({ error: safeError(err) });
  }
});

// POST /api/teams/:teamId/members/:memberId/time-off - Add time off
router.post("/:teamId/members/:memberId/time-off", (req, res) => {
  try {
    const team = verifyTeamAccess(req.params.teamId, req, res);
    if (!team) return;

    const { start_date, end_date, type } = req.body;
    if (!start_date || !end_date) {
      return res.status(400).json({ error: "start_date and end_date are required" });
    }

    const id = uuidv4();
    db.prepare(
      "INSERT INTO time_off (id, team_member_id, start_date, end_date, type) VALUES (?, ?, ?, ?, ?)"
    ).run(id, req.params.memberId, start_date, end_date, type || "vacation");

    const timeOff = db.prepare("SELECT * FROM time_off WHERE id = ?").get(id);
    res.status(201).json(timeOff);
  } catch (err) {
    res.status(500).json({ error: safeError(err) });
  }
});

// PATCH /api/teams/:teamId/members/:memberId/time-off/:timeOffId - Update time off
router.patch("/:teamId/members/:memberId/time-off/:timeOffId", (req, res) => {
  try {
    const team = verifyTeamAccess(req.params.teamId, req, res);
    if (!team) return;

    const record = db.prepare("SELECT * FROM time_off WHERE id = ?").get(req.params.timeOffId);
    if (!record) {
      return res.status(404).json({ error: "Time off record not found" });
    }

    const allowed = ["start_date", "end_date", "type"];
    const sets = [];
    const values = [];
    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        sets.push(`${key} = ?`);
        values.push(req.body[key]);
      }
    }

    if (sets.length > 0) {
      values.push(req.params.timeOffId);
      db.prepare(`UPDATE time_off SET ${sets.join(", ")} WHERE id = ?`).run(...values);
    }

    const updated = db.prepare("SELECT * FROM time_off WHERE id = ?").get(req.params.timeOffId);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: safeError(err) });
  }
});

// DELETE /api/teams/:teamId/members/:memberId/time-off/:timeOffId - Delete time off
router.delete("/:teamId/members/:memberId/time-off/:timeOffId", (req, res) => {
  try {
    const team = verifyTeamAccess(req.params.teamId, req, res);
    if (!team) return;

    const record = db.prepare("SELECT * FROM time_off WHERE id = ?").get(req.params.timeOffId);
    if (!record) {
      return res.status(404).json({ error: "Time off record not found" });
    }
    db.prepare("DELETE FROM time_off WHERE id = ?").run(req.params.timeOffId);
    res.status(204).end();
  } catch (err) {
    res.status(500).json({ error: safeError(err) });
  }
});

module.exports = router;
