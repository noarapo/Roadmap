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
         SET objects = $1, pipelines = $2, fetched_at = NOW()
         WHERE integration_id = $3`,
        [JSON.stringify(schema.objects), JSON.stringify(schema.pipelines), req.params.id]
      );
    } else {
      await db.query(
        `INSERT INTO hubspot_schema_cache (id, integration_id, objects, pipelines)
         VALUES ($1, $2, $3, $4)`,
        [uuidv4(), req.params.id, JSON.stringify(schema.objects), JSON.stringify(schema.pipelines)]
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
      objects: JSON.parse(rows[0].objects || "{}"),
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

    const objects = JSON.parse(schemaRows[0].objects || "{}");
    const pipelines = JSON.parse(schemaRows[0].pipelines || "[]");

    // Get existing custom fields
    const { rows: customFields } = await db.query(
      "SELECT * FROM custom_fields WHERE workspace_id = $1",
      [req.user.workspace_id]
    );

    // Get sample card names for context
    const { rows: cards } = await db.query(
      `SELECT c.name FROM cards c
       JOIN roadmaps r ON c.roadmap_id = r.id
       WHERE r.workspace_id = $1
       LIMIT 50`,
      [req.user.workspace_id]
    );

    // Build prompt for AI
    const schemaDescription = buildSchemaPrompt(objects, pipelines, customFields, cards);

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
  "field_mappings": [
    {
      "hubspot_property": "amount",
      "hubspot_object": "deals",
      "aggregation": "sum",
      "roadway_field_name": "Revenue Impact",
      "roadway_field_type": "number",
      "reasoning": "Why this mapping makes sense"
    }
  ]
}

Rules:
- Suggest 2-5 meaningful field mappings based on the available HubSpot properties
- ALWAYS set hubspot_object to the exact object key from the schema (e.g. "deals", "companies", "contacts", "tickets", etc.)
- Use aggregation types: sum, count, avg, max, min, count_unique
- For monetary properties like "amount", suggest sum aggregation with hubspot_object "deals"
- For company/contact associations, suggest count_unique with the appropriate hubspot_object
- For deal stage properties, suggest count (to see how many deals are in which stage)
- For ticket/feedback objects, suggest count to track feature request volume
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

function buildSchemaPrompt(objects, pipelines, customFields, cards) {
  let prompt = `Analyze this HubSpot CRM schema and suggest how to map it to our roadmap tool.\n\n`;
  prompt += `Available HubSpot object types: ${Object.keys(objects).join(", ")}\n\n`;

  // Show properties for each discovered object
  for (const [objectKey, objectData] of Object.entries(objects)) {
    const props = objectData.properties || [];
    // Filter out internal hs_ properties (except useful ones)
    const relevant = props.filter((p) =>
      !p.name.startsWith("hs_") || ["hs_deal_stage_probability", "hs_acv", "hs_ticket_priority", "hs_pipeline_stage"].includes(p.name)
    ).slice(0, 25);

    prompt += `## ${objectData.label} Properties (${props.length} total, showing ${relevant.length})\n`;
    prompt += `These belong to hubspot_object: "${objectKey}"\n`;
    for (const p of relevant) {
      prompt += `- ${p.name} (${p.label}): object=${objectKey}, type=${p.type}`;
      if (p.description) prompt += ` — ${p.description}`;
      prompt += "\n";
    }
    prompt += "\n";
  }

  if (pipelines.length > 0) {
    prompt += `## Deal Pipelines\n`;
    for (const p of pipelines) {
      prompt += `- ${p.label}: stages=[${p.stages.map((s) => s.label).join(", ")}]\n`;
    }
    prompt += "\n";
  }

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

// PUT /api/integrations/:id/mappings — save confirmed mappings
router.put("/:id/mappings", authMiddleware, async (req, res) => {
  try {
    const integration = await getIntegrationForWorkspace(req.params.id, req.user.workspace_id);
    if (!integration) {
      return res.status(404).json({ error: "Integration not found" });
    }

    const { field_mappings } = req.body;

    // Create custom fields for new mappings — reuse existing fields by name
    const finalMappings = [];
    for (const mapping of field_mappings) {
      let fieldId = mapping.roadway_custom_field_id;

      if (!fieldId && mapping.roadway_field_name) {
        // Check if a field with this name already exists for this workspace
        const { rows: existing } = await db.query(
          `SELECT id FROM custom_fields WHERE workspace_id = $1 AND name = $2 AND source = 'hubspot' LIMIT 1`,
          [req.user.workspace_id, mapping.roadway_field_name]
        );

        if (existing[0]) {
          fieldId = existing[0].id;
        } else {
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
      }

      finalMappings.push({
        ...mapping,
        roadway_custom_field_id: fieldId,
      });
    }

    const fieldMapping = JSON.stringify({
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
    res.json(mapping || { field_mappings: [] });
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

    // Derive which object types to search from the field mappings
    const objectTypes = [...new Set(mapping.field_mappings.map((m) => m.hubspot_object || "deals"))];

    console.log(`[Enrich] Starting enrichment for ${cards.length} cards, object types: ${objectTypes.join(", ")}`);
    console.log(`[Enrich] Field mappings:`, JSON.stringify(mapping.field_mappings, null, 2));

    for (const card of cards) {
      try {
        const searchTerms = [card.name];
        let allResults = [];

        // Search each object type using its default name property
        for (const objectType of objectTypes) {
          const searchProps = hubspot.getSearchPropertiesForObject(objectType);
          const extraProps = mapping.field_mappings
            .filter((m) => (m.hubspot_object || "deals") === objectType)
            .map((m) => m.hubspot_property);

          console.log(`[Enrich] Card "${card.name}" → searching ${objectType} by [${searchProps.join(", ")}]`);

          const found = await hubspot.searchDealsMultiProperty(
            req.params.id, searchTerms, searchProps, extraProps, objectType
          );

          console.log(`[Enrich] Card "${card.name}" → ${objectType}: ${found.length} results`);

          for (const obj of found) {
            if (!allResults.some((d) => d.id === obj.id && d._objectType === objectType)) {
              allResults.push({ ...obj, _objectType: objectType });
            }
          }
        }

        if (allResults.length > 0) {
          // Auto-link found objects
          for (const obj of allResults) {
            const objName = obj.properties?.dealname || obj.properties?.name || obj.properties?.subject || "";
            await upsertCardLink(card.id, req.params.id, obj._objectType, obj.id, objName, "auto");
          }

          // Aggregate data per object type
          for (const objectType of objectTypes) {
            const objectResults = allResults.filter((d) => d._objectType === objectType);
            const objectMappings = mapping.field_mappings.filter((m) => (m.hubspot_object || "deals") === objectType);
            if (objectResults.length > 0 && objectMappings.length > 0) {
              const aggregated = hubspot.aggregateDealData(objectResults, objectMappings);
              for (const [fieldId, value] of Object.entries(aggregated)) {
                await upsertCustomFieldValue(card.id, fieldId, value);
              }
            }
          }

          results.push({ card_id: card.id, card_name: card.name, objects_found: allResults.length, enriched: true });
        } else {
          results.push({ card_id: card.id, card_name: card.name, objects_found: 0, enriched: false });
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
    console.log(`[Enrich-Single] Card ${req.params.cardId} via integration ${req.params.id}`);
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
    const objectTypes = [...new Set(mapping.field_mappings.map((m) => m.hubspot_object || "deals"))];

    // Use ALREADY-LINKED records (manual or auto) — fetch their full data from HubSpot
    const { rows: existingLinks } = await db.query(
      "SELECT hubspot_object_type, hubspot_object_id FROM hubspot_card_links WHERE card_id = $1 AND integration_id = $2",
      [card.id, req.params.id]
    );

    let allObjects = [];

    // Only use already-linked records — no search fallback (bulk enrich handles discovery)
    if (existingLinks.length > 0) {
      // Fetch full record data for each linked object from HubSpot
      for (const objectType of objectTypes) {
        const linkedIds = existingLinks
          .filter((l) => l.hubspot_object_type === objectType)
          .map((l) => l.hubspot_object_id);

        if (linkedIds.length === 0) continue;

        const extraProps = mapping.field_mappings
          .filter((m) => (m.hubspot_object || "deals") === objectType)
          .map((m) => m.hubspot_property);

        // Fetch each linked record's properties
        for (const objId of linkedIds) {
          try {
            const record = await hubspot.fetchRecord(req.params.id, objectType, objId, extraProps);
            if (record) {
              allObjects.push({ ...record, _objectType: objectType });
            }
          } catch (e) {
            // Record may have been deleted in HubSpot — skip it
          }
        }
      }
    }

    // Aggregate data per object type and write to custom fields
    // When no linked records exist, write "0" for all mapped fields
    for (const objectType of objectTypes) {
      const objectResults = allObjects.filter((d) => d._objectType === objectType);
      const objectMappings = mapping.field_mappings.filter((m) => (m.hubspot_object || "deals") === objectType);
      if (objectMappings.length > 0) {
        if (objectResults.length > 0) {
          const aggregated = hubspot.aggregateDealData(objectResults, objectMappings);
          for (const [fieldId, value] of Object.entries(aggregated)) {
            await upsertCustomFieldValue(card.id, fieldId, value);
          }
        } else {
          // No linked records for this type — zero out all mapped fields
          for (const m of objectMappings) {
            if (m.roadway_custom_field_id) {
              await upsertCustomFieldValue(card.id, m.roadway_custom_field_id, "0");
            }
          }
        }
      }
    }

    // Get current links
    const { rows: links } = await db.query(
      "SELECT * FROM hubspot_card_links WHERE card_id = $1 AND integration_id = $2",
      [card.id, req.params.id]
    );

    res.json({ objects_found: allObjects.length, links, enriched: allObjects.length > 0 });
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

// GET /api/integrations/:id/list-records?object_type=deals&limit=200
router.get("/:id/list-records", authMiddleware, async (req, res) => {
  try {
    const integration = await getIntegrationForWorkspace(req.params.id, req.user.workspace_id);
    if (!integration) {
      return res.status(404).json({ error: "Integration not found" });
    }

    const objectType = req.query.object_type || "deals";
    const limit = Math.min(parseInt(req.query.limit) || 200, 500);

    const records = await hubspot.listRecords(req.params.id, objectType, limit);
    res.json({ records });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/integrations/:id/search-records
router.post("/:id/search-records", authMiddleware, async (req, res) => {
  try {
    const integration = await getIntegrationForWorkspace(req.params.id, req.user.workspace_id);
    if (!integration) {
      return res.status(404).json({ error: "Integration not found" });
    }

    const { query, object_type } = req.body;
    if (!query) {
      return res.status(400).json({ error: "query is required" });
    }

    const objectType = object_type || "deals";
    const searchProps = hubspot.getSearchPropertiesForObject(objectType);
    const records = await hubspot.searchDealsMultiProperty(
      req.params.id, [query], searchProps, [], objectType
    );
    res.json({ records });
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
