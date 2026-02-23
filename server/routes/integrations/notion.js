const express = require("express");
const router = express.Router();
const { v4: uuidv4 } = require("uuid");
const rateLimit = require("express-rate-limit");
const jwt = require("jsonwebtoken");
const db = require("../../models/db");
const notion = require("../../services/notion");
const { encrypt } = require("../../services/encryption");
const { authMiddleware } = require("../auth");
const { getIntegrationForWorkspace, upsertEntityLink, upsertCustomFieldValue } = require("./shared");

const JWT_SECRET = process.env.JWT_SECRET || "roadway-dev-secret-change-in-production";

const enrichLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many enrichment requests, please try again later" },
  keyGenerator: (req) => req.user?.workspace_id || req.ip,
});

/* ================================================================== */
/*  OAuth                                                              */
/* ================================================================== */

router.get("/auth-url", authMiddleware, (req, res) => {
  try {
    const state = jwt.sign(
      { workspace_id: req.user.workspace_id, user_id: req.user.id },
      JWT_SECRET,
      { expiresIn: "10m" }
    );

    const url = notion.getAuthUrl(state);
    res.json({ url });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/callback", async (req, res) => {
  const baseUrl = process.env.NODE_ENV === "production"
    ? (process.env.APP_URL || "")
    : "http://localhost:5173";

  try {
    const { code, state } = req.query;
    if (!code || !state) {
      return res.redirect(`${baseUrl}/settings?tab=Integrations&notion=error`);
    }

    let decoded;
    try {
      decoded = jwt.verify(state, JWT_SECRET);
    } catch {
      return res.redirect(`${baseUrl}/settings?tab=Integrations&notion=error`);
    }

    const { workspace_id } = decoded;

    // Notion token exchange — returns access_token (never expires), workspace info, bot_id
    const tokens = await notion.exchangeCodeForTokens(code);

    const { rows: existing } = await db.query(
      "SELECT id FROM integrations WHERE workspace_id = $1 AND type = 'notion'",
      [workspace_id]
    );

    const integrationId = existing[0]?.id || uuidv4();
    const config = JSON.stringify({
      auth_type: "oauth",
      notion_workspace_id: tokens.workspace_id,
      notion_workspace_name: tokens.workspace_name,
      bot_id: tokens.bot_id,
    });

    if (existing[0]) {
      await db.query(
        `UPDATE integrations
         SET auth_token_encrypted = $1, status = 'active', config = $2
         WHERE id = $3`,
        [encrypt(tokens.access_token), config, integrationId]
      );
    } else {
      await db.query(
        `INSERT INTO integrations (id, workspace_id, type, auth_token_encrypted, status, config)
         VALUES ($1, $2, 'notion', $3, 'active', $4)`,
        [integrationId, workspace_id, encrypt(tokens.access_token), config]
      );
    }

    res.redirect(`${baseUrl}/settings?tab=Integrations&notion=connected`);
  } catch (err) {
    console.error("Notion callback error:", err);
    res.redirect(`${baseUrl}/settings?tab=Integrations&notion=error`);
  }
});

/* ================================================================== */
/*  Schema Discovery + Caching                                         */
/* ================================================================== */

router.post("/:id/discover-schema", authMiddleware, async (req, res) => {
  try {
    const integration = await getIntegrationForWorkspace(req.params.id, req.user.workspace_id);
    if (!integration) return res.status(404).json({ error: "Integration not found" });

    // List all databases
    const databases = await notion.listDatabases(req.params.id);

    // Fetch schema for each database
    const schemas = {};
    for (const db_entry of databases) {
      try {
        const schema = await notion.getDatabaseSchema(req.params.id, db_entry.id);
        schemas[db_entry.id] = {
          id: db_entry.id,
          title: db_entry.title,
          icon: db_entry.icon,
          url: db_entry.url,
          properties: schema.properties,
        };
      } catch (e) {
        // Skip databases we can't access
      }
    }

    // Cache the schema
    const cacheKey = "notion_schema";
    const { rows: existing } = await db.query(
      "SELECT id FROM integration_schema_cache WHERE integration_id = $1 AND cache_key = $2",
      [req.params.id, cacheKey]
    );

    if (existing[0]) {
      await db.query(
        "UPDATE integration_schema_cache SET data = $1, fetched_at = NOW() WHERE id = $2",
        [JSON.stringify(schemas), existing[0].id]
      );
    } else {
      await db.query(
        "INSERT INTO integration_schema_cache (id, integration_id, integration_type, cache_key, data) VALUES ($1, $2, 'notion', $3, $4)",
        [uuidv4(), req.params.id, cacheKey, JSON.stringify(schemas)]
      );
    }

    res.json({ databases: schemas });
  } catch (err) {
    console.error("Notion schema discovery error:", err);
    res.status(500).json({ error: err.message });
  }
});

router.get("/:id/schema", authMiddleware, async (req, res) => {
  try {
    const integration = await getIntegrationForWorkspace(req.params.id, req.user.workspace_id);
    if (!integration) return res.status(404).json({ error: "Integration not found" });

    const { rows } = await db.query(
      "SELECT data, fetched_at FROM integration_schema_cache WHERE integration_id = $1 AND cache_key = 'notion_schema'",
      [req.params.id]
    );

    if (!rows[0]) {
      return res.status(404).json({ error: "No cached schema. Run discover-schema first." });
    }

    res.json({ databases: JSON.parse(rows[0].data), fetched_at: rows[0].fetched_at });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ================================================================== */
/*  AI Mapping Suggestions                                             */
/* ================================================================== */

router.post("/:id/suggest-mappings", authMiddleware, async (req, res) => {
  try {
    const integration = await getIntegrationForWorkspace(req.params.id, req.user.workspace_id);
    if (!integration) return res.status(404).json({ error: "Integration not found" });

    const { rows: cacheRows } = await db.query(
      "SELECT data FROM integration_schema_cache WHERE integration_id = $1 AND cache_key = 'notion_schema'",
      [req.params.id]
    );
    if (!cacheRows[0]) {
      return res.status(400).json({ error: "No schema discovered yet. Run discover-schema first." });
    }

    const databases = JSON.parse(cacheRows[0].data);
    const { database_id } = req.body;

    if (!database_id || !databases[database_id]) {
      return res.status(400).json({ error: "database_id is required and must be a discovered database" });
    }

    const selectedDb = databases[database_id];

    const { rows: customFields } = await db.query(
      "SELECT * FROM custom_fields WHERE workspace_id = $1",
      [req.user.workspace_id]
    );

    const { rows: cards } = await db.query(
      "SELECT c.name FROM cards c JOIN roadmaps r ON c.roadmap_id = r.id WHERE r.workspace_id = $1 LIMIT 50",
      [req.user.workspace_id]
    );

    const schemaDescription = buildNotionSchemaPrompt(selectedDb, customFields, cards);

    const Anthropic = require("@anthropic-ai/sdk");
    const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
    if (!ANTHROPIC_API_KEY) {
      return res.status(500).json({ error: "AI service not configured" });
    }

    const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
    const response = await client.messages.create({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 2048,
      system: `You are a data integration expert. You analyze Notion database schemas and suggest how to map Notion properties to a product roadmap tool's custom fields.

You MUST respond with valid JSON only — no markdown, no explanation. The response must match this schema:
{
  "field_mappings": [
    {
      "notion_property": "Contract Value",
      "notion_database_id": "abc-123",
      "aggregation": "sum",
      "roadway_field_name": "Revenue Impact",
      "roadway_field_type": "number",
      "reasoning": "Why this mapping makes sense"
    }
  ]
}

Rules:
- Suggest 2-5 meaningful field mappings based on the available Notion properties
- Use aggregation types: sum, count, avg, max, min, count_unique
- For monetary/number properties, suggest sum or avg aggregation
- For select/status properties, suggest count or count_unique
- For relation properties, suggest count to track associations
- If existing custom fields match what you'd suggest, reference them
- Focus on fields that are useful for product prioritization decisions`,
      messages: [{ role: "user", content: schemaDescription }],
    });

    const text = response.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("");

    let suggestions;
    try {
      let cleaned = text.trim();
      if (cleaned.startsWith("```")) {
        cleaned = cleaned.replace(/^```(?:json)?\s*/, "").replace(/```\s*$/, "");
      }
      suggestions = JSON.parse(cleaned);
    } catch {
      return res.status(500).json({ error: "Failed to parse AI suggestions" });
    }

    res.json(suggestions);
  } catch (err) {
    console.error("Notion suggest mappings error:", err);
    res.status(500).json({ error: err.message });
  }
});

function buildNotionSchemaPrompt(database, customFields, cards) {
  let prompt = `Analyze this Notion database schema and suggest how to map it to our roadmap tool.\n\n`;
  prompt += `## Notion Database: "${database.title}"\n\n`;
  prompt += `Database ID: ${database.id}\n`;
  prompt += `Properties:\n`;

  for (const [name, prop] of Object.entries(database.properties || {})) {
    prompt += `- "${name}": type=${prop.type}`;
    if (prop.options?.length > 0) {
      prompt += `, options=[${prop.options.map((o) => o.name).join(", ")}]`;
    }
    prompt += "\n";
  }
  prompt += "\n";

  if (customFields.length > 0) {
    prompt += `## Existing Roadmap Custom Fields\n`;
    for (const f of customFields) {
      prompt += `- "${f.name}" (type: ${f.field_type}, id: ${f.id})\n`;
    }
    prompt += "\n";
  }

  if (cards.length > 0) {
    prompt += `## Sample Roadmap Card Names\n`;
    for (const c of cards.slice(0, 20)) {
      prompt += `- "${c.name}"\n`;
    }
  }

  return prompt;
}

/* ================================================================== */
/*  Mapping Save / Load                                                */
/* ================================================================== */

router.put("/:id/mappings", authMiddleware, async (req, res) => {
  try {
    const integration = await getIntegrationForWorkspace(req.params.id, req.user.workspace_id);
    if (!integration) return res.status(404).json({ error: "Integration not found" });

    const { field_mappings } = req.body;
    const finalMappings = [];

    for (const mapping of field_mappings) {
      let fieldId = mapping.roadway_custom_field_id;

      if (!fieldId && mapping.roadway_field_name) {
        const { rows: existing } = await db.query(
          "SELECT id FROM custom_fields WHERE workspace_id = $1 AND name = $2 AND source = 'notion' LIMIT 1",
          [req.user.workspace_id, mapping.roadway_field_name]
        );

        if (existing[0]) {
          fieldId = existing[0].id;
        } else {
          fieldId = uuidv4();
          await db.query(
            "INSERT INTO custom_fields (id, workspace_id, name, field_type, source, source_property) VALUES ($1, $2, $3, $4, 'notion', $5)",
            [fieldId, req.user.workspace_id, mapping.roadway_field_name, mapping.roadway_field_type || "number", mapping.notion_property]
          );
        }
      }

      finalMappings.push({ ...mapping, roadway_custom_field_id: fieldId });
    }

    const fieldMapping = JSON.stringify({ field_mappings: finalMappings });
    await db.query("UPDATE integrations SET field_mapping = $1 WHERE id = $2", [fieldMapping, req.params.id]);

    res.json({ field_mapping: JSON.parse(fieldMapping) });
  } catch (err) {
    console.error("Notion save mappings error:", err);
    res.status(500).json({ error: err.message });
  }
});

router.get("/:id/mappings", authMiddleware, async (req, res) => {
  try {
    const integration = await getIntegrationForWorkspace(req.params.id, req.user.workspace_id);
    if (!integration) return res.status(404).json({ error: "Integration not found" });

    const mapping = integration.field_mapping ? JSON.parse(integration.field_mapping) : null;
    res.json(mapping || { field_mappings: [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ================================================================== */
/*  Enrichment                                                         */
/* ================================================================== */

router.post("/:id/enrich", authMiddleware, enrichLimiter, async (req, res) => {
  try {
    const integration = await getIntegrationForWorkspace(req.params.id, req.user.workspace_id);
    if (!integration) return res.status(404).json({ error: "Integration not found" });

    const mapping = integration.field_mapping ? JSON.parse(integration.field_mapping) : null;
    if (!mapping || !mapping.field_mappings?.length) {
      return res.status(400).json({ error: "No field mappings configured. Set up mappings first." });
    }

    const { roadmap_id } = req.body;
    if (!roadmap_id) return res.status(400).json({ error: "roadmap_id is required" });

    // Get the database ID and title property from mappings
    const dbId = mapping.field_mappings[0]?.notion_database_id;
    if (!dbId) return res.status(400).json({ error: "No Notion database configured in mappings" });

    // Get database schema to find the title property
    const schema = await notion.getDatabaseSchema(req.params.id, dbId);
    const titleProp = notion.findTitleProperty(schema.properties);
    if (!titleProp) return res.status(400).json({ error: "Cannot find title property in Notion database" });

    const { rows: cards } = await db.query("SELECT id, name, description FROM cards WHERE roadmap_id = $1", [roadmap_id]);
    const results = [];

    for (const card of cards) {
      try {
        const matchedRows = await notion.searchDatabaseByCardName(req.params.id, dbId, card.name, titleProp);

        if (matchedRows.length > 0) {
          // Create entity links for matched rows
          for (const row of matchedRows) {
            const pageTitle = notion.extractPageTitle(row);
            await upsertEntityLink(
              card.id, req.params.id, "notion", "page", row.id,
              pageTitle, "auto", row.url
            );
          }

          // Aggregate values and save as custom field values
          const aggregated = notion.aggregateNotionData(matchedRows, mapping.field_mappings);
          for (const [fieldId, value] of Object.entries(aggregated)) {
            await upsertCustomFieldValue(card.id, fieldId, value);
          }

          results.push({ card_id: card.id, card_name: card.name, pages_found: matchedRows.length, enriched: true });
        } else {
          results.push({ card_id: card.id, card_name: card.name, pages_found: 0, enriched: false });
        }
      } catch (cardErr) {
        results.push({ card_id: card.id, card_name: card.name, error: cardErr.message });
      }
    }

    await db.query("UPDATE integrations SET last_synced = $1 WHERE id = $2", [new Date().toISOString(), req.params.id]);
    res.json({ results, total_cards: cards.length, enriched: results.filter((r) => r.enriched).length });
  } catch (err) {
    console.error("Notion bulk enrich error:", err);
    res.status(500).json({ error: err.message });
  }
});

router.post("/:id/enrich/:cardId", authMiddleware, enrichLimiter, async (req, res) => {
  try {
    const integration = await getIntegrationForWorkspace(req.params.id, req.user.workspace_id);
    if (!integration) return res.status(404).json({ error: "Integration not found" });

    const mapping = integration.field_mapping ? JSON.parse(integration.field_mapping) : null;
    if (!mapping || !mapping.field_mappings?.length) {
      return res.status(400).json({ error: "No field mappings configured" });
    }

    const { rows: cardRows } = await db.query(
      "SELECT c.id, c.name FROM cards c JOIN roadmaps r ON c.roadmap_id = r.id WHERE c.id = $1 AND r.workspace_id = $2",
      [req.params.cardId, req.user.workspace_id]
    );
    if (!cardRows[0]) return res.status(404).json({ error: "Card not found" });

    const card = cardRows[0];
    const dbId = mapping.field_mappings[0]?.notion_database_id;
    if (!dbId) return res.status(400).json({ error: "No Notion database configured in mappings" });

    // Check for existing entity links first
    const { rows: existingLinks } = await db.query(
      "SELECT external_entity_id FROM integration_entity_links WHERE card_id = $1 AND integration_id = $2 AND integration_type = 'notion'",
      [card.id, req.params.id]
    );

    let matchedRows = [];

    if (existingLinks.length > 0) {
      // Re-fetch linked pages from Notion to get fresh data
      const accessToken = await notion.getAccessToken(req.params.id);
      for (const link of existingLinks) {
        try {
          const page = await notion.notionFetch(accessToken, `/pages/${link.external_entity_id}`);
          if (page) matchedRows.push(page);
        } catch (e) { /* Page may have been deleted */ }
      }
    }

    // Aggregate and save
    if (matchedRows.length > 0) {
      const aggregated = notion.aggregateNotionData(matchedRows, mapping.field_mappings);
      for (const [fieldId, value] of Object.entries(aggregated)) {
        await upsertCustomFieldValue(card.id, fieldId, value);
      }
    } else {
      for (const m of mapping.field_mappings) {
        if (m.roadway_custom_field_id) {
          await upsertCustomFieldValue(card.id, m.roadway_custom_field_id, "0");
        }
      }
    }

    const { rows: links } = await db.query(
      "SELECT * FROM integration_entity_links WHERE card_id = $1 AND integration_id = $2 AND integration_type = 'notion'",
      [card.id, req.params.id]
    );

    res.json({ pages_found: matchedRows.length, links, enriched: matchedRows.length > 0 });
  } catch (err) {
    console.error("Notion single card enrich error:", err);
    res.status(500).json({ error: err.message });
  }
});

/* ================================================================== */
/*  Import (mirrors Linear import pattern)                             */
/* ================================================================== */

router.get("/:id/databases", authMiddleware, async (req, res) => {
  try {
    const integration = await getIntegrationForWorkspace(req.params.id, req.user.workspace_id);
    if (!integration) return res.status(404).json({ error: "Integration not found" });

    const databases = await notion.listDatabases(req.params.id);
    res.json({ databases });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/:id/databases/:dbId/preview", authMiddleware, async (req, res) => {
  try {
    const integration = await getIntegrationForWorkspace(req.params.id, req.user.workspace_id);
    if (!integration) return res.status(404).json({ error: "Integration not found" });

    const schema = await notion.getDatabaseSchema(req.params.id, req.params.dbId);
    const accessToken = await notion.getAccessToken(req.params.id);

    // Get first 10 rows
    const data = await notion.notionFetch(accessToken, `/databases/${req.params.dbId}/query`, {
      method: "POST",
      body: JSON.stringify({ page_size: 10 }),
    });

    const rows = (data.results || []).map((page) => {
      const values = {};
      for (const [name, prop] of Object.entries(page.properties || {})) {
        values[name] = notion.extractPropertyValue(prop);
      }
      return { id: page.id, url: page.url, values };
    });

    res.json({ schema, rows, total: rows.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/:id/import", authMiddleware, async (req, res) => {
  try {
    const integration = await getIntegrationForWorkspace(req.params.id, req.user.workspace_id);
    if (!integration) return res.status(404).json({ error: "Integration not found" });

    const { database_id, property_mappings, status_mappings, roadmap_id, row_id } = req.body;

    if (!database_id || !roadmap_id) {
      return res.status(400).json({ error: "database_id and roadmap_id are required" });
    }

    // Verify roadmap belongs to workspace
    const { rows: roadmapRows } = await db.query(
      "SELECT id FROM roadmaps WHERE id = $1 AND workspace_id = $2",
      [roadmap_id, req.user.workspace_id]
    );
    if (!roadmapRows[0]) return res.status(404).json({ error: "Roadmap not found" });

    // Get the first sprint so imported cards appear on the grid
    const { rows: roadmapSprints } = await db.query(
      "SELECT id FROM sprints WHERE roadmap_id = $1 ORDER BY sort_order ASC LIMIT 1",
      [roadmap_id]
    );
    const defaultSprintId = roadmapSprints[0]?.id || null;

    // Get the database schema to identify the title property
    const schema = await notion.getDatabaseSchema(req.params.id, database_id);
    const titlePropName = notion.findTitleProperty(schema.properties);

    // Query all rows from the database
    const pages = await notion.queryDatabase(req.params.id, database_id);

    const created = [];
    const errors = [];
    const pm = property_mappings || {};
    const sm = status_mappings || {};

    for (const page of pages) {
      try {
        const props = page.properties || {};

        // Extract card name from title property
        const nameProp = pm.name || titlePropName;
        const name = notion.extractPropertyValue(props[nameProp]) || "Untitled";

        // Extract description
        const descProp = pm.description;
        const description = descProp ? notion.extractPropertyValue(props[descProp]) : null;

        // Extract status and map it
        const statusProp = pm.status;
        let status = "placeholder";
        if (statusProp) {
          const rawStatus = notion.extractPropertyValue(props[statusProp]);
          if (rawStatus && sm[rawStatus]) {
            status = sm[rawStatus];
          }
        }

        // Extract team
        const teamProp = pm.team;
        let teamId = null;
        if (teamProp) {
          const teamName = notion.extractPropertyValue(props[teamProp]);
          if (teamName) {
            const { rows: teamRows } = await db.query(
              "SELECT id FROM teams WHERE workspace_id = $1 AND name ILIKE $2 LIMIT 1",
              [req.user.workspace_id, teamName]
            );
            teamId = teamRows[0]?.id || null;
          }
        }

        const cardId = uuidv4();
        await db.query(
          `INSERT INTO cards (id, roadmap_id, row_id, name, description, status, team_id, source_integration_id, source_external_id, start_sprint_id, end_sprint_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
          [cardId, roadmap_id, row_id || null, name, description || "", status, teamId, req.params.id, page.id, defaultSprintId, defaultSprintId]
        );

        // Create entity link
        await upsertEntityLink(
          cardId, req.params.id, "notion", "page", page.id,
          name, "auto", page.url
        );

        created.push({ card_id: cardId, name, notion_page_id: page.id });
      } catch (pageErr) {
        errors.push({ notion_page_id: page.id, error: pageErr.message });
      }
    }

    res.json({ created: created.length, cards: created, errors });
  } catch (err) {
    console.error("Notion import error:", err);
    res.status(500).json({ error: err.message });
  }
});

/* ================================================================== */
/*  Page Linking                                                        */
/* ================================================================== */

router.post("/:id/search-pages", authMiddleware, async (req, res) => {
  try {
    const integration = await getIntegrationForWorkspace(req.params.id, req.user.workspace_id);
    if (!integration) return res.status(404).json({ error: "Integration not found" });

    const { query } = req.body;
    if (!query) return res.status(400).json({ error: "query is required" });

    const pages = await notion.searchPages(req.params.id, query);
    res.json({ pages });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ================================================================== */
/*  AI Context                                                          */
/* ================================================================== */

router.post("/:id/fetch-context", authMiddleware, async (req, res) => {
  try {
    const integration = await getIntegrationForWorkspace(req.params.id, req.user.workspace_id);
    if (!integration) return res.status(404).json({ error: "Integration not found" });

    const { page_ids } = req.body;
    if (!page_ids || !Array.isArray(page_ids) || page_ids.length === 0) {
      return res.status(400).json({ error: "page_ids array is required" });
    }

    // Limit to 5 pages to keep context manageable
    const limitedIds = page_ids.slice(0, 5);
    const contexts = [];

    for (const pageId of limitedIds) {
      try {
        const text = await notion.getPagePlainText(req.params.id, pageId);
        contexts.push({ page_id: pageId, content: text });
      } catch (e) {
        contexts.push({ page_id: pageId, error: e.message });
      }
    }

    res.json({ contexts });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put("/:id/ai-context-config", authMiddleware, async (req, res) => {
  try {
    const integration = await getIntegrationForWorkspace(req.params.id, req.user.workspace_id);
    if (!integration) return res.status(404).json({ error: "Integration not found" });

    const config = integration.config ? JSON.parse(integration.config) : {};
    const { ai_context_enabled, ai_context_page_ids } = req.body;

    if (ai_context_enabled !== undefined) config.ai_context_enabled = ai_context_enabled;
    if (ai_context_page_ids !== undefined) config.ai_context_page_ids = ai_context_page_ids;

    await db.query("UPDATE integrations SET config = $1 WHERE id = $2", [JSON.stringify(config), req.params.id]);

    res.json({ config });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
