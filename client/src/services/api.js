const API_BASE = "http://localhost:3001/api";

async function request(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (res.status === 204) return null;
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

// Roadmaps
export const getRoadmaps = () => request("/roadmaps");
export const getRoadmap = (id) => request(`/roadmaps/${id}`);
export const createRoadmap = (body) => request("/roadmaps", { method: "POST", body: JSON.stringify(body) });
export const updateRoadmap = (id, body) => request(`/roadmaps/${id}`, { method: "PUT", body: JSON.stringify(body) });
export const deleteRoadmap = (id) => request(`/roadmaps/${id}`, { method: "DELETE" });

// Milestones
export const createMilestone = (roadmapId, body) => request(`/roadmaps/${roadmapId}/milestones`, { method: "POST", body: JSON.stringify(body) });
export const updateMilestone = (id, body) => request(`/roadmaps/milestones/${id}`, { method: "PUT", body: JSON.stringify(body) });
export const deleteMilestone = (id) => request(`/roadmaps/milestones/${id}`, { method: "DELETE" });

// Tasks
export const createTask = (milestoneId, body) => request(`/roadmaps/milestones/${milestoneId}/tasks`, { method: "POST", body: JSON.stringify(body) });
export const updateTask = (id, body) => request(`/roadmaps/tasks/${id}`, { method: "PUT", body: JSON.stringify(body) });
export const deleteTask = (id) => request(`/roadmaps/tasks/${id}`, { method: "DELETE" });

// Agent
export const executeAgent = (action, params) => request("/agent/execute", { method: "POST", body: JSON.stringify({ action, params }) });
export const getAgentLogs = (roadmapId) => request(`/agent/logs${roadmapId ? `?roadmap_id=${roadmapId}` : ""}`);
export const getAgentCapabilities = () => request("/agent/capabilities");
