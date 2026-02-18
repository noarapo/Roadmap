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
async function verifyRoadmapWorkspace(roadmapId, req) {
  const { rows } = await db.query("SELECT * FROM roadmaps WHERE id = $1", [roadmapId]);
  const roadmap = rows[0];
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
router.get("/roadmap/:roadmapId", async (req, res) => {
  try {
    if (!(await verifyRoadmapWorkspace(req.params.roadmapId, req))) {
      return res.status(403).json({ error: "Access denied" });
    }

    const { resolved } = req.query;
    let whereClause = "c.roadmap_id = $1 AND c.parent_comment_id IS NULL";
    const params = [req.params.roadmapId];

    if (resolved === "false") {
      whereClause += " AND c.resolved = 0";
    } else if (resolved === "true") {
      whereClause += " AND c.resolved = 1";
    }

    const { rows: threads } = await db.query(
      `SELECT c.*, u.name as user_name, u.avatar_url as user_avatar, u.email as user_email
       FROM comments c
       LEFT JOIN users u ON u.id = c.user_id
       WHERE ${whereClause}
       ORDER BY c.created_at ASC`,
      params
    );

    const result = [];
    for (const thread of threads) {
      // Fetch replies for each thread
      const { rows: replies } = await db.query(
        `SELECT c.*, u.name as user_name, u.avatar_url as user_avatar, u.email as user_email
         FROM comments c
         LEFT JOIN users u ON u.id = c.user_id
         WHERE c.parent_comment_id = $1
         ORDER BY c.created_at ASC`,
        [thread.id]
      );

      // Fetch reactions for thread
      const { rows: reactions } = await db.query(
        `SELECT cr.*, u.name as user_name
         FROM comment_reactions cr
         LEFT JOIN users u ON u.id = cr.user_id
         WHERE cr.comment_id = $1`,
        [thread.id]
      );

      // Also get reactions for each reply
      const repliesWithReactions = [];
      for (const r of replies) {
        const { rows: rReactions } = await db.query(
          `SELECT cr.*, u.name as user_name
           FROM comment_reactions cr
           LEFT JOIN users u ON u.id = cr.user_id
           WHERE cr.comment_id = $1`,
          [r.id]
        );
        repliesWithReactions.push({ ...r, reactions: rReactions });
      }

      result.push({
        ...thread,
        replies: repliesWithReactions,
        reactions,
      });
    }

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: safeError(err) });
  }
});

/* ---------- GET /api/comments/card/:cardId ---------- */
/* Legacy: get comments for a specific card */
router.get("/card/:cardId", async (req, res) => {
  try {
    // Verify card belongs to user's workspace
    const { rows: cardRows } = await db.query("SELECT * FROM cards WHERE id = $1", [req.params.cardId]);
    const card = cardRows[0];
    if (!card) return res.status(404).json({ error: "Card not found" });
    const { rows: roadmapRows } = await db.query("SELECT * FROM roadmaps WHERE id = $1", [card.roadmap_id]);
    const roadmap = roadmapRows[0];
    if (!roadmap || roadmap.workspace_id !== req.user.workspace_id) {
      return res.status(403).json({ error: "Access denied" });
    }

    const { rows: comments } = await db.query(
      `SELECT c.*, u.name as user_name, u.avatar_url as user_avatar
       FROM comments c
       LEFT JOIN users u ON u.id = c.user_id
       WHERE c.card_id = $1
       ORDER BY c.created_at ASC`,
      [req.params.cardId]
    );

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
router.post("/", async (req, res) => {
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
    if (!(await verifyRoadmapWorkspace(roadmap_id, req))) {
      return res.status(403).json({ error: "Access denied" });
    }

    const id = uuidv4();

    // Auto-assign pin number for top-level comments
    let pin_number = null;
    if (!parent_comment_id) {
      const { rows: maxPinRows } = await db.query(
        "SELECT MAX(pin_number) as max_pin FROM comments WHERE roadmap_id = $1 AND parent_comment_id IS NULL",
        [roadmap_id]
      );
      pin_number = (maxPinRows[0]?.max_pin || 0) + 1;
    }

    await db.query(
      `INSERT INTO comments (id, roadmap_id, card_id, user_id, text, parent_comment_id,
        anchor_type, anchor_row_id, anchor_sprint_id, anchor_x_pct, anchor_y_pct, pin_number)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [
        id, roadmap_id, card_id || null, user_id, sanitizeHtml(text),
        parent_comment_id || null,
        anchor_type || (card_id ? "card" : "cell"),
        anchor_row_id || null, anchor_sprint_id || null,
        anchor_x_pct ?? 50, anchor_y_pct ?? 50,
        pin_number
      ]
    );

    const { rows: commentRows } = await db.query(
      `SELECT c.*, u.name as user_name, u.avatar_url as user_avatar, u.email as user_email
       FROM comments c
       LEFT JOIN users u ON u.id = c.user_id
       WHERE c.id = $1`,
      [id]
    );
    const comment = commentRows[0];

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
router.patch("/:id", async (req, res) => {
  try {
    const { rows: commentRows } = await db.query("SELECT * FROM comments WHERE id = $1", [req.params.id]);
    const comment = commentRows[0];
    if (!comment) return res.status(404).json({ error: "Comment not found" });

    // Verify roadmap workspace
    if (!(await verifyRoadmapWorkspace(comment.roadmap_id, req))) {
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
    let paramIndex = 1;
    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        let val = req.body[key];
        if (key === "text") val = sanitizeHtml(val);
        sets.push(`${key} = $${paramIndex}`);
        values.push(val);
        paramIndex++;
      }
    }
    if (sets.length > 0) {
      values.push(req.params.id);
      await db.query(`UPDATE comments SET ${sets.join(", ")} WHERE id = $${paramIndex}`, values);
    }

    const { rows: updatedRows } = await db.query(
      `SELECT c.*, u.name as user_name, u.avatar_url as user_avatar
       FROM comments c LEFT JOIN users u ON u.id = c.user_id WHERE c.id = $1`,
      [req.params.id]
    );
    const updated = updatedRows[0];

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
router.delete("/:id", async (req, res) => {
  try {
    const { rows: commentRows } = await db.query("SELECT * FROM comments WHERE id = $1", [req.params.id]);
    const comment = commentRows[0];
    if (!comment) return res.status(404).json({ error: "Comment not found" });

    // Verify roadmap workspace
    if (!(await verifyRoadmapWorkspace(comment.roadmap_id, req))) {
      return res.status(403).json({ error: "Access denied" });
    }

    // Only owner can delete
    if (comment.user_id !== req.user.id) {
      return res.status(403).json({ error: "You can only delete your own comments" });
    }

    await db.query("DELETE FROM comments WHERE id = $1", [req.params.id]);

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
router.post("/:id/resolve", async (req, res) => {
  try {
    const { rows: commentRows } = await db.query("SELECT * FROM comments WHERE id = $1", [req.params.id]);
    const comment = commentRows[0];
    if (!comment) return res.status(404).json({ error: "Comment not found" });
    if (comment.parent_comment_id) return res.status(400).json({ error: "Can only resolve top-level threads" });

    if (!(await verifyRoadmapWorkspace(comment.roadmap_id, req))) {
      return res.status(403).json({ error: "Access denied" });
    }

    await db.query(
      "UPDATE comments SET resolved = 1, resolved_by = $1, resolved_at = NOW()::TEXT WHERE id = $2",
      [req.user.id, req.params.id]
    );

    const { rows: updatedRows } = await db.query(
      `SELECT c.*, u.name as user_name, u.avatar_url as user_avatar
       FROM comments c LEFT JOIN users u ON u.id = c.user_id WHERE c.id = $1`,
      [req.params.id]
    );
    const updated = updatedRows[0];

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
router.post("/:id/unresolve", async (req, res) => {
  try {
    const { rows: commentRows } = await db.query("SELECT * FROM comments WHERE id = $1", [req.params.id]);
    const comment = commentRows[0];
    if (!comment) return res.status(404).json({ error: "Comment not found" });

    if (!(await verifyRoadmapWorkspace(comment.roadmap_id, req))) {
      return res.status(403).json({ error: "Access denied" });
    }

    await db.query(
      "UPDATE comments SET resolved = 0, resolved_by = NULL, resolved_at = NULL WHERE id = $1",
      [req.params.id]
    );

    const { rows: updatedRows } = await db.query(
      `SELECT c.*, u.name as user_name, u.avatar_url as user_avatar
       FROM comments c LEFT JOIN users u ON u.id = c.user_id WHERE c.id = $1`,
      [req.params.id]
    );
    const updated = updatedRows[0];

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
router.post("/:id/reactions", async (req, res) => {
  try {
    const { emoji } = req.body;
    if (!emoji) return res.status(400).json({ error: "emoji is required" });

    const { rows: commentRows } = await db.query("SELECT * FROM comments WHERE id = $1", [req.params.id]);
    const comment = commentRows[0];
    if (!comment) return res.status(404).json({ error: "Comment not found" });

    if (!(await verifyRoadmapWorkspace(comment.roadmap_id, req))) {
      return res.status(403).json({ error: "Access denied" });
    }

    const id = uuidv4();
    // Toggle: if reaction already exists, remove it
    const { rows: existingRows } = await db.query(
      "SELECT id FROM comment_reactions WHERE comment_id = $1 AND user_id = $2 AND emoji = $3",
      [req.params.id, req.user.id, emoji]
    );
    const existing = existingRows[0];

    if (existing) {
      await db.query("DELETE FROM comment_reactions WHERE id = $1", [existing.id]);
    } else {
      await db.query(
        "INSERT INTO comment_reactions (id, comment_id, user_id, emoji) VALUES ($1, $2, $3, $4)",
        [id, req.params.id, req.user.id, emoji]
      );
    }

    // Return updated reactions
    const { rows: reactions } = await db.query(
      `SELECT cr.*, u.name as user_name
       FROM comment_reactions cr
       LEFT JOIN users u ON u.id = cr.user_id
       WHERE cr.comment_id = $1`,
      [req.params.id]
    );

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
router.get("/team/:workspaceId", async (req, res) => {
  try {
    // Verify workspace matches user's workspace
    if (req.params.workspaceId !== req.user.workspace_id) {
      return res.status(403).json({ error: "Access denied" });
    }

    const { rows: users } = await db.query(
      "SELECT id, name, email, avatar_url FROM users WHERE workspace_id = $1",
      [req.params.workspaceId]
    );
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: safeError(err) });
  }
});

// =====================
// ACTIVITY LOGS
// =====================

router.get("/activity/card/:cardId", async (req, res) => {
  try {
    // Verify card belongs to user's workspace
    const { rows: cardRows } = await db.query("SELECT * FROM cards WHERE id = $1", [req.params.cardId]);
    const card = cardRows[0];
    if (!card) return res.status(404).json({ error: "Card not found" });
    const { rows: roadmapRows } = await db.query("SELECT * FROM roadmaps WHERE id = $1", [card.roadmap_id]);
    const roadmap = roadmapRows[0];
    if (!roadmap || roadmap.workspace_id !== req.user.workspace_id) {
      return res.status(403).json({ error: "Access denied" });
    }

    const { rows: logs } = await db.query(
      `SELECT al.*, u.name as user_name, u.avatar_url as user_avatar
       FROM activity_logs al
       LEFT JOIN users u ON u.id = al.user_id
       WHERE al.card_id = $1
       ORDER BY al.created_at DESC
       LIMIT 50`,
      [req.params.cardId]
    );
    res.json(logs);
  } catch (err) {
    res.status(500).json({ error: safeError(err) });
  }
});

router.get("/activity/recent", async (req, res) => {
  try {
    // Always scope to user's workspace
    const workspace_id = req.user.workspace_id;
    const { limit } = req.query;
    const maxItems = Math.min(parseInt(limit) || 50, 200);

    const { rows: logs } = await db.query(
      `SELECT al.*, u.name as user_name, u.avatar_url as user_avatar, c.name as card_name
       FROM activity_logs al LEFT JOIN users u ON u.id = al.user_id
       LEFT JOIN cards c ON c.id = al.card_id LEFT JOIN roadmaps r ON r.id = c.roadmap_id
       WHERE r.workspace_id = $1 ORDER BY al.created_at DESC LIMIT $2`,
      [workspace_id, maxItems]
    );

    res.json(logs);
  } catch (err) {
    res.status(500).json({ error: safeError(err) });
  }
});

router.post("/activity", async (req, res) => {
  try {
    const { card_id, action_type, action_detail } = req.body;
    if (!action_type) return res.status(400).json({ error: "action_type is required" });

    // If card_id is provided, verify it belongs to user's workspace
    if (card_id) {
      const { rows: cardRows } = await db.query("SELECT * FROM cards WHERE id = $1", [card_id]);
      const card = cardRows[0];
      if (card) {
        const { rows: roadmapRows } = await db.query("SELECT * FROM roadmaps WHERE id = $1", [card.roadmap_id]);
        const roadmap = roadmapRows[0];
        if (!roadmap || roadmap.workspace_id !== req.user.workspace_id) {
          return res.status(403).json({ error: "Access denied" });
        }
      }
    }

    const id = uuidv4();
    await db.query(
      "INSERT INTO activity_logs (id, card_id, user_id, action_type, action_detail) VALUES ($1, $2, $3, $4, $5)",
      [id, card_id || null, req.user.id, action_type, action_detail ? sanitizeHtml(action_detail) : null]
    );
    const { rows } = await db.query("SELECT * FROM activity_logs WHERE id = $1", [id]);
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: safeError(err) });
  }
});

module.exports = router;
