const express = require("express");
const router = express.Router();
const { v4: uuidv4 } = require("uuid");
const db = require("../models/db");

// =====================
// TEAM CRUD
// =====================

// GET /api/teams - List teams (optionally by workspace_id)
router.get("/", (req, res) => {
  try {
    const { workspace_id } = req.query;
    let teams;
    if (workspace_id) {
      teams = db.prepare("SELECT * FROM teams WHERE workspace_id = ? ORDER BY name").all(workspace_id);
    } else {
      teams = db.prepare("SELECT * FROM teams ORDER BY name").all();
    }

    // Attach member count
    const teamsWithCounts = teams.map((team) => {
      const memberCount = db.prepare(
        "SELECT COUNT(*) as count FROM team_members WHERE team_id = ?"
      ).get(team.id);
      return { ...team, member_count: memberCount.count };
    });

    res.json(teamsWithCounts);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/teams - Create team
router.post("/", (req, res) => {
  try {
    const { workspace_id, name, color, dev_count, capacity_method, avg_output_per_dev, sprint_length_weeks } = req.body;
    if (!workspace_id || !name) {
      return res.status(400).json({ error: "workspace_id and name are required" });
    }

    const id = uuidv4();
    db.prepare(
      `INSERT INTO teams (id, workspace_id, name, color, dev_count, capacity_method, avg_output_per_dev, sprint_length_weeks)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id, workspace_id, name, color || null,
      dev_count || 5, capacity_method || "points",
      avg_output_per_dev || 8, sprint_length_weeks || 2
    );

    const team = db.prepare("SELECT * FROM teams WHERE id = ?").get(id);
    res.status(201).json(team);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/teams/:id - Get team with members
router.get("/:id", (req, res) => {
  try {
    const team = db.prepare("SELECT * FROM teams WHERE id = ?").get(req.params.id);
    if (!team) {
      return res.status(404).json({ error: "Team not found" });
    }

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
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/teams/:id - Update team
router.patch("/:id", (req, res) => {
  try {
    const team = db.prepare("SELECT * FROM teams WHERE id = ?").get(req.params.id);
    if (!team) {
      return res.status(404).json({ error: "Team not found" });
    }

    const allowed = ["name", "color", "dev_count", "capacity_method", "avg_output_per_dev", "sprint_length_weeks"];
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
      db.prepare(`UPDATE teams SET ${sets.join(", ")} WHERE id = ?`).run(...values);
    }

    const updated = db.prepare("SELECT * FROM teams WHERE id = ?").get(req.params.id);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/teams/:id - Delete team
router.delete("/:id", (req, res) => {
  try {
    const team = db.prepare("SELECT * FROM teams WHERE id = ?").get(req.params.id);
    if (!team) {
      return res.status(404).json({ error: "Team not found" });
    }
    db.prepare("DELETE FROM teams WHERE id = ?").run(req.params.id);
    res.status(204).end();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// =====================
// TEAM MEMBERS CRUD
// =====================

// GET /api/teams/:id/members - List team members
router.get("/:id/members", (req, res) => {
  try {
    const members = db.prepare(
      "SELECT * FROM team_members WHERE team_id = ? ORDER BY name"
    ).all(req.params.id);
    res.json(members);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/teams/:id/members - Add team member
router.post("/:id/members", (req, res) => {
  try {
    const { name } = req.body;
    if (!name) {
      return res.status(400).json({ error: "name is required" });
    }

    const id = uuidv4();
    db.prepare(
      "INSERT INTO team_members (id, team_id, name) VALUES (?, ?, ?)"
    ).run(id, req.params.id, name);

    const member = db.prepare("SELECT * FROM team_members WHERE id = ?").get(id);
    res.status(201).json(member);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/teams/:teamId/members/:memberId - Update team member
router.patch("/:teamId/members/:memberId", (req, res) => {
  try {
    const member = db.prepare("SELECT * FROM team_members WHERE id = ?").get(req.params.memberId);
    if (!member) {
      return res.status(404).json({ error: "Team member not found" });
    }

    if (req.body.name !== undefined) {
      db.prepare("UPDATE team_members SET name = ? WHERE id = ?").run(req.body.name, req.params.memberId);
    }

    const updated = db.prepare("SELECT * FROM team_members WHERE id = ?").get(req.params.memberId);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/teams/:teamId/members/:memberId - Delete team member
router.delete("/:teamId/members/:memberId", (req, res) => {
  try {
    const member = db.prepare("SELECT * FROM team_members WHERE id = ?").get(req.params.memberId);
    if (!member) {
      return res.status(404).json({ error: "Team member not found" });
    }
    db.prepare("DELETE FROM team_members WHERE id = ?").run(req.params.memberId);
    res.status(204).end();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// =====================
// TIME OFF CRUD
// =====================

// GET /api/teams/:teamId/members/:memberId/time-off - List time off
router.get("/:teamId/members/:memberId/time-off", (req, res) => {
  try {
    const timeOff = db.prepare(
      "SELECT * FROM time_off WHERE team_member_id = ? ORDER BY start_date"
    ).all(req.params.memberId);
    res.json(timeOff);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/teams/:teamId/members/:memberId/time-off - Add time off
router.post("/:teamId/members/:memberId/time-off", (req, res) => {
  try {
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
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/teams/:teamId/members/:memberId/time-off/:timeOffId - Update time off
router.patch("/:teamId/members/:memberId/time-off/:timeOffId", (req, res) => {
  try {
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
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/teams/:teamId/members/:memberId/time-off/:timeOffId - Delete time off
router.delete("/:teamId/members/:memberId/time-off/:timeOffId", (req, res) => {
  try {
    const record = db.prepare("SELECT * FROM time_off WHERE id = ?").get(req.params.timeOffId);
    if (!record) {
      return res.status(404).json({ error: "Time off record not found" });
    }
    db.prepare("DELETE FROM time_off WHERE id = ?").run(req.params.timeOffId);
    res.status(204).end();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// =====================
// TEAM CAPACITY (computed)
// =====================

// GET /api/teams/:id/capacity - Calculate team capacity for a sprint range
router.get("/:id/capacity", (req, res) => {
  try {
    const team = db.prepare("SELECT * FROM teams WHERE id = ?").get(req.params.id);
    if (!team) {
      return res.status(404).json({ error: "Team not found" });
    }

    const members = db.prepare(
      "SELECT * FROM team_members WHERE team_id = ?"
    ).all(req.params.id);

    const totalDevs = members.length || team.dev_count;
    const sprintCapacity = totalDevs * team.avg_output_per_dev;

    res.json({
      team_id: team.id,
      team_name: team.name,
      dev_count: totalDevs,
      avg_output_per_dev: team.avg_output_per_dev,
      sprint_length_weeks: team.sprint_length_weeks,
      capacity_per_sprint: sprintCapacity,
      capacity_method: team.capacity_method,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
