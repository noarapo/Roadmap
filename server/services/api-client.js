const crypto = require("crypto");

/**
 * Generic API client wrapper with retry, rate-limit detection, and error normalization.
 * Used by both HubSpot and Linear service clients.
 */

class ApiClient {
  constructor(options = {}) {
    this.maxRetries = options.maxRetries ?? 3;
    this.baseDelay = options.baseDelay ?? 1000;
    this.timeout = options.timeout ?? 30000;
    this.name = options.name || "ApiClient";
    // Provider-specific rate limit detector: (response, body) => boolean
    this.isRateLimited = options.isRateLimited || defaultRateLimitDetector;
    // Provider-specific auth failure detector: (response, body) => boolean
    this.isAuthFailure = options.isAuthFailure || defaultAuthFailureDetector;
    // Called when auth fails — e.g., trigger token refresh
    this.onAuthFailure = options.onAuthFailure || null;
  }

  /**
   * Make an HTTP request with retry and rate-limit handling.
   * @param {string} url - Full URL
   * @param {object} options - fetch options (method, headers, body, etc.)
   * @returns {Promise<object>} - Parsed JSON response
   */
  async request(url, options = {}) {
    const correlationId = crypto.randomBytes(4).toString("hex");
    const method = (options.method || "GET").toUpperCase();

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeout);

        const res = await fetch(url, {
          ...options,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        // Try to parse body
        let body;
        const contentType = res.headers.get("content-type") || "";
        if (contentType.includes("application/json")) {
          body = await res.json();
        } else {
          body = await res.text();
        }

        // Check rate limiting
        if (this.isRateLimited(res, body) && attempt < this.maxRetries) {
          const delay = Math.pow(2, attempt) * this.baseDelay;
          console.log(`[${this.name}] Rate limited (attempt ${attempt + 1}/${this.maxRetries}), retrying in ${delay}ms [${correlationId}]`);
          await sleep(delay);
          continue;
        }

        // Check auth failure
        if (this.isAuthFailure(res, body)) {
          if (this.onAuthFailure && attempt === 0) {
            console.log(`[${this.name}] Auth failure, attempting token refresh [${correlationId}]`);
            const newToken = await this.onAuthFailure();
            if (newToken && options.headers) {
              options.headers["Authorization"] = `Bearer ${newToken}`;
              continue;
            }
          }
          throw new ApiError(`Authentication failed`, 401, body, this.name);
        }

        // Check for HTTP errors
        if (!res.ok) {
          const detail = body?.errors?.[0]?.message || (typeof body === "string" ? body : JSON.stringify(body));
          throw new ApiError(
            `${method} ${url} failed with status ${res.status}: ${detail}`,
            res.status,
            body,
            this.name
          );
        }

        // Check for GraphQL-level errors (HTTP 200 but errors array)
        if (body && typeof body === "object" && Array.isArray(body.errors) && body.errors.length > 0) {
          const gqlError = body.errors[0];
          // Check if it's a rate limit error
          if (gqlError.extensions?.code === "RATELIMITED" && attempt < this.maxRetries) {
            const delay = Math.pow(2, attempt) * this.baseDelay;
            console.log(`[${this.name}] GraphQL rate limited (attempt ${attempt + 1}/${this.maxRetries}), retrying in ${delay}ms [${correlationId}]`);
            await sleep(delay);
            continue;
          }
          // Still return data if partial success
          if (body.data) {
            console.warn(`[${this.name}] GraphQL partial success with errors [${correlationId}]:`, body.errors);
            return body;
          }
          throw new ApiError(
            gqlError.message || "GraphQL error",
            200,
            body,
            this.name
          );
        }

        return body;
      } catch (err) {
        if (err instanceof ApiError) throw err;

        if (err.name === "AbortError") {
          if (attempt < this.maxRetries) {
            const delay = Math.pow(2, attempt) * this.baseDelay;
            console.log(`[${this.name}] Request timeout (attempt ${attempt + 1}/${this.maxRetries}), retrying in ${delay}ms [${correlationId}]`);
            await sleep(delay);
            continue;
          }
          throw new ApiError(`Request timeout after ${this.timeout}ms`, 408, null, this.name);
        }

        if (attempt < this.maxRetries) {
          const delay = Math.pow(2, attempt) * this.baseDelay;
          console.log(`[${this.name}] Network error (attempt ${attempt + 1}/${this.maxRetries}), retrying in ${delay}ms [${correlationId}]: ${err.message}`);
          await sleep(delay);
          continue;
        }

        throw new ApiError(`Network error: ${err.message}`, 0, null, this.name);
      }
    }
  }
}

class ApiError extends Error {
  constructor(message, statusCode, responseBody, provider) {
    super(message);
    this.name = "ApiError";
    this.statusCode = statusCode;
    this.responseBody = responseBody;
    this.provider = provider;
  }
}

function defaultRateLimitDetector(res) {
  return res.status === 429;
}

function defaultAuthFailureDetector(res) {
  return res.status === 401;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

module.exports = { ApiClient, ApiError };
