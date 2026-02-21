const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");
const { v4: uuidv4 } = require("uuid");
const rateLimit = require("express-rate-limit");
const db = require("../models/db");
const { encrypt, decrypt } = require("../services/encryption");
const hubspot = require("../services/hubspot");
const { authMiddleware } = require("./auth");

const JWT_SECRET = process.env.JWT_SECRET || "roadway-dev-secret-change-in-production";

/* ------------------------------------------------------------------ */
/*  Rate limiter for enrichment: 10 req/min/workspace                  */
/* ------------------------------------------------------------------ */

const enrichLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many enrichment requests, please try again later" },
  keyGenerator: (req) => req.user?.workspace_id || req.ip,
});

/* ------------------------------------------------------------------ */
/*  Helper: verify integration belongs to user's workspace             */
/* ------------------------------------------------------------------ */

async function getIntegrationForWorkspace(integrationId, workspaceId) {
  const { rows } = await db.query(
    "SELECT * FROM integrations WHERE id = $1 AND workspace_id = $2",
    [integrationId, workspaceId]
  );
  return rows[0] || null;
}

/* ================================================================== */
/*  OAuth                                                              */
/* ================================================================== */

// GET /api/integrations/hubspot/auth-url
router.get("/hubspot/auth-url", authMiddleware, (req, res) => {
  try {
    const { url, codeVerifier } = hubspot.getAuthUrl("pending");

    // Create a CSRF state token containing user info + code_verifier for PKCE
    const state = jwt.sign(
      { workspace_id: req.user.workspace_id, user_id: req.user.id, cv: codeVerifier },
      JWT_SECRET,
      { expiresIn: "10m" }
    );

    // Replace the placeholder state in the URL with the real one
    const finalUrl = url.replace("state=pending", `state=${encodeURIComponent(state)}`);
    res.json({ url: finalUrl });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/integrations/hubspot/callback
router.get("/hubspot/callback", async (req, res) => {
  try {
    const { code, state } = req.query;
    if (!code || !state) {
      return res.status(400).json({ error: "Missing code or state parameter" });
    }

    // Verify CSRF state
    let decoded;
    try {
      decoded = jwt.verify(state, JWT_SECRET);
    } catch {
      return res.status(400).json({ error: "Invalid or expired state token" });
    }

    const { workspace_id, user_id, cv: codeVerifier } = decoded;

    // Exchange code for tokens (with PKCE code_verifier)
    const tokens = await hubspot.exchangeCodeForTokens(code, codeVerifier);
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);

    // Upsert: one HubSpot integration per workspace
    const { rows: existing } = await db.query(
      "SELECT id FROM integrations WHERE workspace_id = $1 AND type = 'hubspot'",
      [workspace_id]
    );

    const integrationId = existing[0]?.id || uuidv4();

    if (existing[0]) {
      await db.query(
        `UPDATE integrations
         SET auth_token_encrypted = $1,
             refresh_token_encrypted = $2,
             token_expires_at = $3,
             status = 'active'
         WHERE id = $4`,
        [
          encrypt(tokens.access_token),
          encrypt(tokens.refresh_token),
          expiresAt.toISOString(),
          integrationId,
        ]
      );
    } else {
      await db.query(
        `INSERT INTO integrations (id, workspace_id, type, auth_token_encrypted, refresh_token_encrypted, token_expires_at, status)
         VALUES ($1, $2, 'hubspot', $3, $4, $5, 'active')`,
        [
          integrationId,
          workspace_id,
          encrypt(tokens.access_token),
          encrypt(tokens.refresh_token),
          expiresAt.toISOString(),
        ]
      );
    }

    // Redirect back to settings page
    const baseUrl = process.env.NODE_ENV === "production"
      ? (process.env.APP_URL || "")
      : "http://localhost:5173";
    res.redirect(`${baseUrl}/settings?tab=Integrations&hubspot=connected`);
  } catch (err) {
    console.error("HubSpot callback error:", err);
    const baseUrl = process.env.NODE_ENV === "production"
      ? (process.env.APP_URL || "")
      : "http://localhost:5173";
    res.redirect(`${baseUrl}/settings?tab=Integrations&hubspot=error`);
  }
});

// POST /api/integrations/hubspot/connect-token — connect via Private App token
router.post("/hubspot/connect-token", authMiddleware, async (req, res) => {
  try {
    const { access_token } = req.body;
    if (!access_token || !access_token.trim()) {
      return res.status(400).json({ error: "Access token is required" });
    }

    const token = access_token.trim();

    // Validate the token by making a test API call
    try {
      const testRes = await fetch("https://api.hubapi.com/crm/v3/objects/deals?limit=1", {
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      });
      if (!testRes.ok) {
        const errText = await testRes.text();
        return res.status(400).json({ error: `Invalid token — HubSpot returned ${testRes.status}. Make sure your Private App has the required scopes.` });
      }
    } catch (fetchErr) {
      return res.status(400).json({ error: "Could not reach HubSpot API. Check the token and try again." });
    }

    const workspaceId = req.user.workspace_id;

    // Upsert: one HubSpot integration per workspace
    const { rows: existing } = await db.query(
      "SELECT id FROM integrations WHERE workspace_id = $1 AND type = 'hubspot'",
      [workspaceId]
    );

    const integrationId = existing[0]?.id || uuidv4();

    if (existing[0]) {
      await db.query(
        `UPDATE integrations
         SET auth_token_encrypted = $1, status = 'active', config = $2
         WHERE id = $3`,
        [encrypt(token), JSON.stringify({ auth_type: "private_app" }), integrationId]
      );
    } else {
      await db.query(
        `INSERT INTO integrations (id, workspace_id, type, auth_token_encrypted, status, config)
         VALUES ($1, $2, 'hubspot', $3, 'active', $4)`,
        [integrationId, workspaceId, encrypt(token), JSON.stringify({ auth_type: "private_app" })]
      );
    }

    res.json({ id: integrationId, status: "active", type: "hubspot" });
  } catch (err) {
    console.error("HubSpot connect-token error:", err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/integrations — list workspace integrations
router.get("/", authMiddleware, async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT id, workspace_id, type, status, last_synced, field_mapping, config, created_at
       FROM integrations WHERE workspace_id = $1`,
      [req.user.workspace_id]
    );
    // Never return tokens
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/integrations/:id — disconnect
router.delete("/:id", authMiddleware, async (req, res) => {
  try {
    const integration = await getIntegrationForWorkspace(req.params.id, req.user.workspace_id);
    if (!integration) {
      return res.status(404).json({ error: "Integration not found" });
    }

    // Delete related data
    await db.query("DELETE FROM hubspot_schema_cache WHERE integration_id = $1", [req.params.id]);
    await db.query("DELETE FROM hubspot_card_links WHERE integration_id = $1", [req.params.id]);
    await db.query("DELETE FROM integrations WHERE id = $1", [req.params.id]);

    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ================================================================== */
/*  Schema Discovery + Caching                                         */
/* ================================================================== */

// POST /api/integrations/:id/discover-schema
router.post("/:id/discover-schema", authMiddleware, async (req, res) => {
  try {
    const integration = await getIntegrationForWorkspace(req.params.id, req.user.workspace_id);
    if (!integration) {
      return res.status(404).json({ error: "Integration not found" });
    }

    const schema = await hubspot.discoverSchema(req.params.id);

    // Cache the schema
    const { rows: existing } = await db.query(
      "SELECT id FROM hubspot_schema_cache WHERE integration_id = $1",
      [req.params.id]
    );

    if (existing[0]) {
      await db.query(
        `UPDATE hubspot_schema_cache
         SET deal_properties = $1, company_properties = $2, contact_properties = $3, pipelines = $4, fetched_at = NOW()
         WHERE integration_id = $5`,
        [
          JSON.stringify(schema.deal_properties),
          JSON.stringify(schema.company_properties),
          JSON.stringify(schema.contact_properties),
          JSON.stringify(schema.pipelines),
          req.params.id,
        ]
      );
    } else {
      await db.query(
        `INSERT INTO hubspot_schema_cache (id, integration_id, deal_properties, company_properties, contact_properties, pipelines)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          uuidv4(),
          req.params.id,
          JSON.stringify(schema.deal_properties),
          JSON.stringify(schema.company_properties),
          JSON.stringify(schema.contact_properties),
          JSON.stringify(schema.pipelines),
        ]
      );
    }

    res.json(schema);
  } catch (err) {
    console.error("Schema discovery error:", err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/integrations/:id/schema — return cached schema
router.get("/:id/schema", authMiddleware, async (req, res) => {
  try {
    const integration = await getIntegrationForWorkspace(req.params.id, req.user.workspace_id);
    if (!integration) {
      return res.status(404).json({ error: "Integration not found" });
    }

    const { rows } = await db.query(
      "SELECT * FROM hubspot_schema_cache WHERE integration_id = $1",
      [req.params.id]
    );

    if (!rows[0]) {
      return res.status(404).json({ error: "No cached schema. Run discover-schema first." });
    }

    const schema = {
      deal_properties: JSON.parse(rows[0].deal_properties || "[]"),
      company_properties: JSON.parse(rows[0].company_properties || "[]"),
      contact_properties: JSON.parse(rows[0].contact_properties || "[]"),
      pipelines: JSON.parse(rows[0].pipelines || "[]"),
      fetched_at: rows[0].fetched_at,
    };

    res.json(schema);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ================================================================== */
/*  AI Mapping Suggestions                                             */
/* ================================================================== */

// POST /api/integrations/:id/suggest-mappings
router.post("/:id/suggest-mappings", authMiddleware, async (req, res) => {
  try {
    const integration = await getIntegrationForWorkspace(req.params.id, req.user.workspace_id);
    if (!integration) {
      return res.status(404).json({ error: "Integration not found" });
    }

    // Get cached schema
    const { rows: schemaRows } = await db.query(
      "SELECT * FROM hubspot_schema_cache WHERE integration_id = $1",
      [req.params.id]
    );
    if (!schemaRows[0]) {
      return res.status(400).json({ error: "No schema discovered yet. Run discover-schema first." });
    }

    const dealProperties = JSON.parse(schemaRows[0].deal_properties || "[]");
    const companyProperties = JSON.parse(schemaRows[0].company_properties || "[]");
    const pipelines = JSON.parse(schemaRows[0].pipelines || "[]");

    // Get existing custom fields
    const { rows: customFields } = await db.query(
      "SELECT * FROM custom_fields WHERE workspace_id = $1",
      [req.user.workspace_id]
    );

    // Get card names for matching strategy suggestions
    const { rows: cards } = await db.query(
      `SELECT c.name FROM cards c
       JOIN roadmaps r ON c.roadmap_id = r.id
       WHERE r.workspace_id = $1
       LIMIT 50`,
      [req.user.workspace_id]
    );

    // Build prompt for AI
    const schemaDescription = buildSchemaPrompt(dealProperties, companyProperties, pipelines, customFields, cards);

    // Call Claude for suggestions
    const Anthropic = require("@anthropic-ai/sdk");
    const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

    if (!ANTHROPIC_API_KEY) {
      return res.status(500).json({ error: "AI service not configured" });
    }

    const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
    const response = await client.messages.create({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 2048,
      system: `You are a data integration expert. You analyze HubSpot CRM schemas and suggest how to map HubSpot data to a product roadmap tool's custom fields.

You MUST respond with valid JSON only — no markdown, no explanation. The response must match this schema:
{
  "matching_strategy": "property_search",
  "matching_config": {
    "search_properties": ["dealname", "description"],
    "min_confidence": 0.7
  },
  "field_mappings": [
    {
      "hubspot_property": "amount",
      "hubspot_object": "deal",
      "aggregation": "sum",
      "roadway_field_name": "Revenue Impact",
      "roadway_field_type": "number",
      "reasoning": "Why this mapping makes sense"
    }
  ]
}

Rules:
- Suggest 2-5 meaningful field mappings based on the available HubSpot properties
- Use aggregation types: sum, count, avg, max, min, count_unique
- For monetary properties like "amount", suggest sum aggregation
- For company/contact associations, suggest count_unique
- For deal stage properties, suggest count (to see how many deals are in which stage)
- The matching strategy should describe how to link HubSpot deals to roadmap cards
- If existing custom fields match what you'd suggest, reference them
- Focus on fields that are useful for product prioritization decisions`,
      messages: [{ role: "user", content: schemaDescription }],
    });

    const text = response.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("");

    // Parse response
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
    console.error("Suggest mappings error:", err);
    res.status(500).json({ error: err.message });
  }
});

function buildSchemaPrompt(dealProps, companyProps, pipelines, customFields, cards) {
  let prompt = `Analyze this HubSpot CRM schema and suggest how to map it to our roadmap tool.\n\n`;

  prompt += `## HubSpot Deal Properties (${dealProps.length} total, showing relevant ones)\n`;
  const relevantDealProps = dealProps.filter((p) =>
    !p.name.startsWith("hs_") || ["hs_deal_stage_probability", "hs_acv"].includes(p.name)
  ).slice(0, 30);
  for (const p of relevantDealProps) {
    prompt += `- ${p.name} (${p.label}): type=${p.type}`;
    if (p.description) prompt += ` — ${p.description}`;
    prompt += "\n";
  }

  prompt += `\n## HubSpot Company Properties (${companyProps.length} total, showing relevant ones)\n`;
  const relevantCompanyProps = companyProps.filter((p) =>
    ["name", "domain", "industry", "annualrevenue", "numberofemployees", "city", "country"].includes(p.name)
  );
  for (const p of relevantCompanyProps) {
    prompt += `- ${p.name} (${p.label}): type=${p.type}\n`;
  }

  if (pipelines.length > 0) {
    prompt += `\n## Deal Pipelines\n`;
    for (const p of pipelines) {
      prompt += `- ${p.label}: stages=[${p.stages.map((s) => s.label).join(", ")}]\n`;
    }
  }

  if (customFields.length > 0) {
    prompt += `\n## Existing Roadmap Custom Fields\n`;
    for (const f of customFields) {
      prompt += `- "${f.name}" (type: ${f.field_type}, id: ${f.id})\n`;
    }
  }

  if (cards.length > 0) {
    prompt += `\n## Sample Roadmap Card Names (for matching strategy)\n`;
    for (const c of cards.slice(0, 20)) {
      prompt += `- "${c.name}"\n`;
    }
  }

  return prompt;
}

/* ================================================================== */
/*  Mapping Save / Load                                                */
/* ================================================================== */

// PUT /api/integrations/:id/mappings — save confirmed mappings
router.put("/:id/mappings", authMiddleware, async (req, res) => {
  try {
    const integration = await getIntegrationForWorkspace(req.params.id, req.user.workspace_id);
    if (!integration) {
      return res.status(404).json({ error: "Integration not found" });
    }

    const { matching_strategy, matching_config, field_mappings } = req.body;

    // Create custom fields for new mappings that don't have an existing field ID
    const finalMappings = [];
    for (const mapping of field_mappings) {
      let fieldId = mapping.roadway_custom_field_id;

      if (!fieldId && mapping.roadway_field_name) {
        // Create a new custom field
        fieldId = uuidv4();
        await db.query(
          `INSERT INTO custom_fields (id, workspace_id, name, field_type, source, source_property)
           VALUES ($1, $2, $3, $4, 'hubspot', $5)`,
          [
            fieldId,
            req.user.workspace_id,
            mapping.roadway_field_name,
            mapping.roadway_field_type || "number",
            mapping.hubspot_property,
          ]
        );
      }

      finalMappings.push({
        ...mapping,
        roadway_custom_field_id: fieldId,
      });
    }

    const fieldMapping = JSON.stringify({
      matching_strategy: matching_strategy || "property_search",
      matching_config: matching_config || { search_properties: ["dealname"], min_confidence: 0.7 },
      field_mappings: finalMappings,
    });

    await db.query(
      "UPDATE integrations SET field_mapping = $1 WHERE id = $2",
      [fieldMapping, req.params.id]
    );

    res.json({ field_mapping: JSON.parse(fieldMapping) });
  } catch (err) {
    console.error("Save mappings error:", err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/integrations/:id/mappings
router.get("/:id/mappings", authMiddleware, async (req, res) => {
  try {
    const integration = await getIntegrationForWorkspace(req.params.id, req.user.workspace_id);
    if (!integration) {
      return res.status(404).json({ error: "Integration not found" });
    }

    const mapping = integration.field_mapping ? JSON.parse(integration.field_mapping) : null;
    res.json(mapping || { matching_strategy: null, matching_config: null, field_mappings: [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ================================================================== */
/*  Enrichment                                                         */
/* ================================================================== */

// POST /api/integrations/:id/enrich — enrich all cards in a roadmap
router.post("/:id/enrich", authMiddleware, enrichLimiter, async (req, res) => {
  try {
    const integration = await getIntegrationForWorkspace(req.params.id, req.user.workspace_id);
    if (!integration) {
      return res.status(404).json({ error: "Integration not found" });
    }

    const mapping = integration.field_mapping ? JSON.parse(integration.field_mapping) : null;
    if (!mapping || !mapping.field_mappings?.length) {
      return res.status(400).json({ error: "No field mappings configured. Set up mappings first." });
    }

    const { roadmap_id } = req.body;
    if (!roadmap_id) {
      return res.status(400).json({ error: "roadmap_id is required" });
    }

    // Get all cards in the roadmap
    const { rows: cards } = await db.query(
      "SELECT id, name, description FROM cards WHERE roadmap_id = $1",
      [roadmap_id]
    );

    const results = [];
    const searchProps = mapping.matching_config?.search_properties || ["dealname"];

    for (const card of cards) {
      try {
        // Search for deals matching this card
        const searchTerms = [card.name];
        const deals = await hubspot.searchDealsMultiProperty(
          req.params.id,
          searchTerms,
          searchProps,
          mapping.field_mappings.map((m) => m.hubspot_property)
        );

        if (deals.length > 0) {
          // Auto-link found deals
          for (const deal of deals) {
            await upsertCardLink(card.id, req.params.id, "deal", deal.id, deal.properties?.dealname, "auto");
          }

          // Aggregate data
          const aggregated = hubspot.aggregateDealData(deals, mapping.field_mappings);

          // Save to custom field values
          for (const [fieldId, value] of Object.entries(aggregated)) {
            await upsertCustomFieldValue(card.id, fieldId, value);
          }

          results.push({ card_id: card.id, card_name: card.name, deals_found: deals.length, enriched: true });
        } else {
          results.push({ card_id: card.id, card_name: card.name, deals_found: 0, enriched: false });
        }
      } catch (cardErr) {
        results.push({ card_id: card.id, card_name: card.name, error: cardErr.message });
      }
    }

    // Update last_synced
    await db.query("UPDATE integrations SET last_synced = $1 WHERE id = $2", [new Date().toISOString(), req.params.id]);

    res.json({ results, total_cards: cards.length, enriched: results.filter((r) => r.enriched).length });
  } catch (err) {
    console.error("Bulk enrich error:", err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/integrations/:id/enrich/:cardId — enrich single card
router.post("/:id/enrich/:cardId", authMiddleware, enrichLimiter, async (req, res) => {
  try {
    const integration = await getIntegrationForWorkspace(req.params.id, req.user.workspace_id);
    if (!integration) {
      return res.status(404).json({ error: "Integration not found" });
    }

    const mapping = integration.field_mapping ? JSON.parse(integration.field_mapping) : null;
    if (!mapping || !mapping.field_mappings?.length) {
      return res.status(400).json({ error: "No field mappings configured" });
    }

    // Verify card belongs to workspace
    const { rows: cardRows } = await db.query(
      `SELECT c.id, c.name, c.description FROM cards c
       JOIN roadmaps r ON c.roadmap_id = r.id
       WHERE c.id = $1 AND r.workspace_id = $2`,
      [req.params.cardId, req.user.workspace_id]
    );
    if (!cardRows[0]) {
      return res.status(404).json({ error: "Card not found" });
    }

    const card = cardRows[0];
    const searchProps = mapping.matching_config?.search_properties || ["dealname"];

    const deals = await hubspot.searchDealsMultiProperty(
      req.params.id,
      [card.name],
      searchProps,
      mapping.field_mappings.map((m) => m.hubspot_property)
    );

    if (deals.length > 0) {
      for (const deal of deals) {
        await upsertCardLink(card.id, req.params.id, "deal", deal.id, deal.properties?.dealname, "auto");
      }

      const aggregated = hubspot.aggregateDealData(deals, mapping.field_mappings);
      for (const [fieldId, value] of Object.entries(aggregated)) {
        await upsertCustomFieldValue(card.id, fieldId, value);
      }
    }

    // Get current links + aggregated data
    const { rows: links } = await db.query(
      "SELECT * FROM hubspot_card_links WHERE card_id = $1 AND integration_id = $2",
      [card.id, req.params.id]
    );

    res.json({ deals_found: deals.length, links, enriched: deals.length > 0 });
  } catch (err) {
    console.error("Single card enrich error:", err);
    res.status(500).json({ error: err.message });
  }
});

/* ================================================================== */
/*  Card HubSpot Data                                                  */
/* ================================================================== */

// GET /api/cards/:cardId/hubspot-data
router.get("/cards/:cardId/hubspot-data", authMiddleware, async (req, res) => {
  try {
    // Verify card belongs to workspace
    const { rows: cardRows } = await db.query(
      `SELECT c.id FROM cards c
       JOIN roadmaps r ON c.roadmap_id = r.id
       WHERE c.id = $1 AND r.workspace_id = $2`,
      [req.params.cardId, req.user.workspace_id]
    );
    if (!cardRows[0]) {
      return res.status(404).json({ error: "Card not found" });
    }

    const { rows: links } = await db.query(
      `SELECT hcl.*, i.type as integration_type
       FROM hubspot_card_links hcl
       JOIN integrations i ON hcl.integration_id = i.id
       WHERE hcl.card_id = $1`,
      [req.params.cardId]
    );

    res.json({ links });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/cards/:cardId/hubspot-links — manually link a deal
router.post("/cards/:cardId/hubspot-links", authMiddleware, async (req, res) => {
  try {
    const { integration_id, hubspot_object_type, hubspot_object_id, hubspot_object_name } = req.body;

    // Verify card belongs to workspace
    const { rows: cardRows } = await db.query(
      `SELECT c.id FROM cards c
       JOIN roadmaps r ON c.roadmap_id = r.id
       WHERE c.id = $1 AND r.workspace_id = $2`,
      [req.params.cardId, req.user.workspace_id]
    );
    if (!cardRows[0]) {
      return res.status(404).json({ error: "Card not found" });
    }

    const integration = await getIntegrationForWorkspace(integration_id, req.user.workspace_id);
    if (!integration) {
      return res.status(404).json({ error: "Integration not found" });
    }

    const link = await upsertCardLink(
      req.params.cardId,
      integration_id,
      hubspot_object_type || "deal",
      hubspot_object_id,
      hubspot_object_name,
      "manual"
    );

    res.json(link);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/cards/:cardId/hubspot-links/:linkId
router.delete("/cards/:cardId/hubspot-links/:linkId", authMiddleware, async (req, res) => {
  try {
    // Verify card belongs to workspace
    const { rows: cardRows } = await db.query(
      `SELECT c.id FROM cards c
       JOIN roadmaps r ON c.roadmap_id = r.id
       WHERE c.id = $1 AND r.workspace_id = $2`,
      [req.params.cardId, req.user.workspace_id]
    );
    if (!cardRows[0]) {
      return res.status(404).json({ error: "Card not found" });
    }

    await db.query(
      "DELETE FROM hubspot_card_links WHERE id = $1 AND card_id = $2",
      [req.params.linkId, req.params.cardId]
    );

    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ================================================================== */
/*  HubSpot Deal Search (for manual linking)                           */
/* ================================================================== */

// POST /api/integrations/:id/search-deals
router.post("/:id/search-deals", authMiddleware, async (req, res) => {
  try {
    const integration = await getIntegrationForWorkspace(req.params.id, req.user.workspace_id);
    if (!integration) {
      return res.status(404).json({ error: "Integration not found" });
    }

    const { query } = req.body;
    if (!query) {
      return res.status(400).json({ error: "query is required" });
    }

    const deals = await hubspot.searchDeals(req.params.id, query);
    res.json({ deals });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ================================================================== */
/*  Helpers                                                            */
/* ================================================================== */

async function upsertCardLink(cardId, integrationId, objectType, objectId, objectName, matchedBy) {
  // Check if link already exists
  const { rows: existing } = await db.query(
    `SELECT id FROM hubspot_card_links
     WHERE card_id = $1 AND integration_id = $2 AND hubspot_object_type = $3 AND hubspot_object_id = $4`,
    [cardId, integrationId, objectType, objectId]
  );

  if (existing[0]) {
    return existing[0];
  }

  const id = uuidv4();
  await db.query(
    `INSERT INTO hubspot_card_links (id, card_id, integration_id, hubspot_object_type, hubspot_object_id, hubspot_object_name, matched_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [id, cardId, integrationId, objectType, objectId, objectName || "", matchedBy]
  );

  return { id, card_id: cardId, integration_id: integrationId, hubspot_object_type: objectType, hubspot_object_id: objectId, hubspot_object_name: objectName, matched_by: matchedBy };
}

async function upsertCustomFieldValue(cardId, customFieldId, value) {
  const { rows: existing } = await db.query(
    "SELECT id FROM custom_field_values WHERE card_id = $1 AND custom_field_id = $2",
    [cardId, customFieldId]
  );

  if (existing[0]) {
    await db.query(
      "UPDATE custom_field_values SET value = $1 WHERE id = $2",
      [value, existing[0].id]
    );
  } else {
    await db.query(
      "INSERT INTO custom_field_values (id, card_id, custom_field_id, value) VALUES ($1, $2, $3, $4)",
      [uuidv4(), cardId, customFieldId, value]
    );
  }
}

module.exports = router;
