const express = require("express");
const router = express.Router();
const { v4: uuidv4 } = require("uuid");
const db = require("../models/db");
const authRoutes = require("./auth");
const { streamOnboardingAI, streamConfigureAI } = require("../services/ai");

const authMiddleware = authRoutes.authMiddleware;

// POST /api/onboarding — save survey responses, persist workspace config, and mark onboarding complete
router.post("/", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const workspaceId = req.user.workspace_id;
    const {
      company_size,
      company_nature,
      current_roadmap_tool,
      tracks_feature_requests,
      crm,
      dev_task_tool,
      // Workspace config from onboarding editor
      custom_statuses,
      status_colors,
      custom_fields,
      drawer_field_order,
      drawer_hidden_fields,
      onboarding_data,
    } = req.body;

    // Upsert onboarding responses
    await db.query(
      `INSERT INTO onboarding_responses (id, user_id, company_size, company_nature, current_roadmap_tool, tracks_feature_requests, crm, dev_task_tool)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (user_id) DO UPDATE SET
         company_size = EXCLUDED.company_size,
         company_nature = EXCLUDED.company_nature,
         current_roadmap_tool = EXCLUDED.current_roadmap_tool,
         tracks_feature_requests = EXCLUDED.tracks_feature_requests,
         crm = EXCLUDED.crm,
         dev_task_tool = EXCLUDED.dev_task_tool`,
      [uuidv4(), userId, company_size || null, company_nature || null, current_roadmap_tool || null, tracks_feature_requests || null, crm || null, dev_task_tool || null]
    );

    // Persist custom statuses and workspace settings if provided
    if (workspaceId && (custom_statuses || status_colors || drawer_field_order || drawer_hidden_fields)) {
      // Ensure workspace_settings row exists
      await db.query(
        "INSERT INTO workspace_settings (workspace_id) VALUES ($1) ON CONFLICT (workspace_id) DO NOTHING",
        [workspaceId]
      );

      const sets = [];
      const values = [];
      let idx = 1;

      if (custom_statuses) {
        sets.push(`custom_statuses = $${idx++}`);
        values.push(JSON.stringify(custom_statuses));
      }
      if (status_colors) {
        sets.push(`status_colors = $${idx++}`);
        values.push(JSON.stringify(status_colors));
      }
      if (drawer_field_order) {
        sets.push(`drawer_field_order = $${idx++}`);
        values.push(JSON.stringify(drawer_field_order));
      }
      if (drawer_hidden_fields) {
        sets.push(`drawer_hidden_fields = $${idx++}`);
        values.push(JSON.stringify(drawer_hidden_fields));
      }

      if (sets.length > 0) {
        values.push(workspaceId);
        await db.query(
          `UPDATE workspace_settings SET ${sets.join(", ")} WHERE workspace_id = $${idx}`,
          values
        );
      }
    }

    // Persist custom fields if provided
    if (workspaceId && Array.isArray(custom_fields) && custom_fields.length > 0) {
      for (const field of custom_fields) {
        if (!field.name || !field.field_type) continue;
        await db.query(
          `INSERT INTO custom_fields (id, workspace_id, name, field_type, options, source, source_property)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            uuidv4(),
            workspaceId,
            field.name,
            field.field_type,
            field.options ? JSON.stringify(field.options) : null,
            field.source || "manual",
            field.source_property || null,
          ]
        );
      }
    }

    // Mark onboarding as completed
    await db.query("UPDATE users SET onboarding_completed = TRUE WHERE id = $1", [userId]);

    // Return updated user
    const { rows } = await db.query("SELECT * FROM users WHERE id = $1", [userId]);
    const user = rows[0];
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const { password_hash, ...safeUser } = user;
    res.json({ user: safeUser });
  } catch (err) {
    console.error("Onboarding error:", err);
    res.status(500).json({ error: process.env.NODE_ENV === "production" ? "Internal server error" : err.message });
  }
});

// GET /api/onboarding/responses — get onboarding responses for the current user
router.get("/responses", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const { rows } = await db.query(
      "SELECT * FROM onboarding_responses WHERE user_id = $1",
      [userId]
    );
    res.json(rows[0] || null);
  } catch (err) {
    console.error("Get onboarding responses error:", err);
    res.status(500).json({ error: process.env.NODE_ENV === "production" ? "Internal server error" : err.message });
  }
});

// POST /api/onboarding/chat — AI onboarding wizard (SSE streaming)
router.post("/chat", authMiddleware, async (req, res) => {
  try {
    const { messages } = req.body;
    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: "messages array is required" });
    }

    // Set up SSE
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });

    try {
      await streamOnboardingAI(
        messages,
        // onToken
        (token) => {
          res.write(`data: ${JSON.stringify({ type: "token", text: token })}\n\n`);
        },
        // onToolUse
        (toolUse) => {
          res.write(`data: ${JSON.stringify({ type: "tool_use", tool: toolUse })}\n\n`);
        },
        // onDone
        ({ text, toolUses }) => {
          res.write(`data: ${JSON.stringify({ type: "done" })}\n\n`);
          res.end();
        }
      );
    } catch (aiError) {
      console.error("Onboarding AI stream error:", aiError.status, aiError.message);
      let userError = "AI service error. Please try again.";
      if (aiError.message?.includes("not configured")) {
        userError = "AI service is not configured.";
      } else if (aiError.status === 429) {
        userError = "AI rate limit reached. Please try again in a moment.";
      }
      res.write(`data: ${JSON.stringify({ type: "error", error: userError })}\n\n`);
      res.end();
    }
  } catch (err) {
    if (!res.headersSent) {
      res.status(500).json({ error: process.env.NODE_ENV === "production" ? "Internal server error" : err.message });
    } else {
      res.write(`data: ${JSON.stringify({ type: "error", error: "Internal server error" })}\n\n`);
      res.end();
    }
  }
});

// POST /api/onboarding/configure-chat — Phase 2 config AI assistant (SSE streaming)
router.post("/configure-chat", authMiddleware, async (req, res) => {
  try {
    const { messages, config } = req.body;
    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: "messages array is required" });
    }

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });

    try {
      await streamConfigureAI(
        messages,
        config || {},
        (token) => {
          res.write(`data: ${JSON.stringify({ type: "token", text: token })}\n\n`);
        },
        ({ text }) => {
          res.write(`data: ${JSON.stringify({ type: "done" })}\n\n`);
          res.end();
        }
      );
    } catch (aiError) {
      console.error("Configure chat AI error:", aiError.message);
      res.write(`data: ${JSON.stringify({ type: "error", error: "AI service error. Please try again." })}\n\n`);
      res.end();
    }
  } catch (err) {
    if (!res.headersSent) {
      res.status(500).json({ error: "Internal server error" });
    } else {
      res.write(`data: ${JSON.stringify({ type: "error", error: "Internal server error" })}\n\n`);
      res.end();
    }
  }
});

module.exports = router;
