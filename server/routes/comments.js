const express = require("express");
const router = express.Router();
const { v4: uuidv4 } = require("uuid");
const db = require("../models/db");

// =====================
// COMMENTS
// =====================

// GET /api/comments/card/:cardId - List comments for a card
router.get("/card/:cardId", (req, res) => {
  try {
    const comments = db.prepare(
      `SELECT c.*, u.name as user_name, u.avatar_url as user_avatar
       FROM comments c
       LEFT JOIN users u ON u.id = c.user_id
       WHERE c.card_id = ?
       ORDER BY c.created_at ASC`
    ).all(req.params.cardId);

    // Organize into threaded structure
    const topLevel = comments.filter((c) => !c.parent_comment_id);
    const replies = comments.filter((c) => c.parent_comment_id);

    const threaded = topLevel.map((comment) => ({
      ...comment,
      replies: replies.filter((r) => r.parent_comment_id === comment.id),
    }));

    res.json(threaded);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/comments - Create comment
router.post("/", (req, res) => {
  try {
    const { card_id, user_id, text, parent_comment_id } = req.body;
    if (!card_id || !text) {
      return res.status(400).json({ error: "card_id and text are required" });
    }

    const id = uuidv4();
    db.prepare(
      "INSERT INTO comments (id, card_id, user_id, text, parent_comment_id) VALUES (?, ?, ?, ?, ?)"
    ).run(id, card_id, user_id || null, text, parent_comment_id || null);

    const comment = db.prepare(
      `SELECT c.*, u.name as user_name, u.avatar_url as user_avatar
       FROM comments c
       LEFT JOIN users u ON u.id = c.user_id
       WHERE c.id = ?`
    ).get(id);

    // Log the activity
    db.prepare(
      "INSERT INTO activity_logs (id, card_id, user_id, action_type, action_detail) VALUES (?, ?, ?, ?, ?)"
    ).run(uuidv4(), card_id, user_id || null, "comment_added", `Comment: "${text.substring(0, 100)}"`);

    res.status(201).json(comment);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/comments/:id - Update comment
router.patch("/:id", (req, res) => {
  try {
    const comment = db.prepare("SELECT * FROM comments WHERE id = ?").get(req.params.id);
    if (!comment) {
      return res.status(404).json({ error: "Comment not found" });
    }

    if (req.body.text !== undefined) {
      db.prepare("UPDATE comments SET text = ? WHERE id = ?").run(req.body.text, req.params.id);
    }

    const updated = db.prepare(
      `SELECT c.*, u.name as user_name, u.avatar_url as user_avatar
       FROM comments c
       LEFT JOIN users u ON u.id = c.user_id
       WHERE c.id = ?`
    ).get(req.params.id);

    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/comments/:id - Delete comment
router.delete("/:id", (req, res) => {
  try {
    const comment = db.prepare("SELECT * FROM comments WHERE id = ?").get(req.params.id);
    if (!comment) {
      return res.status(404).json({ error: "Comment not found" });
    }
    db.prepare("DELETE FROM comments WHERE id = ?").run(req.params.id);
    res.status(204).end();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// =====================
// ACTIVITY LOGS
// =====================

// GET /api/comments/activity/card/:cardId - Get activity log for a card
router.get("/activity/card/:cardId", (req, res) => {
  try {
    const logs = db.prepare(
      `SELECT al.*, u.name as user_name, u.avatar_url as user_avatar
       FROM activity_logs al
       LEFT JOIN users u ON u.id = al.user_id
       WHERE al.card_id = ?
       ORDER BY al.created_at DESC
       LIMIT 50`
    ).all(req.params.cardId);
    res.json(logs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/comments/activity/recent - Get recent activity across all cards
router.get("/activity/recent", (req, res) => {
  try {
    const { workspace_id, limit } = req.query;
    const maxItems = Math.min(parseInt(limit) || 50, 200);

    let logs;
    if (workspace_id) {
      logs = db.prepare(
        `SELECT al.*, u.name as user_name, u.avatar_url as user_avatar, c.name as card_name
         FROM activity_logs al
         LEFT JOIN users u ON u.id = al.user_id
         LEFT JOIN cards c ON c.id = al.card_id
         LEFT JOIN roadmaps r ON r.id = c.roadmap_id
         WHERE r.workspace_id = ?
         ORDER BY al.created_at DESC
         LIMIT ?`
      ).all(workspace_id, maxItems);
    } else {
      logs = db.prepare(
        `SELECT al.*, u.name as user_name, u.avatar_url as user_avatar, c.name as card_name
         FROM activity_logs al
         LEFT JOIN users u ON u.id = al.user_id
         LEFT JOIN cards c ON c.id = al.card_id
         ORDER BY al.created_at DESC
         LIMIT ?`
      ).all(maxItems);
    }

    res.json(logs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/comments/activity - Log an activity
router.post("/activity", (req, res) => {
  try {
    const { card_id, user_id, action_type, action_detail } = req.body;
    if (!action_type) {
      return res.status(400).json({ error: "action_type is required" });
    }

    const id = uuidv4();
    db.prepare(
      "INSERT INTO activity_logs (id, card_id, user_id, action_type, action_detail) VALUES (?, ?, ?, ?, ?)"
    ).run(id, card_id || null, user_id || null, action_type, action_detail || null);

    const log = db.prepare("SELECT * FROM activity_logs WHERE id = ?").get(id);
    res.status(201).json(log);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
