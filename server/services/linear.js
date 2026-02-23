const crypto = require("crypto");
const { ApiClient } = require("./api-client");
const { getValidToken, PROVIDER_CONFIGS } = require("./token-manager");

const LINEAR_CLIENT_ID = process.env.LINEAR_CLIENT_ID;
const LINEAR_CLIENT_SECRET = process.env.LINEAR_CLIENT_SECRET;
const LINEAR_REDIRECT_URI = process.env.LINEAR_REDIRECT_URI;

const LINEAR_AUTH_URL = "https://linear.app/oauth/authorize";
const LINEAR_TOKEN_URL = "https://api.linear.app/oauth/token";
const LINEAR_GRAPHQL_URL = "https://api.linear.app/graphql";

/* ------------------------------------------------------------------ */
/*  PKCE helpers                                                       */
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

function getAuthUrl(state) {
  if (!LINEAR_CLIENT_ID || !LINEAR_REDIRECT_URI) {
    throw new Error("Linear OAuth is not configured (LINEAR_CLIENT_ID and LINEAR_REDIRECT_URI required)");
  }

  const codeVerifier = generateCodeVerifier();
  const codeChallenge = generateCodeChallenge(codeVerifier);

  const params = new URLSearchParams({
    client_id: LINEAR_CLIENT_ID,
    redirect_uri: LINEAR_REDIRECT_URI,
    response_type: "code",
    scope: "read,write",
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    actor: "app",
  });

  return { url: `${LINEAR_AUTH_URL}?${params.toString()}`, codeVerifier };
}

async function exchangeCodeForTokens(code, codeVerifier) {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: LINEAR_CLIENT_ID,
    client_secret: LINEAR_CLIENT_SECRET,
    redirect_uri: LINEAR_REDIRECT_URI,
    code,
    code_verifier: codeVerifier,
  });

  const res = await fetch(LINEAR_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Linear token exchange failed: ${err}`);
  }

  return res.json();
}

/* ------------------------------------------------------------------ */
/*  GraphQL client                                                      */
/* ------------------------------------------------------------------ */

function createLinearClient(integrationId) {
  return new ApiClient({
    name: "Linear",
    maxRetries: 3,
    baseDelay: 1000,
    timeout: 30000,
    isRateLimited: (res, body) => {
      if (res.status === 429) return true;
      if (body && typeof body === "object" && Array.isArray(body.errors)) {
        return body.errors.some((e) => e.extensions?.code === "RATELIMITED");
      }
      return false;
    },
    onAuthFailure: async () => {
      try {
        return await getValidToken(integrationId);
      } catch {
        return null;
      }
    },
  });
}

/**
 * Execute a GraphQL query against Linear's API.
 */
async function linearGraphQL(integrationId, query, variables = {}) {
  const accessToken = await getValidToken(integrationId);
  const client = createLinearClient(integrationId);

  const result = await client.request(LINEAR_GRAPHQL_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, variables }),
  });

  return result;
}

/* ------------------------------------------------------------------ */
/*  API methods                                                         */
/* ------------------------------------------------------------------ */

async function fetchViewer(integrationId) {
  const result = await linearGraphQL(integrationId, `
    query {
      viewer {
        id
        name
        email
        organization {
          id
          name
          urlKey
        }
      }
    }
  `);
  return result.data?.viewer;
}

async function createWebhook(integrationId, webhookUrl) {
  const result = await linearGraphQL(integrationId, `
    mutation($input: WebhookCreateInput!) {
      webhookCreate(input: $input) {
        success
        webhook {
          id
          enabled
          secret
        }
      }
    }
  `, {
    input: {
      url: webhookUrl,
      resourceTypes: ["Issue", "Project", "ProjectUpdate"],
      allPublicTeams: true,
      label: "Roadway Integration",
    },
  });
  return result.data?.webhookCreate;
}

async function fetchTeams(integrationId) {
  const result = await linearGraphQL(integrationId, `
    query {
      teams {
        nodes {
          id
          name
          key
          description
        }
      }
    }
  `);
  return result.data?.teams?.nodes || [];
}

async function fetchWorkflowStates(integrationId) {
  const result = await linearGraphQL(integrationId, `
    query {
      workflowStates {
        nodes {
          id
          name
          color
          type
          position
          team {
            id
            name
          }
        }
      }
    }
  `);
  return result.data?.workflowStates?.nodes || [];
}

async function fetchProjects(integrationId, options = {}) {
  const { after, teamId, includeCompleted } = options;
  const variables = {};
  if (after) variables.after = after;

  // Build filter
  let filterArg = "";
  if (!includeCompleted) {
    filterArg = ', filter: { state: { nin: ["completed", "cancelled"] } }';
  }

  const result = await linearGraphQL(integrationId, `
    query($after: String) {
      projects(
        first: 50
        after: $after
        ${filterArg}
      ) {
        pageInfo {
          hasNextPage
          endCursor
        }
        nodes {
          id
          name
          slugId
          description
          state
          health
          progress
          startDate
          targetDate
          teams {
            nodes {
              id
              name
            }
          }
          initiatives {
            nodes {
              id
              name
            }
          }
          lead {
            id
            name
            avatarUrl
          }
          issues {
            nodes {
              id
            }
          }
        }
      }
    }
  `, variables);

  const projects = result.data?.projects;
  if (!projects) return { nodes: [], pageInfo: { hasNextPage: false } };

  // Client-side team filter if specified
  let nodes = projects.nodes || [];
  if (teamId) {
    nodes = nodes.filter((p) =>
      p.teams?.nodes?.some((t) => t.id === teamId)
    );
  }

  return {
    nodes,
    pageInfo: projects.pageInfo || { hasNextPage: false },
  };
}

async function fetchAllProjects(integrationId, options = {}) {
  const allNodes = [];
  let after = null;

  do {
    const result = await fetchProjects(integrationId, { ...options, after });
    allNodes.push(...result.nodes);
    if (result.pageInfo.hasNextPage) {
      after = result.pageInfo.endCursor;
    } else {
      break;
    }
  } while (after);

  return allNodes;
}

async function fetchInitiatives(integrationId) {
  try {
    const result = await linearGraphQL(integrationId, `
      query {
        initiatives {
          nodes {
            id
            name
            description
            status
            projects {
              nodes {
                id
                name
              }
            }
          }
        }
      }
    `);
    return result.data?.initiatives?.nodes || [];
  } catch {
    // Initiatives API may not be available on all Linear plans
    return [];
  }
}

async function fetchProjectIssues(integrationId, projectId) {
  const allIssues = [];
  let after = null;

  do {
    const result = await linearGraphQL(integrationId, `
      query($projectId: String!, $after: String) {
        project(id: $projectId) {
          issues(first: 50, after: $after) {
            pageInfo {
              hasNextPage
              endCursor
            }
            nodes {
              id
              identifier
              title
              description
              state {
                id
                name
                type
                color
              }
              assignee {
                id
                name
                avatarUrl
              }
              estimate
              priority
              priorityLabel
              labels {
                nodes {
                  id
                  name
                  color
                }
              }
              url
              startedAt
              completedAt
              createdAt
              updatedAt
            }
          }
        }
      }
    `, { projectId, after });

    const issues = result.data?.project?.issues;
    if (!issues) break;

    allIssues.push(...(issues.nodes || []));

    if (issues.pageInfo?.hasNextPage) {
      after = issues.pageInfo.endCursor;
    } else {
      break;
    }
  } while (after);

  return allIssues;
}

/**
 * Map Linear state type to a normalized status category.
 */
async function createIssue(integrationId, { teamId, title, description, priority }) {
  const result = await linearGraphQL(integrationId, `
    mutation($input: IssueCreateInput!) {
      issueCreate(input: $input) {
        success
        issue {
          id
          identifier
          title
          url
          state { name type }
          priority
          priorityLabel
          createdAt
        }
      }
    }
  `, {
    input: {
      teamId,
      title,
      description: description || undefined,
      priority: priority || undefined,
    },
  });
  return result.data?.issueCreate;
}

function normalizeStateType(stateType) {
  switch (stateType) {
    case "triage":
    case "backlog":
    case "unstarted":
      return "todo";
    case "started":
      return "in_progress";
    case "completed":
      return "done";
    case "cancelled":
      return "cancelled";
    default:
      return "todo";
  }
}

module.exports = {
  getAuthUrl,
  exchangeCodeForTokens,
  linearGraphQL,
  fetchViewer,
  createWebhook,
  fetchTeams,
  fetchWorkflowStates,
  fetchProjects,
  fetchAllProjects,
  fetchInitiatives,
  fetchProjectIssues,
  createIssue,
  normalizeStateType,
};
