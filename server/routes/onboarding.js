const express = require("express");
const router = express.Router();
const { v4: uuidv4 } = require("uuid");
const db = require("../models/db");
const authRoutes = require("./auth");
const { streamOnboardingAI, streamConfigureAI } = require("../services/ai");

const authMiddleware = authRoutes.authMiddleware;

// POST /api/onboarding — save survey responses and mark onboarding complete
router.post("/", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      company_size,
      company_nature,
      current_roadmap_tool,
      tracks_feature_requests,
      crm,
      dev_task_tool,
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
