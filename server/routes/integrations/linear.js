const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");
const { v4: uuidv4 } = require("uuid");
const db = require("../../models/db");
const { encrypt } = require("../../services/encryption");
const linear = require("../../services/linear");
const { authMiddleware } = require("../auth");
const { getIntegrationForWorkspace } = require("./shared");

const JWT_SECRET = process.env.JWT_SECRET || "roadway-dev-secret-change-in-production";

/* ================================================================== */
/*  OAuth                                                              */
/* ================================================================== */

// GET /api/integrations/linear/auth-url
router.get("/auth-url", authMiddleware, (req, res) => {
  try {
    const { url, codeVerifier } = linear.getAuthUrl("pending");

    const state = jwt.sign(
      { workspace_id: req.user.workspace_id, user_id: req.user.id, cv: codeVerifier },
      JWT_SECRET,
      { expiresIn: "10m" }
    );

    const finalUrl = url.replace("state=pending", `state=${encodeURIComponent(state)}`);
    res.json({ url: finalUrl });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/integrations/linear/callback
router.get("/callback", async (req, res) => {
  const baseUrl = process.env.NODE_ENV === "production"
    ? (process.env.APP_URL || "")
    : "http://localhost:5173";

  try {
    const { code, state } = req.query;
    if (!code || !state) {
      return res.redirect(`${baseUrl}/settings?tab=Integrations&linear=error`);
    }

    let decoded;
    try {
      decoded = jwt.verify(state, JWT_SECRET);
    } catch {
      return res.redirect(`${baseUrl}/settings?tab=Integrations&linear=error`);
    }

    const { workspace_id, user_id, cv: codeVerifier } = decoded;

    // Exchange code for tokens
    const tokens = await linear.exchangeCodeForTokens(code, codeVerifier);
    const expiresAt = new Date(Date.now() + (tokens.expires_in || 3600) * 1000);

    // Upsert: one Linear integration per workspace
    const { rows: existing } = await db.query(
      "SELECT id FROM integrations WHERE workspace_id = $1 AND type = 'linear'",
      [workspace_id]
    );

    const integrationId = existing[0]?.id || uuidv4();
    const config = { auth_type: "oauth" };

    if (existing[0]) {
      await db.query(
        `UPDATE integrations
         SET auth_token_encrypted = $1, refresh_token_encrypted = $2, token_expires_at = $3, status = 'active', config = $4
         WHERE id = $5`,
        [
          encrypt(tokens.access_token),
          tokens.refresh_token ? encrypt(tokens.refresh_token) : null,
          expiresAt.toISOString(),
          JSON.stringify(config),
          integrationId,
        ]
      );
    } else {
      await db.query(
        `INSERT INTO integrations (id, workspace_id, type, auth_token_encrypted, refresh_token_encrypted, token_expires_at, status, config)
         VALUES ($1, $2, 'linear', $3, $4, $5, 'active', $6)`,
        [
          integrationId,
          workspace_id,
          encrypt(tokens.access_token),
          tokens.refresh_token ? encrypt(tokens.refresh_token) : null,
          expiresAt.toISOString(),
          JSON.stringify(config),
        ]
      );
    }

    // Fetch org info
    try {
      const viewer = await linear.fetchViewer(integrationId);
      if (viewer?.organization) {
        config.linear_org_id = viewer.organization.id;
        config.linear_org_name = viewer.organization.name;
        config.linear_org_url_key = viewer.organization.urlKey;
      }
    } catch (err) {
      console.error("Failed to fetch Linear org info:", err.message);
    }

    // Try to create webhook
    try {
      const webhookUrl = process.env.LINEAR_WEBHOOK_URL ||
        process.env.APP_URL ||
        "http://localhost:3001";
      const webhookResult = await linear.createWebhook(integrationId, `${webhookUrl}/api/integrations/webhooks/linear`);
      if (webhookResult?.success && webhookResult.webhook) {
        config.webhook_id = webhookResult.webhook.id;
        config.webhook_signing_secret = webhookResult.webhook.secret;
      }
    } catch (err) {
      console.error("Failed to create Linear webhook (user may not be admin):", err.message);
      config.webhooks_unavailable = true;
    }

    config.setup_complete = false;

    // Save updated config
    await db.query("UPDATE integrations SET config = $1 WHERE id = $2", [JSON.stringify(config), integrationId]);

    res.redirect(`${baseUrl}/settings?tab=Integrations&linear=connected`);
  } catch (err) {
    console.error("Linear callback error:", err);
    res.redirect(`${baseUrl}/settings?tab=Integrations&linear=error`);
  }
});

/* ================================================================== */
/*  Setup Wizard                                                       */
/* ================================================================== */

// GET /api/integrations/:id/linear/teams
router.get("/:id/teams", authMiddleware, async (req, res) => {
  try {
    const integration = await getIntegrationForWorkspace(req.params.id, req.user.workspace_id);
    if (!integration) return res.status(404).json({ error: "Integration not found" });

    const teams = await linear.fetchTeams(req.params.id);

    // Also fetch Roadway teams for mapping context
    const { rows: roadwayTeams } = await db.query(
      "SELECT id, name FROM teams WHERE workspace_id = $1",
      [req.user.workspace_id]
    );

    res.json({ linear_teams: teams, roadway_teams: roadwayTeams });
  } catch (err) {
    console.error("Fetch Linear teams error:", err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/integrations/:id/linear/workflow-states
router.get("/:id/workflow-states", authMiddleware, async (req, res) => {
  try {
    const integration = await getIntegrationForWorkspace(req.params.id, req.user.workspace_id);
    if (!integration) return res.status(404).json({ error: "Integration not found" });

    const states = await linear.fetchWorkflowStates(req.params.id);

    // Get Roadway statuses for mapping context
    const { rows: settingsRows } = await db.query(
      "SELECT custom_statuses FROM workspace_settings WHERE workspace_id = $1",
      [req.user.workspace_id]
    );
    const roadwayStatuses = settingsRows[0]?.custom_statuses
      ? JSON.parse(settingsRows[0].custom_statuses)
      : ["Placeholder", "Planned", "In Progress", "Done"];

    res.json({ linear_states: states, roadway_statuses: roadwayStatuses });
  } catch (err) {
    console.error("Fetch Linear workflow states error:", err);
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/integrations/:id/linear/team-mappings
router.put("/:id/team-mappings", authMiddleware, async (req, res) => {
  try {
    const integration = await getIntegrationForWorkspace(req.params.id, req.user.workspace_id);
    if (!integration) return res.status(404).json({ error: "Integration not found" });

    const { mappings } = req.body;
    if (!Array.isArray(mappings)) {
      return res.status(400).json({ error: "mappings array is required" });
    }

    // Clear existing mappings for this integration
    await db.query("DELETE FROM integration_team_mappings WHERE integration_id = $1", [req.params.id]);

    // Insert new mappings
    for (const m of mappings) {
      await db.query(
        `INSERT INTO integration_team_mappings (id, integration_id, external_team_id, external_team_name, roadway_team_id)
         VALUES ($1, $2, $3, $4, $5)`,
        [uuidv4(), req.params.id, m.external_team_id, m.external_team_name || null, m.roadway_team_id || null]
      );
    }

    res.json({ saved: mappings.length });
  } catch (err) {
    console.error("Save team mappings error:", err);
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/integrations/:id/linear/status-mappings
router.put("/:id/status-mappings", authMiddleware, async (req, res) => {
  try {
    const integration = await getIntegrationForWorkspace(req.params.id, req.user.workspace_id);
    if (!integration) return res.status(404).json({ error: "Integration not found" });

    const { mappings } = req.body;
    if (!Array.isArray(mappings)) {
      return res.status(400).json({ error: "mappings array is required" });
    }

    // Clear existing mappings for this integration
    await db.query("DELETE FROM integration_status_mappings WHERE integration_id = $1", [req.params.id]);

    // Insert new mappings
    for (const m of mappings) {
      await db.query(
        `INSERT INTO integration_status_mappings (id, integration_id, external_state_id, external_state_name, external_state_type, external_team_id, roadway_status)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [uuidv4(), req.params.id, m.external_state_id, m.external_state_name || null, m.external_state_type || null, m.external_team_id || null, m.roadway_status || null]
      );
    }

    res.json({ saved: mappings.length });
  } catch (err) {
    console.error("Save status mappings error:", err);
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/integrations/:id/linear/config
router.put("/:id/config", authMiddleware, async (req, res) => {
  try {
    const integration = await getIntegrationForWorkspace(req.params.id, req.user.workspace_id);
    if (!integration) return res.status(404).json({ error: "Integration not found" });

    const existingConfig = integration.config ? JSON.parse(integration.config) : {};
    const newConfig = { ...existingConfig, ...req.body };

    await db.query("UPDATE integrations SET config = $1 WHERE id = $2", [JSON.stringify(newConfig), req.params.id]);

    res.json({ config: newConfig });
  } catch (err) {
    console.error("Save Linear config error:", err);
    res.status(500).json({ error: err.message });
  }
});

/* ================================================================== */
/*  Import Flow                                                        */
/* ================================================================== */

// GET /api/integrations/:id/linear/projects
router.get("/:id/projects", authMiddleware, async (req, res) => {
  try {
    const integration = await getIntegrationForWorkspace(req.params.id, req.user.workspace_id);
    if (!integration) return res.status(404).json({ error: "Integration not found" });

    const includeCompleted = req.query.include_completed === "true";
    const teamId = req.query.team_id || null;

    const projects = await linear.fetchAllProjects(req.params.id, { teamId, includeCompleted });

    // Annotate with issue counts
    const enriched = projects.map((p) => ({
      ...p,
      issue_count: p.issues?.nodes?.length ?? 0,
      teams: p.teams?.nodes || [],
      initiatives: p.initiatives?.nodes || [],
      lead: p.lead || null,
    }));

    res.json({ projects: enriched });
  } catch (err) {
    console.error("Fetch Linear projects error:", err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/integrations/:id/linear/initiatives
router.get("/:id/initiatives", authMiddleware, async (req, res) => {
  try {
    const integration = await getIntegrationForWorkspace(req.params.id, req.user.workspace_id);
    if (!integration) return res.status(404).json({ error: "Integration not found" });

    const initiatives = await linear.fetchInitiatives(req.params.id);
    res.json({ initiatives });
  } catch (err) {
    console.error("Fetch Linear initiatives error:", err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/integrations/:id/linear/import
router.post("/:id/import", authMiddleware, async (req, res) => {
  try {
    const integration = await getIntegrationForWorkspace(req.params.id, req.user.workspace_id);
    if (!integration) return res.status(404).json({ error: "Integration not found" });

    const { roadmap_id, projects, target_row_id } = req.body;
    if (!roadmap_id || !projects || !Array.isArray(projects) || projects.length === 0) {
      return res.status(400).json({ error: "roadmap_id and projects array are required" });
    }

    // Verify roadmap belongs to workspace
    const { rows: rmRows } = await db.query(
      "SELECT id FROM roadmaps WHERE id = $1 AND workspace_id = $2",
      [roadmap_id, req.user.workspace_id]
    );
    if (!rmRows[0]) return res.status(404).json({ error: "Roadmap not found" });

    // Load team and status mappings
    const { rows: teamMappings } = await db.query(
      "SELECT * FROM integration_team_mappings WHERE integration_id = $1",
      [req.params.id]
    );
    const { rows: statusMappings } = await db.query(
      "SELECT * FROM integration_status_mappings WHERE integration_id = $1",
      [req.params.id]
    );

    const results = [];

    for (const proj of projects) {
      try {
        // Fetch full project data
        const allProjects = await linear.fetchAllProjects(req.params.id, { includeCompleted: true });
        const projectData = allProjects.find((p) => p.id === proj.project_id);
        if (!projectData) {
          results.push({ project_id: proj.project_id, error: "Project not found in Linear" });
          continue;
        }

        // Determine row_id
        const rowId = proj.row_id || target_row_id || null;

        // Map status from Linear project state
        let mappedStatus = "Placeholder";
        const projectState = projectData.state;
        if (projectState) {
          // Find matching status mapping by state name
          const stateMapping = statusMappings.find(
            (sm) => sm.external_state_name?.toLowerCase() === projectState.toLowerCase()
          );
          if (stateMapping?.roadway_status) {
            mappedStatus = stateMapping.roadway_status;
          } else {
            // Fallback: map by convention
            if (projectState === "started") mappedStatus = "In Progress";
            else if (projectState === "completed") mappedStatus = "Done";
            else if (projectState === "planned") mappedStatus = "Planned";
          }
        }

        // Map team
        let teamId = null;
        const primaryTeam = projectData.teams?.nodes?.[0];
        if (primaryTeam) {
          const teamMapping = teamMappings.find((tm) => tm.external_team_id === primaryTeam.id);
          if (teamMapping?.roadway_team_id) {
            teamId = teamMapping.roadway_team_id;
          }
        }

        // Check if card already exists for this project (idempotent import)
        const { rows: existingCards } = await db.query(
          "SELECT id FROM cards WHERE source_integration_id = $1 AND source_external_id = $2",
          [req.params.id, proj.project_id]
        );

        let cardId;
        if (existingCards[0]) {
          cardId = existingCards[0].id;
          // Update existing card
          await db.query(
            `UPDATE cards SET name = $1, description = $2, status = $3, team_id = $4 WHERE id = $5`,
            [projectData.name, projectData.description || "", mappedStatus, teamId, cardId]
          );
        } else {
          // Create new card
          cardId = uuidv4();
          await db.query(
            `INSERT INTO cards (id, roadmap_id, row_id, name, description, status, team_id, source_integration_id, source_external_id, created_by)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
            [cardId, roadmap_id, rowId, projectData.name, projectData.description || "", mappedStatus, teamId, req.params.id, proj.project_id, req.user.id]
          );
        }

        // Create/update entity link
        const { rows: existingLinks } = await db.query(
          `SELECT id FROM integration_entity_links
           WHERE card_id = $1 AND integration_id = $2 AND external_entity_type = 'project' AND external_entity_id = $3`,
          [cardId, req.params.id, proj.project_id]
        );

        let linkId;
        const linearUrl = `https://linear.app/${integration.config ? JSON.parse(integration.config).linear_org_url_key : "app"}/project/${projectData.slugId || proj.project_id}`;

        if (existingLinks[0]) {
          linkId = existingLinks[0].id;
          await db.query(
            `UPDATE integration_entity_links SET external_entity_name = $1, external_entity_url = $2, updated_at = NOW()
             WHERE id = $3`,
            [projectData.name, linearUrl, linkId]
          );
        } else {
          linkId = uuidv4();
          await db.query(
            `INSERT INTO integration_entity_links (id, card_id, integration_id, integration_type, external_entity_type, external_entity_id, external_entity_name, external_entity_url, matched_by)
             VALUES ($1, $2, $3, 'linear', 'project', $4, $5, $6, 'import')`,
            [linkId, cardId, req.params.id, proj.project_id, projectData.name, linearUrl]
          );
        }

        // Create tags from initiatives
        if (projectData.initiatives?.nodes?.length > 0) {
          for (const initiative of projectData.initiatives.nodes) {
            // Find or create tag
            const { rows: existingTags } = await db.query(
              "SELECT id FROM tags WHERE workspace_id = $1 AND name = $2",
              [req.user.workspace_id, initiative.name]
            );

            let tagId;
            if (existingTags[0]) {
              tagId = existingTags[0].id;
            } else {
              tagId = uuidv4();
              await db.query(
                "INSERT INTO tags (id, workspace_id, name, color) VALUES ($1, $2, $3, $4)",
                [tagId, req.user.workspace_id, initiative.name, "#6366f1"]
              );
            }

            // Link tag to card (if not already linked)
            const { rows: existingCardTags } = await db.query(
              "SELECT id FROM card_tags WHERE card_id = $1 AND tag_id = $2",
              [cardId, tagId]
            );
            if (!existingCardTags[0]) {
              await db.query(
                "INSERT INTO card_tags (id, card_id, tag_id) VALUES ($1, $2, $3)",
                [uuidv4(), cardId, tagId]
              );
            }
          }
        }

        // Fetch and store all issues for this project
        const issues = await linear.fetchProjectIssues(req.params.id, proj.project_id);
        let issueCount = 0;

        for (const issue of issues) {
          const statusCategory = issue.state?.type
            ? linear.normalizeStateType(issue.state.type)
            : "todo";

          await db.query(
            `INSERT INTO integration_issues (id, integration_id, card_id, link_id, external_issue_id, external_issue_identifier,
              external_project_id, title, status, status_category, assignee_name, assignee_avatar_url,
              estimate, priority, priority_label, labels, external_url,
              started_at, completed_at, created_at_external, updated_at_external, synced_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, NOW())
             ON CONFLICT (integration_id, external_issue_id) DO UPDATE
             SET title = $8, status = $9, status_category = $10, assignee_name = $11, assignee_avatar_url = $12,
                 estimate = $13, priority = $14, priority_label = $15, labels = $16, external_url = $17,
                 started_at = $18, completed_at = $19, updated_at_external = $21, synced_at = NOW(),
                 card_id = $3, link_id = $4`,
            [
              uuidv4(), req.params.id, cardId, linkId, issue.id, issue.identifier,
              proj.project_id, issue.title, issue.state?.name || null, statusCategory,
              issue.assignee?.name || null, issue.assignee?.avatarUrl || null,
              issue.estimate || null, issue.priority || null, issue.priorityLabel || null,
              issue.labels?.nodes ? JSON.stringify(issue.labels.nodes.map((l) => l.name)) : null,
              issue.url || null,
              issue.startedAt || null, issue.completedAt || null,
              issue.createdAt || null, issue.updatedAt || null,
            ]
          );
          issueCount++;
        }

        // Calculate and store progress metadata
        const { rows: issueCounts } = await db.query(
          `SELECT status_category, COUNT(*) as cnt FROM integration_issues
           WHERE integration_id = $1 AND external_project_id = $2
           GROUP BY status_category`,
          [req.params.id, proj.project_id]
        );

        const counts = { todo: 0, in_progress: 0, done: 0, cancelled: 0 };
        for (const row of issueCounts) {
          counts[row.status_category] = parseInt(row.cnt);
        }
        const total = counts.todo + counts.in_progress + counts.done;
        const progressPct = total > 0 ? Math.round((counts.done / total) * 100) : 0;

        const metadata = JSON.stringify({
          progress_pct: progressPct,
          health: projectData.health || "onTrack",
          issues: counts,
          issues_total: total + counts.cancelled,
          last_synced: new Date().toISOString(),
        });

        await db.query(
          "UPDATE integration_entity_links SET metadata = $1, updated_at = NOW() WHERE id = $2",
          [metadata, linkId]
        );

        results.push({
          project_id: proj.project_id,
          card_id: cardId,
          link_id: linkId,
          name: projectData.name,
          issues_imported: issueCount,
          progress_pct: progressPct,
          status: mappedStatus,
        });
      } catch (projErr) {
        console.error(`Import error for project ${proj.project_id}:`, projErr);
        results.push({ project_id: proj.project_id, error: projErr.message });
      }
    }

    // Update last_synced
    await db.query("UPDATE integrations SET last_synced = $1 WHERE id = $2", [new Date().toISOString(), req.params.id]);

    res.json({ results, imported: results.filter((r) => !r.error).length, errors: results.filter((r) => r.error).length });
  } catch (err) {
    console.error("Linear import error:", err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
