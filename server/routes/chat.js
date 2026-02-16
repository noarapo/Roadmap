const express = require("express");
const router = express.Router();
const { v4: uuidv4 } = require("uuid");
const db = require("../models/db");
const authMiddleware = require("./auth").authMiddleware;
const { streamAI } = require("../services/ai");

/* ============================================================
   Chat Routes — Roadway AI
   All routes require authentication.
   ============================================================ */

router.use(authMiddleware);

/* ---------- Conversations ---------- */

// GET /api/chat/conversations — List user's conversations
router.get("/conversations", (req, res) => {
  try {
    const conversations = db.prepare(
      "SELECT * FROM conversations WHERE user_id = ? ORDER BY updated_at DESC"
    ).all(req.user.id);
    res.json(conversations);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/chat/conversations — Create new conversation
router.post("/conversations", (req, res) => {
  try {
    const id = uuidv4();
    const title = req.body.title || "New conversation";
    db.prepare(
      "INSERT INTO conversations (id, user_id, title) VALUES (?, ?, ?)"
    ).run(id, req.user.id, title);

    const conversation = db.prepare("SELECT * FROM conversations WHERE id = ?").get(id);
    res.status(201).json(conversation);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/chat/conversations/:id — Delete conversation
router.delete("/conversations/:id", (req, res) => {
  try {
    const conv = db.prepare(
      "SELECT * FROM conversations WHERE id = ? AND user_id = ?"
    ).get(req.params.id, req.user.id);
    if (!conv) return res.status(404).json({ error: "Conversation not found" });

    db.prepare("DELETE FROM conversations WHERE id = ?").run(req.params.id);
    res.status(204).end();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ---------- Messages ---------- */

// GET /api/chat/conversations/:id/messages — Get messages in a conversation
router.get("/conversations/:id/messages", (req, res) => {
  try {
    const conv = db.prepare(
      "SELECT * FROM conversations WHERE id = ? AND user_id = ?"
    ).get(req.params.id, req.user.id);
    if (!conv) return res.status(404).json({ error: "Conversation not found" });

    const messages = db.prepare(
      "SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC"
    ).all(req.params.id);

    // Attach actions to each assistant message
    const messagesWithActions = messages.map((m) => {
      if (m.role === "assistant") {
        const actions = db.prepare(
          "SELECT * FROM message_actions WHERE message_id = ?"
        ).all(m.id);
        return { ...m, actions };
      }
      return { ...m, actions: [] };
    });

    res.json(messagesWithActions);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/chat/conversations/:id/messages — Send message and stream AI response
router.post("/conversations/:id/messages", async (req, res) => {
  try {
    const conv = db.prepare(
      "SELECT * FROM conversations WHERE id = ? AND user_id = ?"
    ).get(req.params.id, req.user.id);
    if (!conv) return res.status(404).json({ error: "Conversation not found" });

    const { content, provider } = req.body;
    if (!content || !content.trim()) {
      return res.status(400).json({ error: "Message content is required" });
    }

    const aiProvider = provider || "claude";

    // Save user message
    const userMsgId = uuidv4();
    db.prepare(
      "INSERT INTO messages (id, conversation_id, role, content) VALUES (?, ?, 'user', ?)"
    ).run(userMsgId, req.params.id, content.trim());

    // Update conversation title from first message
    const msgCount = db.prepare(
      "SELECT COUNT(*) as cnt FROM messages WHERE conversation_id = ?"
    ).get(req.params.id);
    if (msgCount.cnt === 1) {
      const title = content.trim().substring(0, 60) + (content.trim().length > 60 ? "..." : "");
      db.prepare("UPDATE conversations SET title = ? WHERE id = ?").run(title, req.params.id);
    }

    // Update conversation timestamp
    db.prepare(
      "UPDATE conversations SET updated_at = datetime('now') WHERE id = ?"
    ).run(req.params.id);

    // Load conversation history for AI context
    const history = db.prepare(
      "SELECT role, content FROM messages WHERE conversation_id = ? ORDER BY created_at ASC"
    ).all(req.params.id);

    // Set up SSE
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });

    const assistantMsgId = uuidv4();
    let fullText = "";
    const pendingActions = [];

    try {
      await streamAI(
        aiProvider,
        history,
        req.user.id,
        // onToken
        (token) => {
          fullText += token;
          res.write(`data: ${JSON.stringify({ type: "token", text: token })}\n\n`);
        },
        // onToolUse
        (toolUse) => {
          const actionId = uuidv4();
          pendingActions.push({
            id: actionId,
            toolUseId: toolUse.id,
            name: toolUse.name,
            input: toolUse.input,
          });
          res.write(`data: ${JSON.stringify({
            type: "action",
            id: actionId,
            action_type: toolUse.name,
            action_payload: toolUse.input,
            status: "pending",
          })}\n\n`);
        },
        // onDone
        ({ text, toolUses, inputTokens, outputTokens }) => {
          // Save assistant message
          const msgContent = text || "(action proposed)";
          db.prepare(
            "INSERT INTO messages (id, conversation_id, role, content, provider) VALUES (?, ?, 'assistant', ?, ?)"
          ).run(assistantMsgId, req.params.id, msgContent, aiProvider);

          // Save pending actions
          for (const action of pendingActions) {
            db.prepare(
              "INSERT INTO message_actions (id, message_id, action_type, action_payload, status) VALUES (?, ?, ?, ?, 'pending')"
            ).run(action.id, assistantMsgId, action.name, JSON.stringify(action.input));
          }

          // Track usage
          const usageId = uuidv4();
          db.prepare(
            "INSERT INTO ai_usage (id, user_id, conversation_id, message_id, provider, input_tokens, output_tokens) VALUES (?, ?, ?, ?, ?, ?, ?)"
          ).run(usageId, req.user.id, req.params.id, assistantMsgId, aiProvider, inputTokens, outputTokens);

          res.write(`data: ${JSON.stringify({
            type: "done",
            message_id: assistantMsgId,
            input_tokens: inputTokens,
            output_tokens: outputTokens,
          })}\n\n`);

          res.end();
        }
      );
    } catch (aiError) {
      // Save error as assistant message
      const errorText = `Sorry, I encountered an error: ${aiError.message}`;
      db.prepare(
        "INSERT INTO messages (id, conversation_id, role, content, provider) VALUES (?, ?, 'assistant', ?, ?)"
      ).run(assistantMsgId, req.params.id, errorText, aiProvider);

      res.write(`data: ${JSON.stringify({ type: "error", error: aiError.message })}\n\n`);
      res.end();
    }
  } catch (err) {
    if (!res.headersSent) {
      res.status(500).json({ error: err.message });
    } else {
      res.write(`data: ${JSON.stringify({ type: "error", error: err.message })}\n\n`);
      res.end();
    }
  }
});

/* ---------- Actions ---------- */

// PATCH /api/chat/actions/:id — Confirm or reject an action
router.patch("/actions/:id", async (req, res) => {
  try {
    const action = db.prepare("SELECT * FROM message_actions WHERE id = ?").get(req.params.id);
    if (!action) return res.status(404).json({ error: "Action not found" });

    // Verify the action belongs to the user's conversation
    const message = db.prepare("SELECT * FROM messages WHERE id = ?").get(action.message_id);
    if (!message) return res.status(404).json({ error: "Message not found" });
    const conv = db.prepare(
      "SELECT * FROM conversations WHERE id = ? AND user_id = ?"
    ).get(message.conversation_id, req.user.id);
    if (!conv) return res.status(403).json({ error: "Access denied" });

    const { status } = req.body;
    if (!["confirmed", "rejected"].includes(status)) {
      return res.status(400).json({ error: "Status must be 'confirmed' or 'rejected'" });
    }

    if (status === "confirmed") {
      // Execute the action
      const payload = JSON.parse(action.action_payload);
      let result;

      switch (action.action_type) {
        case "create_card": {
          const cardId = uuidv4();
          const maxOrder = db.prepare(
            "SELECT COALESCE(MAX(sort_order), -1) + 1 as next_order FROM cards WHERE roadmap_id = ?"
          ).get(payload.roadmap_id);

          db.prepare(
            `INSERT INTO cards (id, roadmap_id, row_id, name, description, status, start_sprint_id, end_sprint_id, sort_order)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
          ).run(
            cardId, payload.roadmap_id, payload.row_id || null,
            payload.name, payload.description || null,
            payload.status || "placeholder",
            payload.sprint_id || null, payload.sprint_id || null,
            maxOrder.next_order
          );
          result = db.prepare("SELECT * FROM cards WHERE id = ?").get(cardId);
          break;
        }
        case "edit_card": {
          const allowed = ["name", "description", "status", "effort", "headcount"];
          const sets = [];
          const values = [];
          for (const key of allowed) {
            if (payload[key] !== undefined) {
              sets.push(`${key} = ?`);
              values.push(payload[key]);
            }
          }
          if (sets.length > 0) {
            values.push(payload.card_id);
            db.prepare(`UPDATE cards SET ${sets.join(", ")} WHERE id = ?`).run(...values);
          }
          result = db.prepare("SELECT * FROM cards WHERE id = ?").get(payload.card_id);
          break;
        }
        case "move_card": {
          const moveSets = [];
          const moveVals = [];
          if (payload.row_id) { moveSets.push("row_id = ?"); moveVals.push(payload.row_id); }
          if (payload.start_sprint_id) { moveSets.push("start_sprint_id = ?"); moveVals.push(payload.start_sprint_id); }
          if (payload.end_sprint_id) { moveSets.push("end_sprint_id = ?"); moveVals.push(payload.end_sprint_id); }
          if (moveSets.length > 0) {
            moveVals.push(payload.card_id);
            db.prepare(`UPDATE cards SET ${moveSets.join(", ")} WHERE id = ?`).run(...moveVals);
          }
          result = db.prepare("SELECT * FROM cards WHERE id = ?").get(payload.card_id);
          break;
        }
        case "delete_card": {
          result = db.prepare("SELECT * FROM cards WHERE id = ?").get(payload.card_id);
          db.prepare("DELETE FROM cards WHERE id = ?").run(payload.card_id);
          break;
        }
        default:
          return res.status(400).json({ error: `Unknown action type: ${action.action_type}` });
      }

      db.prepare(
        "UPDATE message_actions SET status = 'confirmed', executed_at = datetime('now') WHERE id = ?"
      ).run(req.params.id);

      res.json({ status: "confirmed", result });
    } else {
      // Rejected
      db.prepare("UPDATE message_actions SET status = 'rejected' WHERE id = ?").run(req.params.id);
      res.json({ status: "rejected" });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ---------- Usage ---------- */

// GET /api/chat/usage — Get usage stats for current user
router.get("/usage", (req, res) => {
  try {
    const total = db.prepare(
      `SELECT
        COUNT(*) as total_messages,
        COALESCE(SUM(input_tokens), 0) as total_input_tokens,
        COALESCE(SUM(output_tokens), 0) as total_output_tokens,
        COUNT(DISTINCT conversation_id) as total_conversations
       FROM ai_usage WHERE user_id = ?`
    ).get(req.user.id);

    const thisMonth = db.prepare(
      `SELECT
        COUNT(*) as messages,
        COALESCE(SUM(input_tokens), 0) as input_tokens,
        COALESCE(SUM(output_tokens), 0) as output_tokens
       FROM ai_usage
       WHERE user_id = ? AND created_at >= date('now', 'start of month')`
    ).get(req.user.id);

    const byProvider = db.prepare(
      `SELECT provider, COUNT(*) as messages,
        COALESCE(SUM(input_tokens), 0) as input_tokens,
        COALESCE(SUM(output_tokens), 0) as output_tokens
       FROM ai_usage WHERE user_id = ? GROUP BY provider`
    ).all(req.user.id);

    res.json({ total, thisMonth, byProvider });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
