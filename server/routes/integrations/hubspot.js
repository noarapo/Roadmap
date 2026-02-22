const express = require("express");
const router = express.Router();
const { v4: uuidv4 } = require("uuid");
const rateLimit = require("express-rate-limit");
const db = require("../../models/db");
const hubspot = require("../../services/hubspot");
const { encrypt } = require("../../services/encryption");
const { authMiddleware } = require("../auth");
const { getIntegrationForWorkspace, upsertCustomFieldValue } = require("./shared");

const jwt = require("jsonwebtoken");
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
    const { url, codeVerifier } = hubspot.getAuthUrl("pending");
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

router.get("/callback", async (req, res) => {
  try {
    const { code, state } = req.query;
    if (!code || !state) {
      return res.status(400).json({ error: "Missing code or state parameter" });
    }

    let decoded;
    try {
      decoded = jwt.verify(state, JWT_SECRET);
    } catch {
      return res.status(400).json({ error: "Invalid or expired state token" });
    }

    const { workspace_id, user_id, cv: codeVerifier } = decoded;
    const tokens = await hubspot.exchangeCodeForTokens(code, codeVerifier);
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);

    const { rows: existing } = await db.query(
      "SELECT id FROM integrations WHERE workspace_id = $1 AND type = 'hubspot'",
      [workspace_id]
    );

    const integrationId = existing[0]?.id || uuidv4();

    if (existing[0]) {
      await db.query(
        `UPDATE integrations
         SET auth_token_encrypted = $1, refresh_token_encrypted = $2, token_expires_at = $3, status = 'active'
         WHERE id = $4`,
        [encrypt(tokens.access_token), encrypt(tokens.refresh_token), expiresAt.toISOString(), integrationId]
      );
    } else {
      await db.query(
        `INSERT INTO integrations (id, workspace_id, type, auth_token_encrypted, refresh_token_encrypted, token_expires_at, status)
         VALUES ($1, $2, 'hubspot', $3, $4, $5, 'active')`,
        [integrationId, workspace_id, encrypt(tokens.access_token), encrypt(tokens.refresh_token), expiresAt.toISOString()]
      );
    }

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

router.post("/connect-token", authMiddleware, async (req, res) => {
  try {
    const { access_token } = req.body;
    if (!access_token || !access_token.trim()) {
      return res.status(400).json({ error: "Access token is required" });
    }

    const token = access_token.trim();

    try {
      const testRes = await fetch("https://api.hubapi.com/crm/v3/objects/deals?limit=1", {
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      });
      if (!testRes.ok) {
        return res.status(400).json({ error: `Invalid token — HubSpot returned ${testRes.status}. Make sure your Private App has the required scopes.` });
      }
    } catch (fetchErr) {
      return res.status(400).json({ error: "Could not reach HubSpot API. Check the token and try again." });
    }

    const workspaceId = req.user.workspace_id;
    const { rows: existing } = await db.query(
      "SELECT id FROM integrations WHERE workspace_id = $1 AND type = 'hubspot'",
      [workspaceId]
    );

    const integrationId = existing[0]?.id || uuidv4();

    if (existing[0]) {
      await db.query(
        `UPDATE integrations SET auth_token_encrypted = $1, status = 'active', config = $2 WHERE id = $3`,
        [encrypt(token), JSON.stringify({ auth_type: "private_app" }), integrationId]
      );
    } else {
      await db.query(
        `INSERT INTO integrations (id, workspace_id, type, auth_token_encrypted, status, config) VALUES ($1, $2, 'hubspot', $3, 'active', $4)`,
        [integrationId, workspaceId, encrypt(token), JSON.stringify({ auth_type: "private_app" })]
      );
    }

    res.json({ id: integrationId, status: "active", type: "hubspot" });
  } catch (err) {
    console.error("HubSpot connect-token error:", err);
    res.status(500).json({ error: err.message });
  }
});

/* ================================================================== */
/*  Schema Discovery + Caching                                         */
/* ================================================================== */

router.post("/:id/discover-schema", authMiddleware, async (req, res) => {
  try {
    const integration = await getIntegrationForWorkspace(req.params.id, req.user.workspace_id);
    if (!integration) return res.status(404).json({ error: "Integration not found" });

    const schema = await hubspot.discoverSchema(req.params.id);

    const { rows: existing } = await db.query(
      "SELECT id FROM hubspot_schema_cache WHERE integration_id = $1",
      [req.params.id]
    );

    if (existing[0]) {
      await db.query(
        `UPDATE hubspot_schema_cache SET objects = $1, pipelines = $2, fetched_at = NOW() WHERE integration_id = $3`,
        [JSON.stringify(schema.objects), JSON.stringify(schema.pipelines), req.params.id]
      );
    } else {
      await db.query(
        `INSERT INTO hubspot_schema_cache (id, integration_id, objects, pipelines) VALUES ($1, $2, $3, $4)`,
        [uuidv4(), req.params.id, JSON.stringify(schema.objects), JSON.stringify(schema.pipelines)]
      );
    }

    res.json(schema);
  } catch (err) {
    console.error("Schema discovery error:", err);
    res.status(500).json({ error: err.message });
  }
});

router.get("/:id/schema", authMiddleware, async (req, res) => {
  try {
    const integration = await getIntegrationForWorkspace(req.params.id, req.user.workspace_id);
    if (!integration) return res.status(404).json({ error: "Integration not found" });

    const { rows } = await db.query(
      "SELECT * FROM hubspot_schema_cache WHERE integration_id = $1",
      [req.params.id]
    );

    if (!rows[0]) {
      return res.status(404).json({ error: "No cached schema. Run discover-schema first." });
    }

    res.json({
      objects: JSON.parse(rows[0].objects || "{}"),
      pipelines: JSON.parse(rows[0].pipelines || "[]"),
      fetched_at: rows[0].fetched_at,
    });
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

    const { rows: schemaRows } = await db.query(
      "SELECT * FROM hubspot_schema_cache WHERE integration_id = $1",
      [req.params.id]
    );
    if (!schemaRows[0]) {
      return res.status(400).json({ error: "No schema discovered yet. Run discover-schema first." });
    }

    const objects = JSON.parse(schemaRows[0].objects || "{}");
    const pipelines = JSON.parse(schemaRows[0].pipelines || "[]");

    const { rows: customFields } = await db.query(
      "SELECT * FROM custom_fields WHERE workspace_id = $1",
      [req.user.workspace_id]
    );

    const { rows: cards } = await db.query(
      `SELECT c.name FROM cards c JOIN roadmaps r ON c.roadmap_id = r.id WHERE r.workspace_id = $1 LIMIT 50`,
      [req.user.workspace_id]
    );

    const schemaDescription = buildSchemaPrompt(objects, pipelines, customFields, cards);

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

  for (const [objectKey, objectData] of Object.entries(objects)) {
    const props = objectData.properties || [];
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
          `SELECT id FROM custom_fields WHERE workspace_id = $1 AND name = $2 AND source = 'hubspot' LIMIT 1`,
          [req.user.workspace_id, mapping.roadway_field_name]
        );

        if (existing[0]) {
          fieldId = existing[0].id;
        } else {
          fieldId = uuidv4();
          await db.query(
            `INSERT INTO custom_fields (id, workspace_id, name, field_type, source, source_property) VALUES ($1, $2, $3, $4, 'hubspot', $5)`,
            [fieldId, req.user.workspace_id, mapping.roadway_field_name, mapping.roadway_field_type || "number", mapping.hubspot_property]
          );
        }
      }

      finalMappings.push({ ...mapping, roadway_custom_field_id: fieldId });
    }

    const fieldMapping = JSON.stringify({ field_mappings: finalMappings });
    await db.query("UPDATE integrations SET field_mapping = $1 WHERE id = $2", [fieldMapping, req.params.id]);

    res.json({ field_mapping: JSON.parse(fieldMapping) });
  } catch (err) {
    console.error("Save mappings error:", err);
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

async function upsertCardLink(cardId, integrationId, objectType, objectId, objectName, matchedBy) {
  const { rows: existing } = await db.query(
    `SELECT id FROM hubspot_card_links
     WHERE card_id = $1 AND integration_id = $2 AND hubspot_object_type = $3 AND hubspot_object_id = $4`,
    [cardId, integrationId, objectType, objectId]
  );

  if (existing[0]) return existing[0];

  const id = uuidv4();
  await db.query(
    `INSERT INTO hubspot_card_links (id, card_id, integration_id, hubspot_object_type, hubspot_object_id, hubspot_object_name, matched_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [id, cardId, integrationId, objectType, objectId, objectName || "", matchedBy]
  );

  return { id, card_id: cardId, integration_id: integrationId, hubspot_object_type: objectType, hubspot_object_id: objectId, hubspot_object_name: objectName, matched_by: matchedBy };
}

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

    const { rows: cards } = await db.query("SELECT id, name, description FROM cards WHERE roadmap_id = $1", [roadmap_id]);
    const results = [];
    const objectTypes = [...new Set(mapping.field_mappings.map((m) => m.hubspot_object || "deals"))];

    for (const card of cards) {
      try {
        const searchTerms = [card.name];
        let allResults = [];

        for (const objectType of objectTypes) {
          const searchProps = hubspot.getSearchPropertiesForObject(objectType);
          const extraProps = mapping.field_mappings
            .filter((m) => (m.hubspot_object || "deals") === objectType)
            .map((m) => m.hubspot_property);

          const found = await hubspot.searchDealsMultiProperty(req.params.id, searchTerms, searchProps, extraProps, objectType);

          for (const obj of found) {
            if (!allResults.some((d) => d.id === obj.id && d._objectType === objectType)) {
              allResults.push({ ...obj, _objectType: objectType });
            }
          }
        }

        if (allResults.length > 0) {
          for (const obj of allResults) {
            const objName = obj.properties?.dealname || obj.properties?.name || obj.properties?.subject || "";
            await upsertCardLink(card.id, req.params.id, obj._objectType, obj.id, objName, "auto");
          }

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

    await db.query("UPDATE integrations SET last_synced = $1 WHERE id = $2", [new Date().toISOString(), req.params.id]);
    res.json({ results, total_cards: cards.length, enriched: results.filter((r) => r.enriched).length });
  } catch (err) {
    console.error("Bulk enrich error:", err);
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
      `SELECT c.id, c.name, c.description FROM cards c JOIN roadmaps r ON c.roadmap_id = r.id WHERE c.id = $1 AND r.workspace_id = $2`,
      [req.params.cardId, req.user.workspace_id]
    );
    if (!cardRows[0]) return res.status(404).json({ error: "Card not found" });

    const card = cardRows[0];
    const objectTypes = [...new Set(mapping.field_mappings.map((m) => m.hubspot_object || "deals"))];

    const { rows: existingLinks } = await db.query(
      "SELECT hubspot_object_type, hubspot_object_id FROM hubspot_card_links WHERE card_id = $1 AND integration_id = $2",
      [card.id, req.params.id]
    );

    let allObjects = [];

    if (existingLinks.length > 0) {
      for (const objectType of objectTypes) {
        const linkedIds = existingLinks.filter((l) => l.hubspot_object_type === objectType).map((l) => l.hubspot_object_id);
        if (linkedIds.length === 0) continue;

        const extraProps = mapping.field_mappings
          .filter((m) => (m.hubspot_object || "deals") === objectType)
          .map((m) => m.hubspot_property);

        for (const objId of linkedIds) {
          try {
            const record = await hubspot.fetchRecord(req.params.id, objectType, objId, extraProps);
            if (record) allObjects.push({ ...record, _objectType: objectType });
          } catch (e) { /* Record may have been deleted */ }
        }
      }
    }

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
          for (const m of objectMappings) {
            if (m.roadway_custom_field_id) {
              await upsertCustomFieldValue(card.id, m.roadway_custom_field_id, "0");
            }
          }
        }
      }
    }

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
/*  HubSpot Record Search (for manual linking)                         */
/* ================================================================== */

router.get("/:id/list-records", authMiddleware, async (req, res) => {
  try {
    const integration = await getIntegrationForWorkspace(req.params.id, req.user.workspace_id);
    if (!integration) return res.status(404).json({ error: "Integration not found" });

    const objectType = req.query.object_type || "deals";
    const limit = Math.min(parseInt(req.query.limit) || 200, 500);

    const records = await hubspot.listRecords(req.params.id, objectType, limit);
    res.json({ records });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/:id/search-records", authMiddleware, async (req, res) => {
  try {
    const integration = await getIntegrationForWorkspace(req.params.id, req.user.workspace_id);
    if (!integration) return res.status(404).json({ error: "Integration not found" });

    const { query, object_type } = req.body;
    if (!query) return res.status(400).json({ error: "query is required" });

    const objectType = object_type || "deals";
    const searchProps = hubspot.getSearchPropertiesForObject(objectType);
    const records = await hubspot.searchDealsMultiProperty(req.params.id, [query], searchProps, [], objectType);
    res.json({ records });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
