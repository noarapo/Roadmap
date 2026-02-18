const express = require("express");
const router = express.Router();
const { v4: uuidv4 } = require("uuid");
const multer = require("multer");
const path = require("path");
const XLSX = require("xlsx");
const db = require("../models/db");
const authMiddleware = require("./auth").authMiddleware;
const { streamAI, extractFeaturesFromFile } = require("../services/ai");
const {
  sanitizeHtml,
  validateLength,
  MAX_NAME_LENGTH,
  MAX_DESCRIPTION_LENGTH,
} = require("../middleware/validate");

/* ---------- Multer config for file uploads ---------- */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
});

function safeError(err) {
  if (process.env.NODE_ENV === "production") return "Internal server error";
  return err.message;
}

/* ============================================================
   Chat Routes -- Roadway AI
   All routes require authentication.
   ============================================================ */

router.use(authMiddleware);

/* ---------- Conversations ---------- */

// GET /api/chat/conversations -- List user's conversations
router.get("/conversations", async (req, res) => {
  try {
    const { rows: conversations } = await db.query(
      "SELECT * FROM conversations WHERE user_id = $1 ORDER BY updated_at DESC",
      [req.user.id]
    );
    res.json(conversations);
  } catch (err) {
    res.status(500).json({ error: safeError(err) });
  }
});

// POST /api/chat/conversations -- Create new conversation
router.post("/conversations", async (req, res) => {
  try {
    const id = uuidv4();
    let title = req.body.title || "New conversation";
    const titleErr = validateLength(title, "Title", MAX_NAME_LENGTH);
    if (titleErr) return res.status(400).json({ error: titleErr });
    title = sanitizeHtml(title);

    const { rows } = await db.query(
      "INSERT INTO conversations (id, user_id, title) VALUES ($1, $2, $3) RETURNING *",
      [id, req.user.id, title]
    );

    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: safeError(err) });
  }
});

// DELETE /api/chat/conversations/:id -- Delete conversation
router.delete("/conversations/:id", async (req, res) => {
  try {
    const { rows } = await db.query(
      "SELECT * FROM conversations WHERE id = $1 AND user_id = $2",
      [req.params.id, req.user.id]
    );
    if (!rows[0]) return res.status(404).json({ error: "Conversation not found" });

    await db.query("DELETE FROM conversations WHERE id = $1", [req.params.id]);
    res.status(204).end();
  } catch (err) {
    res.status(500).json({ error: safeError(err) });
  }
});

/* ---------- Messages ---------- */

// GET /api/chat/conversations/:id/messages -- Get messages in a conversation
router.get("/conversations/:id/messages", async (req, res) => {
  try {
    const { rows: convRows } = await db.query(
      "SELECT * FROM conversations WHERE id = $1 AND user_id = $2",
      [req.params.id, req.user.id]
    );
    if (!convRows[0]) return res.status(404).json({ error: "Conversation not found" });

    const { rows: messages } = await db.query(
      "SELECT * FROM messages WHERE conversation_id = $1 ORDER BY created_at ASC",
      [req.params.id]
    );

    // Attach actions to each assistant message
    const messagesWithActions = [];
    for (const m of messages) {
      if (m.role === "assistant") {
        const { rows: actions } = await db.query(
          "SELECT * FROM message_actions WHERE message_id = $1",
          [m.id]
        );
        messagesWithActions.push({ ...m, actions });
      } else {
        messagesWithActions.push({ ...m, actions: [] });
      }
    }

    res.json(messagesWithActions);
  } catch (err) {
    res.status(500).json({ error: safeError(err) });
  }
});

// POST /api/chat/conversations/:id/messages -- Send message and stream AI response
router.post("/conversations/:id/messages", async (req, res) => {
  try {
    const { rows: convRows } = await db.query(
      "SELECT * FROM conversations WHERE id = $1 AND user_id = $2",
      [req.params.id, req.user.id]
    );
    if (!convRows[0]) return res.status(404).json({ error: "Conversation not found" });

    const { content, provider } = req.body;
    if (!content || !content.trim()) {
      return res.status(400).json({ error: "Message content is required" });
    }

    const contentErr = validateLength(content, "Message content", MAX_DESCRIPTION_LENGTH);
    if (contentErr) return res.status(400).json({ error: contentErr });

    const aiProvider = provider || "claude";

    // Save user message
    const userMsgId = uuidv4();
    await db.query(
      "INSERT INTO messages (id, conversation_id, role, content) VALUES ($1, $2, 'user', $3)",
      [userMsgId, req.params.id, content.trim()]
    );

    // Update conversation title from first message
    const { rows: countRows } = await db.query(
      "SELECT COUNT(*) as cnt FROM messages WHERE conversation_id = $1",
      [req.params.id]
    );
    if (parseInt(countRows[0].cnt, 10) === 1) {
      const title = content.trim().substring(0, 60) + (content.trim().length > 60 ? "..." : "");
      await db.query("UPDATE conversations SET title = $1 WHERE id = $2", [title, req.params.id]);
    }

    // Update conversation timestamp
    await db.query(
      "UPDATE conversations SET updated_at = NOW() WHERE id = $1",
      [req.params.id]
    );

    // Load conversation history for AI context
    const { rows: history } = await db.query(
      "SELECT role, content FROM messages WHERE conversation_id = $1 ORDER BY created_at ASC",
      [req.params.id]
    );

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
        async ({ text, toolUses, inputTokens, outputTokens }) => {
          // Save assistant message
          const msgContent = text || "(action proposed)";
          await db.query(
            "INSERT INTO messages (id, conversation_id, role, content, provider) VALUES ($1, $2, 'assistant', $3, $4)",
            [assistantMsgId, req.params.id, msgContent, aiProvider]
          );

          // Save pending actions
          for (const action of pendingActions) {
            await db.query(
              "INSERT INTO message_actions (id, message_id, action_type, action_payload, status) VALUES ($1, $2, $3, $4, 'pending')",
              [action.id, assistantMsgId, action.name, JSON.stringify(action.input)]
            );
          }

          // Track usage
          const usageId = uuidv4();
          await db.query(
            "INSERT INTO ai_usage (id, user_id, conversation_id, message_id, provider, input_tokens, output_tokens) VALUES ($1, $2, $3, $4, $5, $6, $7)",
            [usageId, req.user.id, req.params.id, assistantMsgId, aiProvider, inputTokens, outputTokens]
          );

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
      const errorText = "Sorry, I encountered an error processing your request.";
      await db.query(
        "INSERT INTO messages (id, conversation_id, role, content, provider) VALUES ($1, $2, 'assistant', $3, $4)",
        [assistantMsgId, req.params.id, errorText, aiProvider]
      );

      res.write(`data: ${JSON.stringify({ type: "error", error: process.env.NODE_ENV === "production" ? "AI service error" : aiError.message })}\n\n`);
      res.end();
    }
  } catch (err) {
    if (!res.headersSent) {
      res.status(500).json({ error: safeError(err) });
    } else {
      res.write(`data: ${JSON.stringify({ type: "error", error: safeError(err) })}\n\n`);
      res.end();
    }
  }
});

/* ---------- Actions ---------- */

// PATCH /api/chat/actions/:id -- Confirm or reject an action
router.patch("/actions/:id", async (req, res) => {
  try {
    const { rows: actionRows } = await db.query(
      "SELECT * FROM message_actions WHERE id = $1", [req.params.id]
    );
    const action = actionRows[0];
    if (!action) return res.status(404).json({ error: "Action not found" });

    // Verify the action belongs to the user's conversation
    const { rows: messageRows } = await db.query(
      "SELECT * FROM messages WHERE id = $1", [action.message_id]
    );
    const message = messageRows[0];
    if (!message) return res.status(404).json({ error: "Message not found" });

    const { rows: convRows } = await db.query(
      "SELECT * FROM conversations WHERE id = $1 AND user_id = $2",
      [message.conversation_id, req.user.id]
    );
    if (!convRows[0]) return res.status(403).json({ error: "Access denied" });

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
          // Verify roadmap belongs to user's workspace
          const { rows: roadmapRows } = await db.query(
            "SELECT * FROM roadmaps WHERE id = $1", [payload.roadmap_id]
          );
          const roadmap = roadmapRows[0];
          if (!roadmap || roadmap.workspace_id !== req.user.workspace_id) {
            return res.status(403).json({ error: "Access denied" });
          }

          const cardId = uuidv4();
          const { rows: maxOrderRows } = await db.query(
            "SELECT COALESCE(MAX(sort_order), -1) + 1 as next_order FROM cards WHERE roadmap_id = $1",
            [payload.roadmap_id]
          );

          await db.query(
            `INSERT INTO cards (id, roadmap_id, row_id, name, description, status, start_sprint_id, end_sprint_id, sort_order)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
            [
              cardId, payload.roadmap_id, payload.row_id || null,
              sanitizeHtml(payload.name), payload.description ? sanitizeHtml(payload.description) : null,
              payload.status || "placeholder",
              payload.sprint_id || null, payload.sprint_id || null,
              maxOrderRows[0].next_order
            ]
          );
          const { rows: cardRows } = await db.query("SELECT * FROM cards WHERE id = $1", [cardId]);
          result = cardRows[0];
          break;
        }
        case "edit_card": {
          // Verify card belongs to user's workspace
          const { rows: editCardRows } = await db.query(
            "SELECT * FROM cards WHERE id = $1", [payload.card_id]
          );
          const editCard = editCardRows[0];
          if (editCard) {
            const { rows: roadmapRows } = await db.query(
              "SELECT * FROM roadmaps WHERE id = $1", [editCard.roadmap_id]
            );
            const roadmap = roadmapRows[0];
            if (!roadmap || roadmap.workspace_id !== req.user.workspace_id) {
              return res.status(403).json({ error: "Access denied" });
            }
          }

          const allowed = ["name", "description", "status", "effort", "headcount"];
          const sets = [];
          const values = [];
          let paramIndex = 1;
          for (const key of allowed) {
            if (payload[key] !== undefined) {
              let val = payload[key];
              if (key === "name") val = sanitizeHtml(val);
              if (key === "description" && val !== null) val = sanitizeHtml(val);
              sets.push(`${key} = $${paramIndex}`);
              values.push(val);
              paramIndex++;
            }
          }
          if (sets.length > 0) {
            values.push(payload.card_id);
            await db.query(
              `UPDATE cards SET ${sets.join(", ")} WHERE id = $${paramIndex}`,
              values
            );
          }
          const { rows: updatedCardRows } = await db.query(
            "SELECT * FROM cards WHERE id = $1", [payload.card_id]
          );
          result = updatedCardRows[0];
          break;
        }
        case "move_card": {
          const { rows: moveCardRows } = await db.query(
            "SELECT * FROM cards WHERE id = $1", [payload.card_id]
          );
          const moveCard = moveCardRows[0];
          if (moveCard) {
            const { rows: roadmapRows } = await db.query(
              "SELECT * FROM roadmaps WHERE id = $1", [moveCard.roadmap_id]
            );
            const roadmap = roadmapRows[0];
            if (!roadmap || roadmap.workspace_id !== req.user.workspace_id) {
              return res.status(403).json({ error: "Access denied" });
            }
          }

          const moveSets = [];
          const moveVals = [];
          let moveParamIndex = 1;
          if (payload.row_id) { moveSets.push(`row_id = $${moveParamIndex}`); moveVals.push(payload.row_id); moveParamIndex++; }
          if (payload.start_sprint_id) { moveSets.push(`start_sprint_id = $${moveParamIndex}`); moveVals.push(payload.start_sprint_id); moveParamIndex++; }
          if (payload.end_sprint_id) { moveSets.push(`end_sprint_id = $${moveParamIndex}`); moveVals.push(payload.end_sprint_id); moveParamIndex++; }
          if (moveSets.length > 0) {
            moveVals.push(payload.card_id);
            await db.query(
              `UPDATE cards SET ${moveSets.join(", ")} WHERE id = $${moveParamIndex}`,
              moveVals
            );
          }
          const { rows: movedCardRows } = await db.query(
            "SELECT * FROM cards WHERE id = $1", [payload.card_id]
          );
          result = movedCardRows[0];
          break;
        }
        case "delete_card": {
          const { rows: delCardRows } = await db.query(
            "SELECT * FROM cards WHERE id = $1", [payload.card_id]
          );
          const delCard = delCardRows[0];
          if (delCard) {
            const { rows: roadmapRows } = await db.query(
              "SELECT * FROM roadmaps WHERE id = $1", [delCard.roadmap_id]
            );
            const roadmap = roadmapRows[0];
            if (!roadmap || roadmap.workspace_id !== req.user.workspace_id) {
              return res.status(403).json({ error: "Access denied" });
            }
          }

          const { rows: deletedCardRows } = await db.query(
            "SELECT * FROM cards WHERE id = $1", [payload.card_id]
          );
          result = deletedCardRows[0];
          await db.query("DELETE FROM cards WHERE id = $1", [payload.card_id]);
          break;
        }
        case "create_row": {
          const { rows: roadmapRows } = await db.query(
            "SELECT * FROM roadmaps WHERE id = $1", [payload.roadmap_id]
          );
          const roadmap = roadmapRows[0];
          if (!roadmap || roadmap.workspace_id !== req.user.workspace_id) {
            return res.status(403).json({ error: "Access denied" });
          }

          const rowId = uuidv4();
          const { rows: maxOrderRows } = await db.query(
            "SELECT COALESCE(MAX(sort_order), -1) + 1 as next_order FROM roadmap_rows WHERE roadmap_id = $1",
            [payload.roadmap_id]
          );

          await db.query(
            "INSERT INTO roadmap_rows (id, roadmap_id, name, color, sort_order) VALUES ($1, $2, $3, $4, $5)",
            [rowId, payload.roadmap_id, sanitizeHtml(payload.name), payload.color || null, maxOrderRows[0].next_order]
          );
          const { rows: rowRows } = await db.query("SELECT * FROM roadmap_rows WHERE id = $1", [rowId]);
          result = rowRows[0];
          break;
        }
        default:
          return res.status(400).json({ error: `Unknown action type: ${action.action_type}` });
      }

      await db.query(
        "UPDATE message_actions SET status = 'confirmed', executed_at = NOW() WHERE id = $1",
        [req.params.id]
      );

      res.json({ status: "confirmed", result });
    } else {
      // Rejected
      await db.query(
        "UPDATE message_actions SET status = 'rejected' WHERE id = $1",
        [req.params.id]
      );
      res.json({ status: "rejected" });
    }
  } catch (err) {
    res.status(500).json({ error: safeError(err) });
  }
});

/* ---------- File Upload & Feature Extraction ---------- */

// POST /api/chat/upload -- Upload a file and extract feature requests
router.post("/upload", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const { provider, conversation_id } = req.body;
    const aiProvider = provider || "claude";
    const fileName = req.file.originalname;
    const fileBuffer = req.file.buffer;
    const ext = path.extname(fileName).toLowerCase();

    // Read file content — handle different formats
    let fileContent;
    try {
      if (ext === ".xlsx" || ext === ".xls") {
        // Parse Excel files using xlsx package
        const workbook = XLSX.read(fileBuffer, { type: "buffer" });
        const sheetTexts = [];
        for (const sheetName of workbook.SheetNames) {
          const sheet = workbook.Sheets[sheetName];
          const csv = XLSX.utils.sheet_to_csv(sheet);
          if (csv.trim()) {
            sheetTexts.push(
              workbook.SheetNames.length > 1
                ? `Sheet: ${sheetName}\n${csv}`
                : csv
            );
          }
        }
        fileContent = sheetTexts.join("\n\n");
      } else {
        // CSV, JSON, TSV, TXT, MD, XML, and other text-based formats
        fileContent = fileBuffer.toString("utf-8");
      }
    } catch (parseErr) {
      return res.status(400).json({ error: "Could not read file. Ensure it is a valid CSV, Excel, JSON, or text file." });
    }

    // Limit content to prevent excessive token usage
    const MAX_CONTENT_LENGTH = 50000;
    if (fileContent.length > MAX_CONTENT_LENGTH) {
      fileContent = fileContent.substring(0, MAX_CONTENT_LENGTH) + "\n\n[Content truncated — file too large]";
    }

    if (!fileContent.trim()) {
      return res.status(400).json({ error: "File appears to be empty or unreadable" });
    }

    // Extract features using AI
    const result = await extractFeaturesFromFile(
      fileContent,
      fileName,
      aiProvider,
      req.user.id
    );

    // Look up user's current roadmap as fallback for cards missing a roadmap_id
    let fallbackRoadmapId = null;
    const { rows: userRows } = await db.query(
      "SELECT last_roadmap_id FROM users WHERE id = $1",
      [req.user.id]
    );
    if (userRows[0] && userRows[0].last_roadmap_id) {
      fallbackRoadmapId = userRows[0].last_roadmap_id;
    }

    // If a conversation_id was provided, save the upload as a message in that conversation
    if (conversation_id) {
      const { rows: convRows } = await db.query(
        "SELECT * FROM conversations WHERE id = $1 AND user_id = $2",
        [conversation_id, req.user.id]
      );

      if (convRows[0]) {
        // Save user message about the upload
        const userMsgId = uuidv4();
        await db.query(
          "INSERT INTO messages (id, conversation_id, role, content) VALUES ($1, $2, 'user', $3)",
          [userMsgId, conversation_id, `Uploaded file: ${sanitizeHtml(fileName)}`]
        );

        // Save AI response with the extracted cards as actions
        const assistantMsgId = uuidv4();
        const msgContent = result.summary || "I analyzed your file and extracted the following feature requests.";
        await db.query(
          "INSERT INTO messages (id, conversation_id, role, content, provider) VALUES ($1, $2, 'assistant', $3, $4)",
          [assistantMsgId, conversation_id, msgContent, aiProvider]
        );

        // Create pending actions for each extracted card
        const actions = [];
        for (const card of result.cards) {
          const actionId = uuidv4();
          const actionPayload = {
            name: card.name,
            description: card.description || "",
            status: card.status || "placeholder",
            roadmap_id: card.roadmap_id || fallbackRoadmapId,
          };
          await db.query(
            "INSERT INTO message_actions (id, message_id, action_type, action_payload, status) VALUES ($1, $2, 'create_card', $3, 'pending')",
            [actionId, assistantMsgId, JSON.stringify(actionPayload)]
          );

          actions.push({
            id: actionId,
            action_type: "create_card",
            action_payload: JSON.stringify(actionPayload),
            status: "pending",
          });
        }

        // Update conversation timestamp
        await db.query(
          "UPDATE conversations SET updated_at = NOW() WHERE id = $1",
          [conversation_id]
        );

        res.json({
          summary: result.summary,
          cards: result.cards,
          message_id: assistantMsgId,
          actions,
        });
        return;
      }
    }

    // No conversation context — just return the extracted cards
    res.json({
      summary: result.summary,
      cards: result.cards,
      message_id: null,
      actions: [],
    });
  } catch (err) {
    res.status(500).json({ error: safeError(err) });
  }
});

/* ---------- Usage ---------- */

// GET /api/chat/usage -- Get usage stats for current user
router.get("/usage", async (req, res) => {
  try {
    const { rows: totalRows } = await db.query(
      `SELECT
        COUNT(*) as total_messages,
        COALESCE(SUM(input_tokens), 0) as total_input_tokens,
        COALESCE(SUM(output_tokens), 0) as total_output_tokens,
        COUNT(DISTINCT conversation_id) as total_conversations
       FROM ai_usage WHERE user_id = $1`,
      [req.user.id]
    );

    const { rows: monthRows } = await db.query(
      `SELECT
        COUNT(*) as messages,
        COALESCE(SUM(input_tokens), 0) as input_tokens,
        COALESCE(SUM(output_tokens), 0) as output_tokens
       FROM ai_usage
       WHERE user_id = $1 AND created_at >= date_trunc('month', NOW())`,
      [req.user.id]
    );

    const { rows: byProvider } = await db.query(
      `SELECT provider, COUNT(*) as messages,
        COALESCE(SUM(input_tokens), 0) as input_tokens,
        COALESCE(SUM(output_tokens), 0) as output_tokens
       FROM ai_usage WHERE user_id = $1 GROUP BY provider`,
      [req.user.id]
    );

    res.json({ total: totalRows[0], thisMonth: monthRows[0], byProvider });
  } catch (err) {
    res.status(500).json({ error: safeError(err) });
  }
});

module.exports = router;
