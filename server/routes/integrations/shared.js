const { v4: uuidv4 } = require("uuid");
const db = require("../../models/db");

/**
 * Shared helpers for integration sub-routers.
 * Extracted to avoid circular dependencies between index.js and sub-routers.
 */

async function getIntegrationForWorkspace(integrationId, workspaceId) {
  const { rows } = await db.query(
    "SELECT * FROM integrations WHERE id = $1 AND workspace_id = $2",
    [integrationId, workspaceId]
  );
  return rows[0] || null;
}

async function upsertEntityLink(cardId, integrationId, integrationType, entityType, entityId, entityName, matchedBy, entityUrl) {
  const { rows: existing } = await db.query(
    `SELECT id FROM integration_entity_links
     WHERE card_id = $1 AND integration_id = $2 AND external_entity_type = $3 AND external_entity_id = $4`,
    [cardId, integrationId, entityType, entityId]
  );

  if (existing[0]) return existing[0];

  const id = uuidv4();
  await db.query(
    `INSERT INTO integration_entity_links (id, card_id, integration_id, integration_type, external_entity_type, external_entity_id, external_entity_name, external_entity_url, matched_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [id, cardId, integrationId, integrationType, entityType, entityId, entityName || "", entityUrl || null, matchedBy]
  );

  return { id, card_id: cardId, integration_id: integrationId, integration_type: integrationType };
}

async function upsertCustomFieldValue(cardId, customFieldId, value) {
  const { rows: existing } = await db.query(
    "SELECT id FROM custom_field_values WHERE card_id = $1 AND custom_field_id = $2",
    [cardId, customFieldId]
  );

  if (existing[0]) {
    await db.query("UPDATE custom_field_values SET value = $1 WHERE id = $2", [value, existing[0].id]);
  } else {
    await db.query(
      "INSERT INTO custom_field_values (id, card_id, custom_field_id, value) VALUES ($1, $2, $3, $4)",
      [uuidv4(), cardId, customFieldId, value]
    );
  }
}

/**
 * Remove an enriched custom field value for a card.
 * Used when a card no longer has linked HubSpot records — we must not leave stale values.
 */
async function deleteEnrichedFieldValue(cardId, customFieldId) {
  await db.query(
    "DELETE FROM custom_field_values WHERE card_id = $1 AND custom_field_id = $2",
    [cardId, customFieldId]
  );
}

/**
 * Remove all enriched (HubSpot-sourced) custom field values for a card.
 * Finds all custom_fields with source='hubspot' and deletes any values for this card.
 */
async function deleteAllEnrichedFieldValues(cardId) {
  await db.query(
    `DELETE FROM custom_field_values
     WHERE card_id = $1
       AND custom_field_id IN (SELECT id FROM custom_fields WHERE source = 'hubspot')`,
    [cardId]
  );
}

module.exports = { getIntegrationForWorkspace, upsertEntityLink, upsertCustomFieldValue, deleteEnrichedFieldValue, deleteAllEnrichedFieldValues };
