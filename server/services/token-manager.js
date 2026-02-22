const db = require("../models/db");
const { encrypt, decrypt } = require("./encryption");

/**
 * Shared OAuth token management for all integration providers.
 * Handles token retrieval, expiry checking, and refresh.
 */

/**
 * Provider config shape:
 * {
 *   tokenUrl: string,          // Token endpoint URL
 *   clientIdEnv: string,       // Env var name for client ID
 *   clientSecretEnv: string,   // Env var name for client secret
 *   grantType: string,         // 'refresh_token'
 * }
 */

const PROVIDER_CONFIGS = {
  hubspot: {
    tokenUrl: "https://api.hubapi.com/oauth/v1/token",
    clientIdEnv: "HUBSPOT_CLIENT_ID",
    clientSecretEnv: "HUBSPOT_CLIENT_SECRET",
    grantType: "refresh_token",
  },
  linear: {
    tokenUrl: "https://api.linear.app/oauth/token",
    clientIdEnv: "LINEAR_CLIENT_ID",
    clientSecretEnv: "LINEAR_CLIENT_SECRET",
    grantType: "refresh_token",
  },
};

/**
 * Get a valid access token for an integration, refreshing if needed.
 * @param {string} integrationId
 * @returns {Promise<string>} Valid access token
 */
async function getValidToken(integrationId) {
  const { rows } = await db.query(
    "SELECT auth_token_encrypted, refresh_token_encrypted, token_expires_at, config, type FROM integrations WHERE id = $1",
    [integrationId]
  );

  if (!rows[0]?.auth_token_encrypted) {
    throw new Error("Integration not found or has no token");
  }

  const row = rows[0];
  const config = row.config ? JSON.parse(row.config) : {};

  // Private App tokens (HubSpot) don't expire
  if (config.auth_type === "private_app") {
    return decrypt(row.auth_token_encrypted);
  }

  const expiresAt = row.token_expires_at ? new Date(row.token_expires_at) : null;

  // Refresh if token expires within 5 minutes
  if (expiresAt && expiresAt.getTime() - Date.now() < 5 * 60 * 1000) {
    const providerConfig = PROVIDER_CONFIGS[row.type];
    if (!providerConfig) {
      throw new Error(`No provider config for type: ${row.type}`);
    }
    return refreshToken(integrationId, providerConfig);
  }

  return decrypt(row.auth_token_encrypted);
}

/**
 * Refresh an OAuth token using the refresh token.
 * @param {string} integrationId
 * @param {object} providerConfig
 * @returns {Promise<string>} New access token
 */
async function refreshToken(integrationId, providerConfig) {
  const { rows } = await db.query(
    "SELECT refresh_token_encrypted FROM integrations WHERE id = $1",
    [integrationId]
  );

  if (!rows[0]?.refresh_token_encrypted) {
    throw new Error("No refresh token found");
  }

  const refreshTokenValue = decrypt(rows[0].refresh_token_encrypted);
  const clientId = process.env[providerConfig.clientIdEnv];
  const clientSecret = process.env[providerConfig.clientSecretEnv];

  if (!clientId || !clientSecret) {
    throw new Error(`Missing credentials: ${providerConfig.clientIdEnv} or ${providerConfig.clientSecretEnv}`);
  }

  const body = new URLSearchParams({
    grant_type: providerConfig.grantType,
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshTokenValue,
  });

  const res = await fetch(providerConfig.tokenUrl, {
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
    const errText = await res.text();
    throw new Error(`Token refresh failed (${res.status}): ${errText}`);
  }

  const tokens = await res.json();
  const expiresAt = new Date(Date.now() + (tokens.expires_in || 3600) * 1000);

  const updates = [
    encrypt(tokens.access_token),
    expiresAt.toISOString(),
    "active",
    integrationId,
  ];

  if (tokens.refresh_token) {
    await db.query(
      `UPDATE integrations
       SET auth_token_encrypted = $1,
           refresh_token_encrypted = $2,
           token_expires_at = $3,
           status = $4
       WHERE id = $5`,
      [encrypt(tokens.access_token), encrypt(tokens.refresh_token), expiresAt.toISOString(), "active", integrationId]
    );
  } else {
    await db.query(
      `UPDATE integrations
       SET auth_token_encrypted = $1,
           token_expires_at = $2,
           status = $3
       WHERE id = $4`,
      updates
    );
  }

  return tokens.access_token;
}

module.exports = { getValidToken, refreshToken, PROVIDER_CONFIGS };
