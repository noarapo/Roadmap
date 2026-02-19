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
router.get("/", async (req, res) => {
  try {
    // Always scope to user's workspace
    const workspace_id = req.user.workspace_id;
    const { rows: teams } = await db.query("SELECT * FROM teams WHERE workspace_id = $1 ORDER BY name", [workspace_id]);

    // Attach member count
    const teamsWithCounts = [];
    for (const team of teams) {
      const { rows: countRows } = await db.query(
        "SELECT COUNT(*) as count FROM team_members WHERE team_id = $1",
        [team.id]
      );
      teamsWithCounts.push({ ...team, member_count: parseInt(countRows[0].count, 10) });
    }

    res.json(teamsWithCounts);
  } catch (err) {
    res.status(500).json({ error: safeError(err) });
  }
});

// POST /api/teams - Create team
router.post("/", async (req, res) => {
  try {
    const workspace_id = req.user.workspace_id;
    const { name, color, dev_count, capacity_method, avg_output_per_dev, sprint_length_weeks, sprint_capacity } = req.body;
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

    if (sprint_capacity !== undefined && sprint_capacity !== null) {
      const scErr = validateNonNegativeNumber(sprint_capacity, "sprint_capacity");
      if (scErr) return res.status(400).json({ error: scErr });
    }

    const id = uuidv4();
    await db.query(
      `INSERT INTO teams (id, workspace_id, name, color, dev_count, capacity_method, avg_output_per_dev, sprint_length_weeks, sprint_capacity)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        id, workspace_id, sanitizeHtml(name), color || null,
        dev_count || 5, capacity_method || "points",
        avg_output_per_dev || 8, sprint_length_weeks || 2,
        sprint_capacity != null ? sprint_capacity : null
      ]
    );

    const { rows } = await db.query("SELECT * FROM teams WHERE id = $1", [id]);
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: safeError(err) });
  }
});

// Helper: verify team belongs to user's workspace
async function verifyTeamAccess(teamId, req, res) {
  const { rows } = await db.query("SELECT * FROM teams WHERE id = $1", [teamId]);
  const team = rows[0];
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
router.get("/:id", async (req, res) => {
  try {
    const team = await verifyTeamAccess(req.params.id, req, res);
    if (!team) return;

    const { rows: members } = await db.query(
      "SELECT * FROM team_members WHERE team_id = $1 ORDER BY name",
      [req.params.id]
    );

    // Get time off for each member
    const membersWithTimeOff = [];
    for (const member of members) {
      const { rows: time_off } = await db.query(
        "SELECT * FROM time_off WHERE team_member_id = $1 ORDER BY start_date",
        [member.id]
      );
      membersWithTimeOff.push({ ...member, time_off });
    }

    res.json({ ...team, members: membersWithTimeOff });
  } catch (err) {
    res.status(500).json({ error: safeError(err) });
  }
});

// PATCH /api/teams/:id - Update team
router.patch("/:id", async (req, res) => {
  try {
    const team = await verifyTeamAccess(req.params.id, req, res);
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

    if (req.body.sprint_capacity !== undefined && req.body.sprint_capacity !== null) {
      const scErr = validateNonNegativeNumber(req.body.sprint_capacity, "sprint_capacity");
      if (scErr) return res.status(400).json({ error: scErr });
    }

    const allowed = ["name", "color", "dev_count", "capacity_method", "avg_output_per_dev", "sprint_length_weeks", "sprint_capacity"];
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
      await db.query(`UPDATE teams SET ${sets.join(", ")} WHERE id = $${paramIndex}`, values);
    }

    const { rows } = await db.query("SELECT * FROM teams WHERE id = $1", [req.params.id]);
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: safeError(err) });
  }
});

// DELETE /api/teams/:id - Delete team
router.delete("/:id", async (req, res) => {
  try {
    const team = await verifyTeamAccess(req.params.id, req, res);
    if (!team) return;

    await db.query("DELETE FROM teams WHERE id = $1", [req.params.id]);
    res.status(204).end();
  } catch (err) {
    res.status(500).json({ error: safeError(err) });
  }
});

// =====================
// TEAM MEMBERS CRUD
// =====================

// GET /api/teams/:id/members - List team members
router.get("/:id/members", async (req, res) => {
  try {
    const team = await verifyTeamAccess(req.params.id, req, res);
    if (!team) return;

    const { rows: members } = await db.query(
      "SELECT * FROM team_members WHERE team_id = $1 ORDER BY name",
      [req.params.id]
    );
    res.json(members);
  } catch (err) {
    res.status(500).json({ error: safeError(err) });
  }
});

// POST /api/teams/:id/members - Add team member
router.post("/:id/members", async (req, res) => {
  try {
    const team = await verifyTeamAccess(req.params.id, req, res);
    if (!team) return;

    const { name } = req.body;
    if (!name) {
      return res.status(400).json({ error: "name is required" });
    }

    const nameErr = validateLength(name, "Name", MAX_NAME_LENGTH);
    if (nameErr) return res.status(400).json({ error: nameErr });

    const id = uuidv4();
    await db.query(
      "INSERT INTO team_members (id, team_id, name) VALUES ($1, $2, $3)",
      [id, req.params.id, sanitizeHtml(name)]
    );

    const { rows } = await db.query("SELECT * FROM team_members WHERE id = $1", [id]);
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: safeError(err) });
  }
});

// PATCH /api/teams/:teamId/members/:memberId - Update team member
router.patch("/:teamId/members/:memberId", async (req, res) => {
  try {
    const team = await verifyTeamAccess(req.params.teamId, req, res);
    if (!team) return;

    const { rows: memberRows } = await db.query("SELECT * FROM team_members WHERE id = $1", [req.params.memberId]);
    const member = memberRows[0];
    if (!member) {
      return res.status(404).json({ error: "Team member not found" });
    }

    if (req.body.name !== undefined) {
      const nameErr = validateLength(req.body.name, "Name", MAX_NAME_LENGTH);
      if (nameErr) return res.status(400).json({ error: nameErr });
      await db.query("UPDATE team_members SET name = $1 WHERE id = $2", [sanitizeHtml(req.body.name), req.params.memberId]);
    }

    const { rows } = await db.query("SELECT * FROM team_members WHERE id = $1", [req.params.memberId]);
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: safeError(err) });
  }
});

// DELETE /api/teams/:teamId/members/:memberId - Delete team member
router.delete("/:teamId/members/:memberId", async (req, res) => {
  try {
    const team = await verifyTeamAccess(req.params.teamId, req, res);
    if (!team) return;

    const { rows: memberRows } = await db.query("SELECT * FROM team_members WHERE id = $1", [req.params.memberId]);
    const member = memberRows[0];
    if (!member) {
      return res.status(404).json({ error: "Team member not found" });
    }
    await db.query("DELETE FROM team_members WHERE id = $1", [req.params.memberId]);
    res.status(204).end();
  } catch (err) {
    res.status(500).json({ error: safeError(err) });
  }
});

// =====================
// TIME OFF CRUD
// =====================

// GET /api/teams/:teamId/members/:memberId/time-off - List time off
router.get("/:teamId/members/:memberId/time-off", async (req, res) => {
  try {
    const team = await verifyTeamAccess(req.params.teamId, req, res);
    if (!team) return;

    const { rows: timeOff } = await db.query(
      "SELECT * FROM time_off WHERE team_member_id = $1 ORDER BY start_date",
      [req.params.memberId]
    );
    res.json(timeOff);
  } catch (err) {
    res.status(500).json({ error: safeError(err) });
  }
});

// POST /api/teams/:teamId/members/:memberId/time-off - Add time off
router.post("/:teamId/members/:memberId/time-off", async (req, res) => {
  try {
    const team = await verifyTeamAccess(req.params.teamId, req, res);
    if (!team) return;

    const { start_date, end_date, type } = req.body;
    if (!start_date || !end_date) {
      return res.status(400).json({ error: "start_date and end_date are required" });
    }

    const id = uuidv4();
    await db.query(
      "INSERT INTO time_off (id, team_member_id, start_date, end_date, type) VALUES ($1, $2, $3, $4, $5)",
      [id, req.params.memberId, start_date, end_date, type || "vacation"]
    );

    const { rows } = await db.query("SELECT * FROM time_off WHERE id = $1", [id]);
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: safeError(err) });
  }
});

// PATCH /api/teams/:teamId/members/:memberId/time-off/:timeOffId - Update time off
router.patch("/:teamId/members/:memberId/time-off/:timeOffId", async (req, res) => {
  try {
    const team = await verifyTeamAccess(req.params.teamId, req, res);
    if (!team) return;

    const { rows: recordRows } = await db.query("SELECT * FROM time_off WHERE id = $1", [req.params.timeOffId]);
    const record = recordRows[0];
    if (!record) {
      return res.status(404).json({ error: "Time off record not found" });
    }

    const allowed = ["start_date", "end_date", "type"];
    const sets = [];
    const values = [];
    let paramIndex = 1;
    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        sets.push(`${key} = $${paramIndex}`);
        values.push(req.body[key]);
        paramIndex++;
      }
    }

    if (sets.length > 0) {
      values.push(req.params.timeOffId);
      await db.query(`UPDATE time_off SET ${sets.join(", ")} WHERE id = $${paramIndex}`, values);
    }

    const { rows } = await db.query("SELECT * FROM time_off WHERE id = $1", [req.params.timeOffId]);
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: safeError(err) });
  }
});

// DELETE /api/teams/:teamId/members/:memberId/time-off/:timeOffId - Delete time off
router.delete("/:teamId/members/:memberId/time-off/:timeOffId", async (req, res) => {
  try {
    const team = await verifyTeamAccess(req.params.teamId, req, res);
    if (!team) return;

    const { rows: recordRows } = await db.query("SELECT * FROM time_off WHERE id = $1", [req.params.timeOffId]);
    const record = recordRows[0];
    if (!record) {
      return res.status(404).json({ error: "Time off record not found" });
    }
    await db.query("DELETE FROM time_off WHERE id = $1", [req.params.timeOffId]);
    res.status(204).end();
  } catch (err) {
    res.status(500).json({ error: safeError(err) });
  }
});

module.exports = router;
