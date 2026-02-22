const crypto = require("crypto");
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
/*  PKCE helpers (required for OAuth 2.1 / MCP Auth Apps)              */
/* ------------------------------------------------------------------ */

function generateCodeVerifier() {
  return crypto.randomBytes(32).toString("base64url");
}

function generateCodeChallenge(codeVerifier) {
  return crypto.createHash("sha256").update(codeVerifier).digest("base64url");
}

/* ------------------------------------------------------------------ */
/*  OAuth helpers                                                       */
/* ------------------------------------------------------------------ */

/**
 * Returns { url, codeVerifier } — caller must store codeVerifier for the token exchange.
 */
function getAuthUrl(state) {
  if (!HUBSPOT_CLIENT_ID || !HUBSPOT_REDIRECT_URI) {
    throw new Error("HubSpot OAuth is not configured");
  }

  const codeVerifier = generateCodeVerifier();
  const codeChallenge = generateCodeChallenge(codeVerifier);

  // MCP Auth Apps determine scopes automatically — don't include scope param
  const params = new URLSearchParams({
    client_id: HUBSPOT_CLIENT_ID,
    redirect_uri: HUBSPOT_REDIRECT_URI,
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  });
  return { url: `${HUBSPOT_AUTH_URL}?${params.toString()}`, codeVerifier };
}

async function exchangeCodeForTokens(code, codeVerifier) {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: HUBSPOT_CLIENT_ID,
    client_secret: HUBSPOT_CLIENT_SECRET,
    redirect_uri: HUBSPOT_REDIRECT_URI,
    code,
    code_verifier: codeVerifier,
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

// All standard HubSpot CRM object types
const HUBSPOT_OBJECT_TYPES = [
  { key: "deals", label: "Deals" },
  { key: "companies", label: "Companies" },
  { key: "contacts", label: "Contacts" },
  { key: "tickets", label: "Tickets" },
  { key: "products", label: "Products" },
  { key: "line_items", label: "Line Items" },
  { key: "quotes", label: "Quotes" },
  { key: "calls", label: "Calls" },
  { key: "emails", label: "Emails" },
  { key: "meetings", label: "Meetings" },
  { key: "notes", label: "Notes" },
  { key: "tasks", label: "Tasks" },
  { key: "feedback_submissions", label: "Feedback Submissions" },
];

// Default name/title property to search by for each object type
const DEFAULT_SEARCH_PROPERTIES = {
  deals: ["dealname"],
  companies: ["name"],
  contacts: ["firstname", "lastname", "email"],
  tickets: ["subject"],
  products: ["name"],
  line_items: ["name"],
  quotes: ["hs_title"],
  calls: ["hs_call_title"],
  emails: ["hs_email_subject"],
  meetings: ["hs_meeting_title"],
  notes: ["hs_note_body"],
  tasks: ["hs_task_subject"],
  feedback_submissions: ["hs_content"],
};

function getSearchPropertiesForObject(objectType) {
  return DEFAULT_SEARCH_PROPERTIES[objectType] || ["name"];
}

async function discoverSchema(integrationId) {
  const accessToken = await getAccessToken(integrationId);

  const simplifyProps = (props) =>
    (props.results || []).map((p) => ({
      name: p.name,
      label: p.label,
      type: p.type,
      fieldType: p.fieldType,
      description: p.description || "",
      options: (p.options || []).map((o) => ({ label: o.label, value: o.value })),
    }));

  // Fetch properties for all object types + deal pipelines in parallel
  const propPromises = HUBSPOT_OBJECT_TYPES.map((obj) =>
    hubspotFetch(accessToken, `/crm/v3/properties/${obj.key}`)
      .then((data) => ({ key: obj.key, label: obj.label, properties: simplifyProps(data) }))
      .catch(() => null) // Skip objects we don't have access to
  );
  const pipelinePromise = hubspotFetch(accessToken, "/crm/v3/pipelines/deals").catch(() => ({ results: [] }));

  const [propResults, pipelines] = await Promise.all([
    Promise.all(propPromises),
    pipelinePromise,
  ]);

  // Build objects map — only include objects that returned properties
  const objects = {};
  for (const result of propResults) {
    if (result && result.properties.length > 0) {
      objects[result.key] = {
        label: result.label,
        properties: result.properties,
      };
    }
  }

  const schema = {
    objects,
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
 * Search HubSpot objects across multiple properties.
 * @param {string} objectType - plural key like "deals", "companies", "contacts", "tickets", etc.
 */
async function searchDealsMultiProperty(integrationId, searchTerms, searchProperties, extraProperties = [], objectType = "deals") {
  const accessToken = await getAccessToken(integrationId);

  const defaultPropsByType = {
    deals: ["dealname", "amount", "dealstage", "closedate", "pipeline"],
    companies: ["name", "domain", "industry", "annualrevenue"],
    contacts: ["firstname", "lastname", "email"],
    tickets: ["subject", "content", "hs_pipeline_stage"],
    products: ["name", "description", "price"],
  };
  const defaultProps = defaultPropsByType[objectType] || [];
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

  // objectType is already the plural API key (deals, companies, contacts, tickets, etc.)
  const apiPath = `/crm/v3/objects/${objectType}/search`;

  // HubSpot limits to 3 filter groups per request
  const results = [];
  for (let i = 0; i < filterGroups.length; i += 3) {
    const batch = filterGroups.slice(i, i + 3);
    const data = await hubspotFetch(accessToken, apiPath, {
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

/* ------------------------------------------------------------------ */
/*  List records (no search filter — returns recent records)            */
/* ------------------------------------------------------------------ */

async function listRecords(integrationId, objectType = "deals", limit = 100) {
  const accessToken = await getAccessToken(integrationId);

  const defaultPropsByType = {
    deals: ["dealname", "amount", "dealstage", "closedate", "pipeline"],
    companies: ["name", "domain", "industry", "annualrevenue"],
    contacts: ["firstname", "lastname", "email"],
    tickets: ["subject", "content", "hs_pipeline_stage"],
    products: ["name", "description", "price"],
  };
  const props = defaultPropsByType[objectType] || ["name"];

  const params = new URLSearchParams({
    limit: String(Math.min(limit, 100)),
    properties: props.join(","),
  });

  const results = [];
  let after = null;
  const maxPages = Math.ceil(limit / 100);

  for (let page = 0; page < maxPages; page++) {
    const pageParams = new URLSearchParams(params);
    if (after) pageParams.set("after", after);

    const data = await hubspotFetch(accessToken, `/crm/v3/objects/${objectType}?${pageParams.toString()}`);
    if (data.results) results.push(...data.results);

    if (data.paging?.next?.after && results.length < limit) {
      after = data.paging.next.after;
    } else {
      break;
    }
  }

  return results.slice(0, limit);
}

/**
 * Fetch a single HubSpot record by ID with specific properties.
 */
async function fetchRecord(integrationId, objectType, objectId, properties = []) {
  const accessToken = await getAccessToken(integrationId);
  const params = properties.length > 0 ? `?properties=${properties.join(",")}` : "";
  return hubspotFetch(accessToken, `/crm/v3/objects/${objectType}/${objectId}${params}`);
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
  getSearchPropertiesForObject,
  listRecords,
  fetchRecord,
  SCOPES,
};
