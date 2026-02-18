const express = require("express");
const router = express.Router();
const db = require("../models/db");
const { authMiddleware, adminMiddleware } = require("./auth");

function safeError(err) {
  if (process.env.NODE_ENV === "production") return "Internal server error";
  return err.message;
}

// All admin routes require auth + admin
router.use(authMiddleware);
router.use(adminMiddleware);

// GET /api/admin/stats - Dashboard overview
router.get("/stats", async (req, res) => {
  try {
    const { rows: userCount } = await db.query("SELECT COUNT(*) as count FROM users");
    const { rows: roadmapCount } = await db.query("SELECT COUNT(*) as count FROM roadmaps");
    const { rows: workspaceCount } = await db.query("SELECT COUNT(*) as count FROM workspaces");
    const { rows: cardCount } = await db.query("SELECT COUNT(*) as count FROM cards");

    res.json({
      users: parseInt(userCount[0].count, 10),
      roadmaps: parseInt(roadmapCount[0].count, 10),
      workspaces: parseInt(workspaceCount[0].count, 10),
      cards: parseInt(cardCount[0].count, 10),
    });
  } catch (err) {
    res.status(500).json({ error: safeError(err) });
  }
});

// GET /api/admin/users - List all users
router.get("/users", async (req, res) => {
  try {
    const { rows: users } = await db.query(
      `SELECT u.id, u.name, u.email, u.role, u.is_admin, u.created_at, u.last_login_at,
              u.workspace_id, w.name as workspace_name
       FROM users u
       LEFT JOIN workspaces w ON w.id = u.workspace_id
       ORDER BY u.created_at DESC`
    );

    // Get roadmap count per user's workspace
    for (const user of users) {
      const { rows: rmCount } = await db.query(
        "SELECT COUNT(*) as count FROM roadmaps WHERE workspace_id = $1",
        [user.workspace_id]
      );
      user.roadmap_count = parseInt(rmCount[0].count, 10);
    }

    res.json(users);
  } catch (err) {
    res.status(500).json({ error: safeError(err) });
  }
});

// PATCH /api/admin/users/:id - Update user (toggle admin, etc.)
router.patch("/users/:id", async (req, res) => {
  try {
    // Prevent self-demotion
    if (req.params.id === req.user.id && req.body.is_admin === false) {
      return res.status(400).json({ error: "Cannot remove your own admin access" });
    }

    const allowed = ["is_admin", "role"];
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
      values.push(req.params.id);
      await db.query(`UPDATE users SET ${sets.join(", ")} WHERE id = $${paramIndex}`, values);
    }

    const { rows } = await db.query(
      `SELECT u.id, u.name, u.email, u.role, u.is_admin, u.created_at, u.last_login_at,
              u.workspace_id, w.name as workspace_name
       FROM users u
       LEFT JOIN workspaces w ON w.id = u.workspace_id
       WHERE u.id = $1`,
      [req.params.id]
    );

    if (!rows[0]) return res.status(404).json({ error: "User not found" });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: safeError(err) });
  }
});

// DELETE /api/admin/users/:id - Delete user and their workspace
router.delete("/users/:id", async (req, res) => {
  try {
    if (req.params.id === req.user.id) {
      return res.status(400).json({ error: "Cannot delete yourself" });
    }

    const { rows: userRows } = await db.query("SELECT * FROM users WHERE id = $1", [req.params.id]);
    if (!userRows[0]) return res.status(404).json({ error: "User not found" });

    const user = userRows[0];

    // Delete all data in the user's workspace
    await db.query("DELETE FROM roadmaps WHERE workspace_id = $1", [user.workspace_id]);
    await db.query("DELETE FROM teams WHERE workspace_id = $1", [user.workspace_id]);
    await db.query("DELETE FROM users WHERE id = $1", [req.params.id]);
    await db.query("DELETE FROM workspaces WHERE id = $1", [user.workspace_id]);

    res.status(204).end();
  } catch (err) {
    res.status(500).json({ error: safeError(err) });
  }
});

// GET /api/admin/roadmaps - List all roadmaps across all workspaces
router.get("/roadmaps", async (req, res) => {
  try {
    const { rows: roadmaps } = await db.query(
      `SELECT r.id, r.name, r.status, r.created_at, r.workspace_id,
              w.name as workspace_name
       FROM roadmaps r
       LEFT JOIN workspaces w ON w.id = r.workspace_id
       ORDER BY r.created_at DESC`
    );

    // Get card count per roadmap
    for (const rm of roadmaps) {
      const { rows: cCount } = await db.query(
        "SELECT COUNT(*) as count FROM cards WHERE roadmap_id = $1",
        [rm.id]
      );
      rm.card_count = parseInt(cCount[0].count, 10);
    }

    res.json(roadmaps);
  } catch (err) {
    res.status(500).json({ error: safeError(err) });
  }
});

// DELETE /api/admin/roadmaps/:id - Delete a roadmap
router.delete("/roadmaps/:id", async (req, res) => {
  try {
    const { rows } = await db.query("SELECT id FROM roadmaps WHERE id = $1", [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: "Roadmap not found" });

    await db.query("DELETE FROM roadmaps WHERE id = $1", [req.params.id]);
    res.status(204).end();
  } catch (err) {
    res.status(500).json({ error: safeError(err) });
  }
});

module.exports = router;
