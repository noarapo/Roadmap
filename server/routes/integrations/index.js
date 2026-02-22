const express = require("express");
const router = express.Router();
const { v4: uuidv4 } = require("uuid");
const db = require("../../models/db");
const { authMiddleware } = require("../auth");
const { getIntegrationForWorkspace } = require("./shared");

/* ------------------------------------------------------------------ */
/*  Generic integration endpoints                                      */
/* ------------------------------------------------------------------ */

// GET /api/integrations — list workspace integrations
router.get("/", authMiddleware, async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT id, workspace_id, type, status, last_synced, field_mapping, config, created_at
       FROM integrations WHERE workspace_id = $1`,
      [req.user.workspace_id]
    );
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

    // Clean up related data for all integration types
    await db.query("DELETE FROM integration_entity_links WHERE integration_id = $1", [req.params.id]);
    await db.query("DELETE FROM integration_issues WHERE integration_id = $1", [req.params.id]);
    await db.query("DELETE FROM integration_schema_cache WHERE integration_id = $1", [req.params.id]);
    await db.query("DELETE FROM integration_sync_state WHERE integration_id = $1", [req.params.id]);
    await db.query("DELETE FROM integration_team_mappings WHERE integration_id = $1", [req.params.id]);
    await db.query("DELETE FROM integration_status_mappings WHERE integration_id = $1", [req.params.id]);
    // Legacy HubSpot tables
    await db.query("DELETE FROM hubspot_schema_cache WHERE integration_id = $1", [req.params.id]);
    await db.query("DELETE FROM hubspot_card_links WHERE integration_id = $1", [req.params.id]);
    // Notion tables
    await db.query("DELETE FROM notion_card_links WHERE integration_id = $1", [req.params.id]);
    // Finally delete the integration itself
    await db.query("DELETE FROM integrations WHERE id = $1", [req.params.id]);

    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ------------------------------------------------------------------ */
/*  Card integration data endpoints (shared across providers)          */
/* ------------------------------------------------------------------ */

// GET /api/integrations/cards/:cardId/hubspot-data
router.get("/cards/:cardId/hubspot-data", authMiddleware, async (req, res) => {
  try {
    const { rows: cardRows } = await db.query(
      `SELECT c.id FROM cards c JOIN roadmaps r ON c.roadmap_id = r.id WHERE c.id = $1 AND r.workspace_id = $2`,
      [req.params.cardId, req.user.workspace_id]
    );
    if (!cardRows[0]) return res.status(404).json({ error: "Card not found" });

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

// POST /api/integrations/cards/:cardId/hubspot-links
router.post("/cards/:cardId/hubspot-links", authMiddleware, async (req, res) => {
  try {
    const { integration_id, hubspot_object_type, hubspot_object_id, hubspot_object_name } = req.body;

    const { rows: cardRows } = await db.query(
      `SELECT c.id FROM cards c JOIN roadmaps r ON c.roadmap_id = r.id WHERE c.id = $1 AND r.workspace_id = $2`,
      [req.params.cardId, req.user.workspace_id]
    );
    if (!cardRows[0]) return res.status(404).json({ error: "Card not found" });

    const integration = await getIntegrationForWorkspace(integration_id, req.user.workspace_id);
    if (!integration) return res.status(404).json({ error: "Integration not found" });

    const { rows: existing } = await db.query(
      `SELECT id FROM hubspot_card_links WHERE card_id = $1 AND integration_id = $2 AND hubspot_object_type = $3 AND hubspot_object_id = $4`,
      [req.params.cardId, integration_id, hubspot_object_type || "deal", hubspot_object_id]
    );

    if (existing[0]) return res.json(existing[0]);

    const id = uuidv4();
    await db.query(
      `INSERT INTO hubspot_card_links (id, card_id, integration_id, hubspot_object_type, hubspot_object_id, hubspot_object_name, matched_by)
       VALUES ($1, $2, $3, $4, $5, $6, 'manual')`,
      [id, req.params.cardId, integration_id, hubspot_object_type || "deal", hubspot_object_id, hubspot_object_name || ""]
    );

    res.json({ id, card_id: req.params.cardId, integration_id, hubspot_object_type: hubspot_object_type || "deal", hubspot_object_id, hubspot_object_name, matched_by: "manual" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/integrations/cards/:cardId/hubspot-links/:linkId
router.delete("/cards/:cardId/hubspot-links/:linkId", authMiddleware, async (req, res) => {
  try {
    const { rows: cardRows } = await db.query(
      `SELECT c.id FROM cards c JOIN roadmaps r ON c.roadmap_id = r.id WHERE c.id = $1 AND r.workspace_id = $2`,
      [req.params.cardId, req.user.workspace_id]
    );
    if (!cardRows[0]) return res.status(404).json({ error: "Card not found" });

    await db.query("DELETE FROM hubspot_card_links WHERE id = $1 AND card_id = $2", [req.params.linkId, req.params.cardId]);
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/integrations/cards/:cardId/notion-data
router.get("/cards/:cardId/notion-data", authMiddleware, async (req, res) => {
  try {
    const { rows: cardRows } = await db.query(
      `SELECT c.id FROM cards c JOIN roadmaps r ON c.roadmap_id = r.id WHERE c.id = $1 AND r.workspace_id = $2`,
      [req.params.cardId, req.user.workspace_id]
    );
    if (!cardRows[0]) return res.status(404).json({ error: "Card not found" });

    const { rows: links } = await db.query(
      `SELECT ncl.*, i.type as integration_type
       FROM notion_card_links ncl
       JOIN integrations i ON ncl.integration_id = i.id
       WHERE ncl.card_id = $1`,
      [req.params.cardId]
    );

    // Also get generic entity links for notion
    const { rows: entityLinks } = await db.query(
      `SELECT iel.* FROM integration_entity_links iel
       JOIN integrations i ON iel.integration_id = i.id
       WHERE iel.card_id = $1 AND i.type = 'notion'`,
      [req.params.cardId]
    );

    res.json({ links, entity_links: entityLinks });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/integrations/cards/:cardId/notion-links
router.post("/cards/:cardId/notion-links", authMiddleware, async (req, res) => {
  try {
    const { integration_id, notion_page_id, notion_page_title, notion_page_url, link_type } = req.body;

    const { rows: cardRows } = await db.query(
      `SELECT c.id FROM cards c JOIN roadmaps r ON c.roadmap_id = r.id WHERE c.id = $1 AND r.workspace_id = $2`,
      [req.params.cardId, req.user.workspace_id]
    );
    if (!cardRows[0]) return res.status(404).json({ error: "Card not found" });

    const integration = await getIntegrationForWorkspace(integration_id, req.user.workspace_id);
    if (!integration) return res.status(404).json({ error: "Integration not found" });

    const { rows: existing } = await db.query(
      "SELECT id FROM notion_card_links WHERE card_id = $1 AND integration_id = $2 AND notion_page_id = $3",
      [req.params.cardId, integration_id, notion_page_id]
    );

    if (existing[0]) return res.json(existing[0]);

    const id = uuidv4();
    await db.query(
      `INSERT INTO notion_card_links (id, card_id, integration_id, notion_page_id, notion_page_title, notion_page_url, link_type, matched_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'manual')`,
      [id, req.params.cardId, integration_id, notion_page_id, notion_page_title || "", notion_page_url || "", link_type || "reference"]
    );

    res.json({ id, card_id: req.params.cardId, integration_id, notion_page_id, notion_page_title, notion_page_url, link_type: link_type || "reference", matched_by: "manual" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/integrations/cards/:cardId/notion-links/:linkId
router.delete("/cards/:cardId/notion-links/:linkId", authMiddleware, async (req, res) => {
  try {
    const { rows: cardRows } = await db.query(
      `SELECT c.id FROM cards c JOIN roadmaps r ON c.roadmap_id = r.id WHERE c.id = $1 AND r.workspace_id = $2`,
      [req.params.cardId, req.user.workspace_id]
    );
    if (!cardRows[0]) return res.status(404).json({ error: "Card not found" });

    await db.query("DELETE FROM notion_card_links WHERE id = $1 AND card_id = $2", [req.params.linkId, req.params.cardId]);
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/integrations/cards/:cardId/integration-data — generic integration data for a card
router.get("/cards/:cardId/integration-data", authMiddleware, async (req, res) => {
  try {
    const { rows: cardRows } = await db.query(
      `SELECT c.id, c.source_integration_id, c.source_external_id FROM cards c JOIN roadmaps r ON c.roadmap_id = r.id WHERE c.id = $1 AND r.workspace_id = $2`,
      [req.params.cardId, req.user.workspace_id]
    );
    if (!cardRows[0]) return res.status(404).json({ error: "Card not found" });

    const { rows: links } = await db.query(
      `SELECT iel.*, i.type as integration_type
       FROM integration_entity_links iel
       JOIN integrations i ON iel.integration_id = i.id
       WHERE iel.card_id = $1`,
      [req.params.cardId]
    );

    res.json({ links, source_integration_id: cardRows[0].source_integration_id, source_external_id: cardRows[0].source_external_id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ------------------------------------------------------------------ */
/*  Mount sub-routers                                                  */
/* ------------------------------------------------------------------ */

router.use("/hubspot", require("./hubspot"));
router.use("/linear", require("./linear"));
router.use("/notion", require("./notion"));

module.exports = router;
