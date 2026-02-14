const express = require("express");
const router = express.Router();
const DeveloperAgent = require("../agents/developer-agent");
const RoadmapModel = require("../models/roadmap");

/**
 * POST /api/agent/execute
 * Execute an agent action.
 *
 * Body: { action: string, params: object }
 *
 * Available actions:
 *   - generate_roadmap: { title, description, type? }
 *   - break_down_milestone: { milestone_id, focus_areas? }
 *   - suggest_tasks: { milestone_id, count? }
 *   - analyze_roadmap: { roadmap_id }
 *   - prioritize: { milestone_id }
 *   - estimate: { milestone_id }
 */
router.post("/execute", (req, res) => {
  const { action, params } = req.body;
  if (!action) return res.status(400).json({ error: "action is required" });

  try {
    const result = DeveloperAgent.execute(action, params || {});
    if (result.error) return res.status(400).json(result);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/agent/logs
 * Get agent activity logs, optionally filtered by roadmap.
 */
router.get("/logs", (req, res) => {
  const { roadmap_id } = req.query;
  res.json(RoadmapModel.getAgentLogs(roadmap_id));
});

/**
 * GET /api/agent/capabilities
 * Return available agent actions and their parameter schemas.
 */
router.get("/capabilities", (req, res) => {
  res.json({
    agent: "Fullstack Developer Agent",
    version: "1.0.0",
    actions: {
      generate_roadmap: {
        description: "Generate a complete roadmap from a project description",
        params: {
          title: { type: "string", required: true },
          description: { type: "string", required: false },
          type: { type: "string", enum: ["webapp", "api", "mobile"], default: "webapp" },
        },
      },
      break_down_milestone: {
        description: "Break a milestone into detailed development tasks",
        params: {
          milestone_id: { type: "string", required: true },
          focus_areas: {
            type: "array",
            items: "string",
            enum: ["frontend", "backend", "database", "devops", "testing", "design", "general"],
            required: false,
          },
        },
      },
      suggest_tasks: {
        description: "Suggest additional tasks for a milestone based on gaps",
        params: {
          milestone_id: { type: "string", required: true },
          count: { type: "number", default: 3 },
        },
      },
      analyze_roadmap: {
        description: "Analyze a roadmap and provide status, stats, and recommendations",
        params: {
          roadmap_id: { type: "string", required: true },
        },
      },
      prioritize: {
        description: "Re-order tasks in a milestone by category and effort priority",
        params: {
          milestone_id: { type: "string", required: true },
        },
      },
      estimate: {
        description: "Provide story point estimates for all tasks in a milestone",
        params: {
          milestone_id: { type: "string", required: true },
        },
      },
    },
  });
});

module.exports = router;
