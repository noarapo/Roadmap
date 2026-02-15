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
  return get(`/workspaces/${workspaceId}/roadmaps`);
}

export function getRoadmap(roadmapId) {
  return get(`/roadmaps/${roadmapId}`);
}

export function createRoadmap(workspaceId, body) {
  return post(`/workspaces/${workspaceId}/roadmaps`, body);
}

export function updateRoadmap(roadmapId, body) {
  return put(`/roadmaps/${roadmapId}`, body);
}

export function deleteRoadmap(roadmapId) {
  return del(`/roadmaps/${roadmapId}`);
}

export function duplicateRoadmap(roadmapId) {
  return post(`/roadmaps/${roadmapId}/duplicate`);
}

/* ===== Roadmap Columns (Sprints / Time Periods) ===== */

export function getRoadmapColumns(roadmapId) {
  return get(`/roadmaps/${roadmapId}/columns`);
}

export function createRoadmapColumn(roadmapId, body) {
  return post(`/roadmaps/${roadmapId}/columns`, body);
}

export function updateRoadmapColumn(roadmapId, columnId, body) {
  return put(`/roadmaps/${roadmapId}/columns/${columnId}`, body);
}

export function deleteRoadmapColumn(roadmapId, columnId) {
  return del(`/roadmaps/${roadmapId}/columns/${columnId}`);
}

/* ===== Rows (Team Rows in Roadmap) ===== */

export function getRoadmapRows(roadmapId) {
  return get(`/roadmaps/${roadmapId}/rows`);
}

export function createRoadmapRow(roadmapId, body) {
  return post(`/roadmaps/${roadmapId}/rows`, body);
}

export function updateRoadmapRow(roadmapId, rowId, body) {
  return put(`/roadmaps/${roadmapId}/rows/${rowId}`, body);
}

export function deleteRoadmapRow(roadmapId, rowId) {
  return del(`/roadmaps/${roadmapId}/rows/${rowId}`);
}

export function reorderRoadmapRows(roadmapId, orderedIds) {
  return put(`/roadmaps/${roadmapId}/rows/reorder`, { orderedIds });
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
  return put(`/cards/${cardId}`, body);
}

export function deleteCard(cardId) {
  return del(`/cards/${cardId}`);
}

export function moveCard(cardId, body) {
  return patch(`/cards/${cardId}/move`, body);
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

/* ===== Comments / Activity ===== */

export function getComments(cardId) {
  return get(`/cards/${cardId}/comments`);
}

export function addComment(cardId, body) {
  return post(`/cards/${cardId}/comments`, body);
}

export function deleteComment(commentId) {
  return del(`/comments/${commentId}`);
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
