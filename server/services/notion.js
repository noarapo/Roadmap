const { encrypt, decrypt } = require("./encryption");
const db = require("../models/db");

const NOTION_CLIENT_ID = process.env.NOTION_CLIENT_ID;
const NOTION_CLIENT_SECRET = process.env.NOTION_CLIENT_SECRET;
const NOTION_REDIRECT_URI = process.env.NOTION_REDIRECT_URI;

const NOTION_AUTH_URL = "https://api.notion.com/v1/oauth/authorize";
const NOTION_TOKEN_URL = "https://api.notion.com/v1/oauth/token";
const NOTION_API_BASE = "https://api.notion.com/v1";
const NOTION_API_VERSION = "2022-06-28";

/* ------------------------------------------------------------------ */
/*  OAuth helpers                                                       */
/* ------------------------------------------------------------------ */

function getAuthUrl(state) {
  if (!NOTION_CLIENT_ID || !NOTION_REDIRECT_URI) {
    throw new Error("Notion OAuth is not configured");
  }

  const params = new URLSearchParams({
    client_id: NOTION_CLIENT_ID,
    redirect_uri: NOTION_REDIRECT_URI,
    response_type: "code",
    owner: "user",
    state,
  });

  return `${NOTION_AUTH_URL}?${params.toString()}`;
}

async function exchangeCodeForTokens(code) {
  // Notion uses Basic Auth (base64 client_id:secret) for token exchange
  const credentials = Buffer.from(`${NOTION_CLIENT_ID}:${NOTION_CLIENT_SECRET}`).toString("base64");

  const res = await fetch(NOTION_TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      grant_type: "authorization_code",
      code,
      redirect_uri: NOTION_REDIRECT_URI,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Notion token exchange failed: ${err}`);
  }

  return res.json();
}

/* ------------------------------------------------------------------ */
/*  Token retrieval (Notion tokens never expire)                        */
/* ------------------------------------------------------------------ */

async function getAccessToken(integrationId) {
  const { rows } = await db.query(
    "SELECT auth_token_encrypted FROM integrations WHERE id = $1",
    [integrationId]
  );
  if (!rows[0]?.auth_token_encrypted) {
    throw new Error("Integration not found or has no token");
  }
  return decrypt(rows[0].auth_token_encrypted);
}

/* ------------------------------------------------------------------ */
/*  Notion API calls with retry on 429                                  */
/* ------------------------------------------------------------------ */

async function notionFetch(accessToken, path, options = {}) {
  const url = path.startsWith("http") ? path : `${NOTION_API_BASE}${path}`;
  const maxRetries = 3;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const res = await fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "Notion-Version": NOTION_API_VERSION,
        ...options.headers,
      },
    });

    if (res.status === 429 && attempt < maxRetries) {
      const retryAfter = parseInt(res.headers.get("retry-after") || "1", 10);
      const delay = Math.max(retryAfter * 1000, Math.pow(2, attempt) * 1000);
      await new Promise((r) => setTimeout(r, delay));
      continue;
    }

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Notion API error ${res.status}: ${errText}`);
    }

    return res.json();
  }
}

/* ------------------------------------------------------------------ */
/*  Database operations                                                 */
/* ------------------------------------------------------------------ */

async function listDatabases(integrationId) {
  const accessToken = await getAccessToken(integrationId);

  const results = [];
  let startCursor = undefined;
  let hasMore = true;

  while (hasMore) {
    const body = {
      filter: { value: "database", property: "object" },
      page_size: 100,
    };
    if (startCursor) body.start_cursor = startCursor;

    const data = await notionFetch(accessToken, "/search", {
      method: "POST",
      body: JSON.stringify(body),
    });

    for (const db of data.results || []) {
      results.push({
        id: db.id,
        title: extractTitle(db.title),
        icon: db.icon?.emoji || null,
        url: db.url,
        property_count: Object.keys(db.properties || {}).length,
      });
    }

    hasMore = data.has_more;
    startCursor = data.next_cursor;
  }

  return results;
}

async function getDatabaseSchema(integrationId, dbId) {
  const accessToken = await getAccessToken(integrationId);
  const data = await notionFetch(accessToken, `/databases/${dbId}`);

  const properties = {};
  for (const [name, prop] of Object.entries(data.properties || {})) {
    properties[name] = {
      id: prop.id,
      name,
      type: prop.type,
      // Include select/multi_select options if present
      options: prop[prop.type]?.options?.map((o) => ({ name: o.name, color: o.color })) || [],
    };
  }

  return {
    id: data.id,
    title: extractTitle(data.title),
    url: data.url,
    properties,
  };
}

async function queryDatabase(integrationId, dbId, filter = null, pageSize = 100) {
  const accessToken = await getAccessToken(integrationId);

  const results = [];
  let startCursor = undefined;
  let hasMore = true;

  while (hasMore) {
    const body = { page_size: pageSize };
    if (filter) body.filter = filter;
    if (startCursor) body.start_cursor = startCursor;

    const data = await notionFetch(accessToken, `/databases/${dbId}/query`, {
      method: "POST",
      body: JSON.stringify(body),
    });

    results.push(...(data.results || []));
    hasMore = data.has_more;
    startCursor = data.next_cursor;
  }

  return results;
}

/**
 * Search a Notion DB by card name using the title property.
 */
async function searchDatabaseByCardName(integrationId, dbId, cardName, titlePropName) {
  const accessToken = await getAccessToken(integrationId);

  const body = {
    filter: {
      property: titlePropName,
      title: { contains: cardName },
    },
    page_size: 10,
  };

  const data = await notionFetch(accessToken, `/databases/${dbId}/query`, {
    method: "POST",
    body: JSON.stringify(body),
  });

  return data.results || [];
}

/* ------------------------------------------------------------------ */
/*  Page operations                                                     */
/* ------------------------------------------------------------------ */

async function searchPages(integrationId, query) {
  const accessToken = await getAccessToken(integrationId);

  const body = {
    query,
    filter: { value: "page", property: "object" },
    page_size: 20,
  };

  const data = await notionFetch(accessToken, "/search", {
    method: "POST",
    body: JSON.stringify(body),
  });

  return (data.results || []).map((page) => ({
    id: page.id,
    title: extractPageTitle(page),
    url: page.url,
    icon: page.icon?.emoji || null,
    parent_type: page.parent?.type || null,
    last_edited: page.last_edited_time,
  }));
}

async function getPagePlainText(integrationId, pageId) {
  const accessToken = await getAccessToken(integrationId);

  // Get the page itself for the title
  const page = await notionFetch(accessToken, `/pages/${pageId}`);
  const title = extractPageTitle(page);

  // Fetch block children
  const blocks = [];
  let startCursor = undefined;
  let hasMore = true;

  while (hasMore) {
    const params = startCursor ? `?start_cursor=${startCursor}` : "";
    const data = await notionFetch(accessToken, `/blocks/${pageId}/children${params}`);

    blocks.push(...(data.results || []));
    hasMore = data.has_more;
    startCursor = data.next_cursor;
  }

  const textParts = [title, ""];

  for (const block of blocks) {
    const text = extractBlockText(block);
    if (text) textParts.push(text);
  }

  return textParts.join("\n");
}

/* ------------------------------------------------------------------ */
/*  Data aggregation (mirrors HubSpot)                                  */
/* ------------------------------------------------------------------ */

function aggregateNotionData(rows, fieldMappings) {
  const result = {};

  for (const mapping of fieldMappings) {
    const { notion_property, aggregation, roadway_custom_field_id } = mapping;
    const values = rows
      .map((row) => extractPropertyValue(row.properties?.[notion_property]))
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
        aggregated = values.length > 0 ? Math.max(...values.map((v) => parseFloat(v) || 0)) : 0;
        break;
      case "min":
        aggregated = values.length > 0 ? Math.min(...values.map((v) => parseFloat(v) || 0)) : 0;
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
/*  Helpers                                                             */
/* ------------------------------------------------------------------ */

function extractTitle(titleArray) {
  if (!titleArray || !Array.isArray(titleArray)) return "Untitled";
  return titleArray.map((t) => t.plain_text || "").join("") || "Untitled";
}

function extractPageTitle(page) {
  if (!page?.properties) return "Untitled";
  for (const prop of Object.values(page.properties)) {
    if (prop.type === "title") {
      return extractTitle(prop.title);
    }
  }
  return "Untitled";
}

function extractPropertyValue(prop) {
  if (!prop) return null;

  switch (prop.type) {
    case "title":
      return (prop.title || []).map((t) => t.plain_text || "").join("");
    case "rich_text":
      return (prop.rich_text || []).map((t) => t.plain_text || "").join("");
    case "number":
      return prop.number != null ? String(prop.number) : null;
    case "select":
      return prop.select?.name || null;
    case "multi_select":
      return (prop.multi_select || []).map((s) => s.name).join(", ");
    case "status":
      return prop.status?.name || null;
    case "date":
      return prop.date?.start || null;
    case "checkbox":
      return prop.checkbox ? "true" : "false";
    case "url":
      return prop.url || null;
    case "email":
      return prop.email || null;
    case "phone_number":
      return prop.phone_number || null;
    case "formula":
      if (prop.formula?.type === "number") return prop.formula.number != null ? String(prop.formula.number) : null;
      if (prop.formula?.type === "string") return prop.formula.string;
      if (prop.formula?.type === "boolean") return prop.formula.boolean ? "true" : "false";
      if (prop.formula?.type === "date") return prop.formula.date?.start || null;
      return null;
    case "rollup":
      if (prop.rollup?.type === "number") return prop.rollup.number != null ? String(prop.rollup.number) : null;
      if (prop.rollup?.type === "array") return String(prop.rollup.array?.length || 0);
      return null;
    case "people":
      return (prop.people || []).map((p) => p.name || p.id).join(", ");
    case "relation":
      return String((prop.relation || []).length);
    default:
      return null;
  }
}

function extractBlockText(block) {
  if (!block) return null;

  const type = block.type;
  const content = block[type];

  if (!content) return null;

  // Text-based blocks
  if (content.rich_text) {
    const text = content.rich_text.map((t) => t.plain_text || "").join("");

    switch (type) {
      case "heading_1": return `# ${text}`;
      case "heading_2": return `## ${text}`;
      case "heading_3": return `### ${text}`;
      case "bulleted_list_item": return `- ${text}`;
      case "numbered_list_item": return `1. ${text}`;
      case "to_do": return `- [${content.checked ? "x" : " "}] ${text}`;
      case "toggle": return `> ${text}`;
      case "quote": return `> ${text}`;
      case "callout": return `> ${text}`;
      default: return text;
    }
  }

  // Code blocks
  if (type === "code" && content.rich_text) {
    const code = content.rich_text.map((t) => t.plain_text || "").join("");
    return `\`\`\`${content.language || ""}\n${code}\n\`\`\``;
  }

  // Divider
  if (type === "divider") return "---";

  return null;
}

/**
 * Find the title property name in a Notion database schema.
 */
function findTitleProperty(properties) {
  for (const [name, prop] of Object.entries(properties || {})) {
    if (prop.type === "title") return name;
  }
  return null;
}

module.exports = {
  getAuthUrl,
  exchangeCodeForTokens,
  getAccessToken,
  notionFetch,
  listDatabases,
  getDatabaseSchema,
  queryDatabase,
  searchDatabaseByCardName,
  searchPages,
  getPagePlainText,
  aggregateNotionData,
  extractPropertyValue,
  extractPageTitle,
  findTitleProperty,
};
