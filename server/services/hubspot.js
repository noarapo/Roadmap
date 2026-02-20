const { encrypt, decrypt } = require("./encryption");
const db = require("../models/db");

const HUBSPOT_CLIENT_ID = process.env.HUBSPOT_CLIENT_ID;
const HUBSPOT_CLIENT_SECRET = process.env.HUBSPOT_CLIENT_SECRET;
const HUBSPOT_REDIRECT_URI = process.env.HUBSPOT_REDIRECT_URI;

const HUBSPOT_AUTH_URL = "https://app.hubspot.com/oauth/authorize";
const HUBSPOT_TOKEN_URL = "https://api.hubapi.com/oauth/v1/token";
const HUBSPOT_API_BASE = "https://api.hubapi.com";

// Read-only scopes
const SCOPES = [
  "crm.objects.deals.read",
  "crm.objects.companies.read",
  "crm.objects.contacts.read",
  "crm.schemas.deals.read",
  "crm.schemas.companies.read",
  "crm.schemas.contacts.read",
];

/* ------------------------------------------------------------------ */
/*  OAuth helpers                                                       */
/* ------------------------------------------------------------------ */

function getAuthUrl(state) {
  if (!HUBSPOT_CLIENT_ID || !HUBSPOT_REDIRECT_URI) {
    throw new Error("HubSpot OAuth is not configured");
  }
  const params = new URLSearchParams({
    client_id: HUBSPOT_CLIENT_ID,
    redirect_uri: HUBSPOT_REDIRECT_URI,
    scope: SCOPES.join(" "),
    state,
  });
  return `${HUBSPOT_AUTH_URL}?${params.toString()}`;
}

async function exchangeCodeForTokens(code) {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: HUBSPOT_CLIENT_ID,
    client_secret: HUBSPOT_CLIENT_SECRET,
    redirect_uri: HUBSPOT_REDIRECT_URI,
    code,
  });

  const res = await fetch(HUBSPOT_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`HubSpot token exchange failed: ${err}`);
  }

  return res.json();
}

async function refreshAccessToken(integrationId) {
  const { rows } = await db.query(
    "SELECT refresh_token_encrypted FROM integrations WHERE id = $1",
    [integrationId]
  );
  if (!rows[0]?.refresh_token_encrypted) {
    throw new Error("No refresh token found");
  }

  const refreshToken = decrypt(rows[0].refresh_token_encrypted);

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: HUBSPOT_CLIENT_ID,
    client_secret: HUBSPOT_CLIENT_SECRET,
    refresh_token: refreshToken,
  });

  const res = await fetch(HUBSPOT_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!res.ok) {
    // Mark integration as errored
    await db.query(
      "UPDATE integrations SET status = 'error' WHERE id = $1",
      [integrationId]
    );
    throw new Error("Failed to refresh HubSpot token");
  }

  const tokens = await res.json();
  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);

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

  return tokens.access_token;
}

/**
 * Get a valid access token for an integration, refreshing if needed.
 * Private App tokens never expire — skip refresh for those.
 */
async function getAccessToken(integrationId) {
  const { rows } = await db.query(
    "SELECT auth_token_encrypted, token_expires_at, config FROM integrations WHERE id = $1",
    [integrationId]
  );
  if (!rows[0]?.auth_token_encrypted) {
    throw new Error("Integration not found or has no token");
  }

  // Private App tokens don't expire — return directly
  const config = rows[0].config ? JSON.parse(rows[0].config) : {};
  if (config.auth_type === "private_app") {
    return decrypt(rows[0].auth_token_encrypted);
  }

  const expiresAt = rows[0].token_expires_at
    ? new Date(rows[0].token_expires_at)
    : null;

  // Refresh if token expires within 5 minutes
  if (expiresAt && expiresAt.getTime() - Date.now() < 5 * 60 * 1000) {
    return refreshAccessToken(integrationId);
  }

  return decrypt(rows[0].auth_token_encrypted);
}

/* ------------------------------------------------------------------ */
/*  HubSpot API calls with retry on 429                                */
/* ------------------------------------------------------------------ */

async function hubspotFetch(accessToken, path, options = {}) {
  const url = `${HUBSPOT_API_BASE}${path}`;
  const maxRetries = 3;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const res = await fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        ...options.headers,
      },
    });

    if (res.status === 429 && attempt < maxRetries) {
      // Exponential backoff
      const delay = Math.pow(2, attempt) * 1000;
      await new Promise((r) => setTimeout(r, delay));
      continue;
    }

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`HubSpot API error ${res.status}: ${errText}`);
    }

    return res.json();
  }
}

/* ------------------------------------------------------------------ */
/*  Schema discovery                                                    */
/* ------------------------------------------------------------------ */

async function discoverSchema(integrationId) {
  const accessToken = await getAccessToken(integrationId);

  // Fetch properties for deals, companies, contacts + pipelines in parallel
  const [dealProps, companyProps, contactProps, pipelines] = await Promise.all([
    hubspotFetch(accessToken, "/crm/v3/properties/deals").catch(() => ({ results: [] })),
    hubspotFetch(accessToken, "/crm/v3/properties/companies").catch(() => ({ results: [] })),
    hubspotFetch(accessToken, "/crm/v3/properties/contacts").catch(() => ({ results: [] })),
    hubspotFetch(accessToken, "/crm/v3/pipelines/deals").catch(() => ({ results: [] })),
  ]);

  // Simplify properties to what we need
  const simplifyProps = (props) =>
    (props.results || []).map((p) => ({
      name: p.name,
      label: p.label,
      type: p.type,
      fieldType: p.fieldType,
      description: p.description || "",
      options: (p.options || []).map((o) => ({ label: o.label, value: o.value })),
    }));

  const schema = {
    deal_properties: simplifyProps(dealProps),
    company_properties: simplifyProps(companyProps),
    contact_properties: simplifyProps(contactProps),
    pipelines: (pipelines.results || []).map((p) => ({
      id: p.id,
      label: p.label,
      stages: (p.stages || []).map((s) => ({
        id: s.id,
        label: s.label,
        displayOrder: s.displayOrder,
      })),
    })),
  };

  return schema;
}

/* ------------------------------------------------------------------ */
/*  Deal search                                                         */
/* ------------------------------------------------------------------ */

async function searchDeals(integrationId, query, properties = []) {
  const accessToken = await getAccessToken(integrationId);

  const defaultProps = ["dealname", "amount", "dealstage", "closedate", "pipeline"];
  const allProps = [...new Set([...defaultProps, ...properties])];

  const body = {
    filterGroups: [
      {
        filters: [
          {
            propertyName: "dealname",
            operator: "CONTAINS_TOKEN",
            value: query,
          },
        ],
      },
    ],
    properties: allProps,
    limit: 20,
  };

  const data = await hubspotFetch(accessToken, "/crm/v3/objects/deals/search", {
    method: "POST",
    body: JSON.stringify(body),
  });

  return data.results || [];
}

/**
 * Search deals across multiple properties (dealname, description, etc.)
 */
async function searchDealsMultiProperty(integrationId, searchTerms, searchProperties, extraProperties = []) {
  const accessToken = await getAccessToken(integrationId);

  const defaultProps = ["dealname", "amount", "dealstage", "closedate", "pipeline"];
  const allProps = [...new Set([...defaultProps, ...extraProperties])];

  // Build filter groups — one per search term + search property combo
  const filterGroups = [];
  for (const term of searchTerms) {
    for (const prop of searchProperties) {
      filterGroups.push({
        filters: [
          {
            propertyName: prop,
            operator: "CONTAINS_TOKEN",
            value: term,
          },
        ],
      });
    }
  }

  // HubSpot limits to 3 filter groups per request
  const results = [];
  for (let i = 0; i < filterGroups.length; i += 3) {
    const batch = filterGroups.slice(i, i + 3);
    const data = await hubspotFetch(accessToken, "/crm/v3/objects/deals/search", {
      method: "POST",
      body: JSON.stringify({
        filterGroups: batch,
        properties: allProps,
        limit: 50,
      }),
    });
    if (data.results) {
      for (const r of data.results) {
        if (!results.some((x) => x.id === r.id)) {
          results.push(r);
        }
      }
    }
  }

  return results;
}

/* ------------------------------------------------------------------ */
/*  Data aggregation                                                    */
/* ------------------------------------------------------------------ */

/**
 * Aggregate deal data based on field mappings.
 * @param {Array} deals - HubSpot deal objects
 * @param {Array} fieldMappings - From integrations.field_mapping
 * @returns {Object} { fieldId: aggregatedValue }
 */
function aggregateDealData(deals, fieldMappings) {
  const result = {};

  for (const mapping of fieldMappings) {
    const { hubspot_property, aggregation, roadway_custom_field_id } = mapping;
    const values = deals
      .map((d) => d.properties?.[hubspot_property])
      .filter((v) => v != null && v !== "");

    let aggregated;
    switch (aggregation) {
      case "sum":
        aggregated = values.reduce((sum, v) => sum + (parseFloat(v) || 0), 0);
        break;
      case "count":
        aggregated = values.length;
        break;
      case "avg":
        if (values.length === 0) { aggregated = 0; break; }
        aggregated = values.reduce((sum, v) => sum + (parseFloat(v) || 0), 0) / values.length;
        aggregated = Math.round(aggregated * 100) / 100;
        break;
      case "max":
        aggregated = Math.max(...values.map((v) => parseFloat(v) || 0));
        break;
      case "min":
        aggregated = Math.min(...values.map((v) => parseFloat(v) || 0));
        break;
      case "count_unique":
        aggregated = new Set(values).size;
        break;
      default:
        aggregated = values.length;
    }

    result[roadway_custom_field_id] = String(aggregated);
  }

  return result;
}

module.exports = {
  getAuthUrl,
  exchangeCodeForTokens,
  refreshAccessToken,
  getAccessToken,
  discoverSchema,
  searchDeals,
  searchDealsMultiProperty,
  aggregateDealData,
  SCOPES,
};
