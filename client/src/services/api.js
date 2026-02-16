/* ------------------------------------------------------------------
 *  API Service  --  /api  base URL (proxied by Vite in development)
 * ------------------------------------------------------------------ */

const BASE_URL = "/api";

/* ===== Helpers ===== */

function authHeaders() {
  const token = localStorage.getItem("token");
  const headers = { "Content-Type": "application/json" };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  return headers;
}

async function request(path, options = {}) {
  const url = `${BASE_URL}${path}`;
  const res = await fetch(url, {
    headers: authHeaders(),
    ...options,
  });

  /* Handle 204 No Content (successful DELETE, etc.) */
  if (res.status === 204) {
    return null;
  }

  /* Attempt JSON parse */
  let data;
  try {
    data = await res.json();
  } catch {
    if (!res.ok) {
      throw new Error(`Request failed with status ${res.status}`);
    }
    return null;
  }

  if (!res.ok) {
    /* 401 → token expired or invalid: clear and redirect to login */
    if (res.status === 401 && !path.startsWith("/auth/")) {
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      window.location.href = "/login";
      return;
    }
    const message = data?.error || data?.message || "Request failed";
    const err = new Error(message);
    err.status = res.status;
    err.data = data;
    throw err;
  }

  return data;
}

function get(path) {
  return request(path);
}

function post(path, body) {
  return request(path, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

function put(path, body) {
  return request(path, {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

function patch(path, body) {
  return request(path, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

function del(path) {
  return request(path, { method: "DELETE" });
}

/* ===== Auth ===== */

export function login(email, password) {
  return post("/auth/login", { email, password });
}

export function signup(email, password, name) {
  return post("/auth/signup", { email, password, name });
}

export function getMe() {
  return get("/auth/me");
}

export function updateProfile(body) {
  return put("/auth/me", body);
}

/* ===== Teams ===== */

export function getTeams(workspaceId) {
  return get(`/workspaces/${workspaceId}/teams`);
}

export function getTeam(workspaceId, teamId) {
  return get(`/workspaces/${workspaceId}/teams/${teamId}`);
}

export function createTeam(workspaceId, body) {
  return post(`/workspaces/${workspaceId}/teams`, body);
}

export function updateTeam(workspaceId, teamId, body) {
  return put(`/workspaces/${workspaceId}/teams/${teamId}`, body);
}

export function deleteTeam(workspaceId, teamId) {
  return del(`/workspaces/${workspaceId}/teams/${teamId}`);
}

/* ===== Roadmaps ===== */

export function getRoadmaps(workspaceId) {
  return get(`/roadmaps?workspace_id=${workspaceId}`);
}

export function getRoadmap(roadmapId) {
  return get(`/roadmaps/${roadmapId}`);
}

export function createRoadmap(workspaceId, body) {
  return post(`/roadmaps`, body);
}

export function updateRoadmap(roadmapId, body) {
  return patch(`/roadmaps/${roadmapId}`, body);
}

export function deleteRoadmap(roadmapId) {
  return del(`/roadmaps/${roadmapId}`);
}

export function duplicateRoadmap(roadmapId) {
  return post(`/roadmaps/${roadmapId}/duplicate`);
}

/* ===== Sprints ===== */

export function getSprints(roadmapId) {
  return get(`/roadmaps/${roadmapId}/sprints`);
}

export function createSprint(roadmapId, body) {
  return post(`/roadmaps/${roadmapId}/sprints`, body);
}

export function updateSprint(sprintId, body) {
  return patch(`/sprints/${sprintId}`, body);
}

export function deleteSprint(sprintId, moveToId) {
  const query = moveToId ? `?move_to=${moveToId}` : "";
  return del(`/sprints/${sprintId}${query}`);
}

export function bulkGenerateSprints(roadmapId, body) {
  return post(`/roadmaps/${roadmapId}/sprints/bulk-generate`, body);
}

/* ===== Rows (Team Rows in Roadmap) ===== */

export function getRoadmapRows(roadmapId) {
  return get(`/roadmaps/${roadmapId}/rows`);
}

export function createRoadmapRow(roadmapId, body) {
  return post(`/roadmaps/${roadmapId}/rows`, body);
}

export function updateRoadmapRow(roadmapId, rowId, body) {
  return patch(`/roadmaps/${roadmapId}/rows/${rowId}`, body);
}

export function deleteRoadmapRow(roadmapId, rowId) {
  return del(`/roadmaps/${roadmapId}/rows/${rowId}`);
}

export function reorderRoadmapRows(roadmapId, orderedIds) {
  return patch(`/roadmaps/${roadmapId}/rows/reorder`, { order: orderedIds });
}

/* ===== Cards (Features) ===== */

export function getCards(roadmapId) {
  return get(`/roadmaps/${roadmapId}/cards`);
}

export function getCard(cardId) {
  return get(`/cards/${cardId}`);
}

export function createCard(roadmapId, body) {
  return post(`/roadmaps/${roadmapId}/cards`, body);
}

export function updateCard(cardId, body) {
  return patch(`/cards/${cardId}`, body);
}

export function deleteCard(cardId) {
  return del(`/cards/${cardId}`);
}

export function moveCard(cardId, body) {
  return patch(`/cards/${cardId}/position`, body);
}

export function reorderCards(roadmapId, columnId, rowId, orderedIds) {
  return put(`/roadmaps/${roadmapId}/cards/reorder`, {
    columnId,
    rowId,
    orderedIds,
  });
}

/* ===== Card Dependencies ===== */

export function getCardDependencies(cardId) {
  return get(`/cards/${cardId}/dependencies`);
}

export function addCardDependency(cardId, dependsOnCardId) {
  return post(`/cards/${cardId}/dependencies`, { dependsOnCardId });
}

export function removeCardDependency(cardId, dependsOnCardId) {
  return del(`/cards/${cardId}/dependencies/${dependsOnCardId}`);
}

/* ===== Tags ===== */

export function getTags(workspaceId) {
  return get(`/workspaces/${workspaceId}/tags`);
}

export function createTag(workspaceId, body) {
  return post(`/workspaces/${workspaceId}/tags`, body);
}

export function updateTag(tagId, body) {
  return put(`/tags/${tagId}`, body);
}

export function deleteTag(tagId) {
  return del(`/tags/${tagId}`);
}

/* ===== Card Tags ===== */

export function addTagToCard(cardId, tagId) {
  return post(`/cards/${cardId}/tags`, { tagId });
}

export function removeTagFromCard(cardId, tagId) {
  return del(`/cards/${cardId}/tags/${tagId}`);
}

/* ===== Lenses ===== */

export function getLenses(workspaceId) {
  return get(`/workspaces/${workspaceId}/lenses`);
}

export function getLens(lensId) {
  return get(`/lenses/${lensId}`);
}

export function createLens(workspaceId, body) {
  return post(`/workspaces/${workspaceId}/lenses`, body);
}

export function updateLens(lensId, body) {
  return put(`/lenses/${lensId}`, body);
}

export function deleteLens(lensId) {
  return del(`/lenses/${lensId}`);
}

export function getLensScores(lensId, roadmapId) {
  const query = roadmapId ? `?roadmapId=${roadmapId}` : "";
  return get(`/lenses/${lensId}/scores${query}`);
}

export function updateLensScore(lensId, cardId, body) {
  return put(`/lenses/${lensId}/scores/${cardId}`, body);
}

/* ===== Versions / Snapshots ===== */

export function getVersions(roadmapId) {
  return get(`/roadmaps/${roadmapId}/versions`);
}

export function createVersion(roadmapId, body) {
  return post(`/roadmaps/${roadmapId}/versions`, body);
}

export function restoreVersion(roadmapId, versionId) {
  return post(`/roadmaps/${roadmapId}/versions/${versionId}/restore`);
}

export function deleteVersion(roadmapId, versionId) {
  return del(`/roadmaps/${roadmapId}/versions/${versionId}`);
}

/* ===== Comments / Activity (old — replaced by canvas comments below) ===== */

export function getCardComments(cardId) {
  return get(`/comments/card/${cardId}`);
}

export function addComment(cardId, body) {
  return post(`/comments`, { card_id: cardId, ...body });
}

/* ===== Notifications ===== */

export function getNotifications() {
  return get("/notifications");
}

export function markNotificationRead(notificationId) {
  return patch(`/notifications/${notificationId}`, { read: true });
}

export function markAllNotificationsRead() {
  return post("/notifications/read-all");
}

/* ===== Integrations ===== */

export function getIntegrations(workspaceId) {
  return get(`/workspaces/${workspaceId}/integrations`);
}

export function connectIntegration(workspaceId, body) {
  return post(`/workspaces/${workspaceId}/integrations`, body);
}

export function disconnectIntegration(workspaceId, integrationId) {
  return del(`/workspaces/${workspaceId}/integrations/${integrationId}`);
}

/* ===== Share / Collaborators ===== */

export function getRoadmapCollaborators(roadmapId) {
  return get(`/roadmaps/${roadmapId}/collaborators`);
}

export function addRoadmapCollaborator(roadmapId, body) {
  return post(`/roadmaps/${roadmapId}/collaborators`, body);
}

export function removeRoadmapCollaborator(roadmapId, userId) {
  return del(`/roadmaps/${roadmapId}/collaborators/${userId}`);
}

export function updateRoadmapCollaboratorRole(roadmapId, userId, role) {
  return patch(`/roadmaps/${roadmapId}/collaborators/${userId}`, { role });
}

/* ===== Data Mapping Layer (snake_case API ↔ camelCase frontend) ===== */

export function mapCardFromApi(c) {
  return {
    id: c.id,
    name: c.name,
    rowId: c.row_id,
    startSprintId: c.start_sprint_id || null,
    endSprintId: c.end_sprint_id || null,
    // Keep legacy fields for backward compat
    sprintStart: c.start_sprint ?? 0,
    duration: c.duration_sprints ?? 1,
    tags: (c.tags || []).map((t) => (typeof t === "string" ? t : t.name)),
    headcount: c.headcount ?? 1,
    status: c.status || "Placeholder",
    team: c.team_id || "",
    effort: c.effort ?? 0,
    description: c.description || "",
    order: c.sort_order ?? 0,
    lenses: [],
  };
}

export function mapCardToApi(c) {
  return {
    name: c.name,
    row_id: c.rowId,
    start_sprint_id: c.startSprintId,
    end_sprint_id: c.endSprintId,
    start_sprint: c.sprintStart,
    duration_sprints: c.duration,
    headcount: c.headcount,
    status: c.status,
    team_id: c.team || null,
    effort: c.effort,
    description: c.description || "",
    sort_order: c.order,
  };
}

export function mapSprintFromApi(s) {
  const days = Math.round((new Date(s.end_date) - new Date(s.start_date)) / 86400000) + 1;
  return {
    id: s.id,
    name: s.name,
    startDate: s.start_date,
    endDate: s.end_date,
    sortOrder: s.sort_order,
    goal: s.goal || "",
    status: s.status || "planned",
    days,
  };
}

export function mapRowFromApi(r) {
  return {
    id: r.id,
    name: r.name,
    color: r.color || "var(--teal)",
    sortOrder: r.sort_order ?? 0,
  };
}

export function mapRowToApi(r) {
  return {
    name: r.name,
    color: r.color,
    sort_order: r.sortOrder,
  };
}

/* ===== Canvas Comments ===== */

export function getComments(roadmapId, opts = {}) {
  const params = new URLSearchParams();
  if (opts.resolved !== undefined) params.set("resolved", opts.resolved);
  const qs = params.toString();
  return get(`/comments/roadmap/${roadmapId}${qs ? `?${qs}` : ""}`);
}

export function createComment(data) {
  return post("/comments", data);
}

export function updateComment(commentId, data) {
  return patch(`/comments/${commentId}`, data);
}

export function deleteComment(commentId) {
  return del(`/comments/${commentId}`);
}

export function resolveComment(commentId) {
  return post(`/comments/${commentId}/resolve`);
}

export function unresolveComment(commentId) {
  return post(`/comments/${commentId}/unresolve`);
}

export function toggleReaction(commentId, emoji) {
  return post(`/comments/${commentId}/reactions`, { emoji });
}

export function getTeamMembers(workspaceId) {
  return get(`/comments/team/${workspaceId}`);
}

/* ===== Workspace Settings ===== */

export function getWorkspaceSettings(workspaceId) {
  return get(`/workspace-settings/${workspaceId}`);
}

export function updateWorkspaceSettings(workspaceId, body) {
  return patch(`/workspace-settings/${workspaceId}`, body);
}

/* ===== Custom Fields ===== */

export function getCustomFields(workspaceId) {
  return get(`/custom-fields?workspace_id=${workspaceId}`);
}

export function createCustomField(body) {
  return post("/custom-fields", body);
}

export function updateCustomField(fieldId, body) {
  return patch(`/custom-fields/${fieldId}`, body);
}

export function deleteCustomField(fieldId) {
  return del(`/custom-fields/${fieldId}`);
}

/* ===== Card Teams ===== */

export function getCardTeams(cardId) {
  return get(`/cards/${cardId}/teams`);
}

export function setCardTeams(cardId, teams) {
  return put(`/cards/${cardId}/teams`, { teams });
}

/* ===== Card Custom Field Values ===== */

export function setCardCustomFields(cardId, fields) {
  return put(`/cards/${cardId}/custom-fields`, { fields });
}

/* ===== Teams (workspace-level) ===== */

export function getAllTeams(workspaceId) {
  return get(`/teams?workspace_id=${workspaceId}`);
}

export function mapRoadmapFromApi(rm) {
  return {
    id: rm.id,
    name: rm.name,
    status: rm.status || "draft",
    timeStart: rm.time_start,
    timeEnd: rm.time_end,
    subdivisionType: rm.subdivision_type,
    createdAt: rm.created_at,
    rows: (rm.rows || []).map((r) => ({
      ...mapRowFromApi(r),
      cards: (r.cards || []).map(mapCardFromApi),
    })),
    unassignedCards: (rm.unassigned_cards || []).map(mapCardFromApi),
    sprints: (rm.sprints || []).map(mapSprintFromApi),
  };
}
