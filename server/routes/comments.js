const express = require("express");
const router = express.Router();
const { v4: uuidv4 } = require("uuid");
const db = require("../models/db");
const { authMiddleware } = require("./auth");
const {
  sanitizeHtml,
  validateLength,
  MAX_COMMENT_LENGTH,
} = require("../middleware/validate");

function safeError(err) {
  if (process.env.NODE_ENV === "production") return "Internal server error";
  return err.message;
}

// All routes require authentication
router.use(authMiddleware);

// Helper: verify roadmap belongs to user's workspace
function verifyRoadmapWorkspace(roadmapId, req) {
  const roadmap = db.prepare("SELECT * FROM roadmaps WHERE id = ?").get(roadmapId);
  if (!roadmap) return null;
  if (roadmap.workspace_id !== req.user.workspace_id) return null;
  return roadmap;
}

/* ============================================================
   CANVAS COMMENTS -- Figma-style pinned comments
   Supports card-anchored and cell-anchored (row+sprint) pins.
   Threading, resolution, @mentions, emoji reactions.
   ============================================================ */

/* ---------- GET /api/comments/roadmap/:roadmapId ---------- */
/* Fetch all comments (with replies & reactions) for a roadmap */
router.get("/roadmap/:roadmapId", (req, res) => {
  try {
    if (!verifyRoadmapWorkspace(req.params.roadmapId, req)) {
      return res.status(403).json({ error: "Access denied" });
    }

    const { resolved } = req.query;
    let whereClause = "c.roadmap_id = ? AND c.parent_comment_id IS NULL";
    const params = [req.params.roadmapId];

    if (resolved === "false") {
      whereClause += " AND c.resolved = 0";
    } else if (resolved === "true") {
      whereClause += " AND c.resolved = 1";
    }

    const threads = db.prepare(
      `SELECT c.*, u.name as user_name, u.avatar_url as user_avatar, u.email as user_email
       FROM comments c
       LEFT JOIN users u ON u.id = c.user_id
       WHERE ${whereClause}
       ORDER BY c.created_at ASC`
    ).all(...params);

    // Fetch replies for each thread
    const replyStmt = db.prepare(
      `SELECT c.*, u.name as user_name, u.avatar_url as user_avatar, u.email as user_email
       FROM comments c
       LEFT JOIN users u ON u.id = c.user_id
       WHERE c.parent_comment_id = ?
       ORDER BY c.created_at ASC`
    );

    // Fetch reactions
    const reactionStmt = db.prepare(
      `SELECT cr.*, u.name as user_name
       FROM comment_reactions cr
       LEFT JOIN users u ON u.id = cr.user_id
       WHERE cr.comment_id = ?`
    );

    const result = threads.map((thread) => {
      const replies = replyStmt.all(thread.id);
      const reactions = reactionStmt.all(thread.id);

      // Also get reactions for each reply
      const repliesWithReactions = replies.map((r) => ({
        ...r,
        reactions: reactionStmt.all(r.id),
      }));

      return {
        ...thread,
        replies: repliesWithReactions,
        reactions,
      };
    });

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: safeError(err) });
  }
});

/* ---------- GET /api/comments/card/:cardId ---------- */
/* Legacy: get comments for a specific card */
router.get("/card/:cardId", (req, res) => {
  try {
    // Verify card belongs to user's workspace
    const card = db.prepare("SELECT * FROM cards WHERE id = ?").get(req.params.cardId);
    if (!card) return res.status(404).json({ error: "Card not found" });
    const roadmap = db.prepare("SELECT * FROM roadmaps WHERE id = ?").get(card.roadmap_id);
    if (!roadmap || roadmap.workspace_id !== req.user.workspace_id) {
      return res.status(403).json({ error: "Access denied" });
    }

    const comments = db.prepare(
      `SELECT c.*, u.name as user_name, u.avatar_url as user_avatar
       FROM comments c
       LEFT JOIN users u ON u.id = c.user_id
       WHERE c.card_id = ?
       ORDER BY c.created_at ASC`
    ).all(req.params.cardId);

    const topLevel = comments.filter((c) => !c.parent_comment_id);
    const replies = comments.filter((c) => c.parent_comment_id);

    const threaded = topLevel.map((comment) => ({
      ...comment,
      replies: replies.filter((r) => r.parent_comment_id === comment.id),
    }));

    res.json(threaded);
  } catch (err) {
    res.status(500).json({ error: safeError(err) });
  }
});

/* ---------- POST /api/comments ---------- */
/* Create a new comment thread or reply */
router.post("/", (req, res) => {
  try {
    const {
      roadmap_id, card_id, text, parent_comment_id,
      anchor_type, anchor_row_id, anchor_sprint_id,
      anchor_x_pct, anchor_y_pct,
    } = req.body;
    const user_id = req.user.id;

    if (!text || !roadmap_id) {
      return res.status(400).json({ error: "roadmap_id and text are required" });
    }

    const textErr = validateLength(text, "Comment text", MAX_COMMENT_LENGTH);
    if (textErr) return res.status(400).json({ error: textErr });

    // Verify roadmap belongs to user's workspace
    if (!verifyRoadmapWorkspace(roadmap_id, req)) {
      return res.status(403).json({ error: "Access denied" });
    }

    const id = uuidv4();

    // Auto-assign pin number for top-level comments
    let pin_number = null;
    if (!parent_comment_id) {
      const maxPin = db.prepare(
        "SELECT MAX(pin_number) as max_pin FROM comments WHERE roadmap_id = ? AND parent_comment_id IS NULL"
      ).get(roadmap_id);
      pin_number = (maxPin?.max_pin || 0) + 1;
    }

    db.prepare(
      `INSERT INTO comments (id, roadmap_id, card_id, user_id, text, parent_comment_id,
        anchor_type, anchor_row_id, anchor_sprint_id, anchor_x_pct, anchor_y_pct, pin_number)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id, roadmap_id, card_id || null, user_id, sanitizeHtml(text),
      parent_comment_id || null,
      anchor_type || (card_id ? "card" : "cell"),
      anchor_row_id || null, anchor_sprint_id || null,
      anchor_x_pct ?? 50, anchor_y_pct ?? 50,
      pin_number
    );

    const comment = db.prepare(
      `SELECT c.*, u.name as user_name, u.avatar_url as user_avatar, u.email as user_email
       FROM comments c
       LEFT JOIN users u ON u.id = c.user_id
       WHERE c.id = ?`
    ).get(id);

    comment.replies = [];
    comment.reactions = [];

    // Broadcast via WebSocket
    const broadcast = req.app.locals.broadcast;
    if (broadcast) {
      broadcast(roadmap_id, {
        type: "comment_added",
        comment,
        timestamp: new Date().toISOString(),
      });
    }

    res.status(201).json(comment);
  } catch (err) {
    res.status(500).json({ error: safeError(err) });
  }
});

/* ---------- PATCH /api/comments/:id ---------- */
/* Update comment text */
router.patch("/:id", (req, res) => {
  try {
    const comment = db.prepare("SELECT * FROM comments WHERE id = ?").get(req.params.id);
    if (!comment) return res.status(404).json({ error: "Comment not found" });

    // Verify roadmap workspace
    if (!verifyRoadmapWorkspace(comment.roadmap_id, req)) {
      return res.status(403).json({ error: "Access denied" });
    }

    // Only owner can edit
    if (comment.user_id !== req.user.id) {
      return res.status(403).json({ error: "You can only edit your own comments" });
    }

    if (req.body.text !== undefined) {
      const textErr = validateLength(req.body.text, "Comment text", MAX_COMMENT_LENGTH);
      if (textErr) return res.status(400).json({ error: textErr });
    }

    const allowed = ["text", "anchor_row_id", "anchor_sprint_id", "anchor_x_pct", "anchor_y_pct"];
    const sets = [];
    const values = [];
    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        let val = req.body[key];
        if (key === "text") val = sanitizeHtml(val);
        sets.push(`${key} = ?`);
        values.push(val);
      }
    }
    if (sets.length > 0) {
      values.push(req.params.id);
      db.prepare(`UPDATE comments SET ${sets.join(", ")} WHERE id = ?`).run(...values);
    }

    const updated = db.prepare(
      `SELECT c.*, u.name as user_name, u.avatar_url as user_avatar
       FROM comments c LEFT JOIN users u ON u.id = c.user_id WHERE c.id = ?`
    ).get(req.params.id);

    // Broadcast
    const broadcast = req.app.locals.broadcast;
    if (broadcast && comment.roadmap_id) {
      broadcast(comment.roadmap_id, {
        type: "comment_updated",
        comment: updated,
        timestamp: new Date().toISOString(),
      });
    }

    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: safeError(err) });
  }
});

/* ---------- DELETE /api/comments/:id ---------- */
router.delete("/:id", (req, res) => {
  try {
    const comment = db.prepare("SELECT * FROM comments WHERE id = ?").get(req.params.id);
    if (!comment) return res.status(404).json({ error: "Comment not found" });

    // Verify roadmap workspace
    if (!verifyRoadmapWorkspace(comment.roadmap_id, req)) {
      return res.status(403).json({ error: "Access denied" });
    }

    // Only owner can delete
    if (comment.user_id !== req.user.id) {
      return res.status(403).json({ error: "You can only delete your own comments" });
    }

    db.prepare("DELETE FROM comments WHERE id = ?").run(req.params.id);

    // Broadcast
    const broadcast = req.app.locals.broadcast;
    if (broadcast && comment.roadmap_id) {
      broadcast(comment.roadmap_id, {
        type: "comment_deleted",
        commentId: req.params.id,
        parentCommentId: comment.parent_comment_id,
        timestamp: new Date().toISOString(),
      });
    }

    res.status(204).end();
  } catch (err) {
    res.status(500).json({ error: safeError(err) });
  }
});

/* ---------- POST /api/comments/:id/resolve ---------- */
router.post("/:id/resolve", (req, res) => {
  try {
    const comment = db.prepare("SELECT * FROM comments WHERE id = ?").get(req.params.id);
    if (!comment) return res.status(404).json({ error: "Comment not found" });
    if (comment.parent_comment_id) return res.status(400).json({ error: "Can only resolve top-level threads" });

    if (!verifyRoadmapWorkspace(comment.roadmap_id, req)) {
      return res.status(403).json({ error: "Access denied" });
    }

    db.prepare(
      "UPDATE comments SET resolved = 1, resolved_by = ?, resolved_at = datetime('now') WHERE id = ?"
    ).run(req.user.id, req.params.id);

    const updated = db.prepare(
      `SELECT c.*, u.name as user_name, u.avatar_url as user_avatar
       FROM comments c LEFT JOIN users u ON u.id = c.user_id WHERE c.id = ?`
    ).get(req.params.id);

    const broadcast = req.app.locals.broadcast;
    if (broadcast && comment.roadmap_id) {
      broadcast(comment.roadmap_id, {
        type: "comment_resolved",
        commentId: req.params.id,
        resolvedBy: req.user.id,
        timestamp: new Date().toISOString(),
      });
    }

    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: safeError(err) });
  }
});

/* ---------- POST /api/comments/:id/unresolve ---------- */
router.post("/:id/unresolve", (req, res) => {
  try {
    const comment = db.prepare("SELECT * FROM comments WHERE id = ?").get(req.params.id);
    if (!comment) return res.status(404).json({ error: "Comment not found" });

    if (!verifyRoadmapWorkspace(comment.roadmap_id, req)) {
      return res.status(403).json({ error: "Access denied" });
    }

    db.prepare(
      "UPDATE comments SET resolved = 0, resolved_by = NULL, resolved_at = NULL WHERE id = ?"
    ).run(req.params.id);

    const updated = db.prepare(
      `SELECT c.*, u.name as user_name, u.avatar_url as user_avatar
       FROM comments c LEFT JOIN users u ON u.id = c.user_id WHERE c.id = ?`
    ).get(req.params.id);

    const broadcast = req.app.locals.broadcast;
    if (broadcast && comment.roadmap_id) {
      broadcast(comment.roadmap_id, {
        type: "comment_unresolved",
        commentId: req.params.id,
        timestamp: new Date().toISOString(),
      });
    }

    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: safeError(err) });
  }
});

/* ---------- POST /api/comments/:id/reactions ---------- */
router.post("/:id/reactions", (req, res) => {
  try {
    const { emoji } = req.body;
    if (!emoji) return res.status(400).json({ error: "emoji is required" });

    const comment = db.prepare("SELECT * FROM comments WHERE id = ?").get(req.params.id);
    if (!comment) return res.status(404).json({ error: "Comment not found" });

    if (!verifyRoadmapWorkspace(comment.roadmap_id, req)) {
      return res.status(403).json({ error: "Access denied" });
    }

    const id = uuidv4();
    // Toggle: if reaction already exists, remove it
    const existing = db.prepare(
      "SELECT id FROM comment_reactions WHERE comment_id = ? AND user_id = ? AND emoji = ?"
    ).get(req.params.id, req.user.id, emoji);

    if (existing) {
      db.prepare("DELETE FROM comment_reactions WHERE id = ?").run(existing.id);
    } else {
      db.prepare(
        "INSERT INTO comment_reactions (id, comment_id, user_id, emoji) VALUES (?, ?, ?, ?)"
      ).run(id, req.params.id, req.user.id, emoji);
    }

    // Return updated reactions
    const reactions = db.prepare(
      `SELECT cr.*, u.name as user_name
       FROM comment_reactions cr
       LEFT JOIN users u ON u.id = cr.user_id
       WHERE cr.comment_id = ?`
    ).all(req.params.id);

    const broadcast = req.app.locals.broadcast;
    if (broadcast && comment.roadmap_id) {
      broadcast(comment.roadmap_id, {
        type: "comment_reaction",
        commentId: req.params.id,
        reactions,
        timestamp: new Date().toISOString(),
      });
    }

    res.json(reactions);
  } catch (err) {
    res.status(500).json({ error: safeError(err) });
  }
});

/* ---------- GET /api/comments/team/:workspaceId ---------- */
/* Get team members for @mention autocomplete */
router.get("/team/:workspaceId", (req, res) => {
  try {
    // Verify workspace matches user's workspace
    if (req.params.workspaceId !== req.user.workspace_id) {
      return res.status(403).json({ error: "Access denied" });
    }

    const users = db.prepare(
      "SELECT id, name, email, avatar_url FROM users WHERE workspace_id = ?"
    ).all(req.params.workspaceId);
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: safeError(err) });
  }
});

// =====================
// ACTIVITY LOGS
// =====================

router.get("/activity/card/:cardId", (req, res) => {
  try {
    // Verify card belongs to user's workspace
    const card = db.prepare("SELECT * FROM cards WHERE id = ?").get(req.params.cardId);
    if (!card) return res.status(404).json({ error: "Card not found" });
    const roadmap = db.prepare("SELECT * FROM roadmaps WHERE id = ?").get(card.roadmap_id);
    if (!roadmap || roadmap.workspace_id !== req.user.workspace_id) {
      return res.status(403).json({ error: "Access denied" });
    }

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
    res.status(500).json({ error: safeError(err) });
  }
});

router.get("/activity/recent", (req, res) => {
  try {
    // Always scope to user's workspace
    const workspace_id = req.user.workspace_id;
    const { limit } = req.query;
    const maxItems = Math.min(parseInt(limit) || 50, 200);

    const logs = db.prepare(
      `SELECT al.*, u.name as user_name, u.avatar_url as user_avatar, c.name as card_name
       FROM activity_logs al LEFT JOIN users u ON u.id = al.user_id
       LEFT JOIN cards c ON c.id = al.card_id LEFT JOIN roadmaps r ON r.id = c.roadmap_id
       WHERE r.workspace_id = ? ORDER BY al.created_at DESC LIMIT ?`
    ).all(workspace_id, maxItems);

    res.json(logs);
  } catch (err) {
    res.status(500).json({ error: safeError(err) });
  }
});

router.post("/activity", (req, res) => {
  try {
    const { card_id, action_type, action_detail } = req.body;
    if (!action_type) return res.status(400).json({ error: "action_type is required" });

    // If card_id is provided, verify it belongs to user's workspace
    if (card_id) {
      const card = db.prepare("SELECT * FROM cards WHERE id = ?").get(card_id);
      if (card) {
        const roadmap = db.prepare("SELECT * FROM roadmaps WHERE id = ?").get(card.roadmap_id);
        if (!roadmap || roadmap.workspace_id !== req.user.workspace_id) {
          return res.status(403).json({ error: "Access denied" });
        }
      }
    }

    const id = uuidv4();
    db.prepare(
      "INSERT INTO activity_logs (id, card_id, user_id, action_type, action_detail) VALUES (?, ?, ?, ?, ?)"
    ).run(id, card_id || null, req.user.id, action_type, action_detail ? sanitizeHtml(action_detail) : null);
    const log = db.prepare("SELECT * FROM activity_logs WHERE id = ?").get(id);
    res.status(201).json(log);
  } catch (err) {
    res.status(500).json({ error: safeError(err) });
  }
});

module.exports = router;
