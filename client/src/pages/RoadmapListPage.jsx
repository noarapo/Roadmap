import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Map } from "lucide-react";
import { getRoadmaps, createRoadmap, updateProfile } from "../services/api";

export default function RoadmapListPage() {
  const navigate = useNavigate();
  const [roadmaps, setRoadmaps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  const user = JSON.parse(localStorage.getItem("user") || "{}");
  const workspaceId = user.workspace_id;

  useEffect(() => {
    if (!workspaceId) return;
    getRoadmaps(workspaceId)
      .then((data) => {
        setRoadmaps(Array.isArray(data) ? data : []);
      })
      .catch(() => setRoadmaps([]))
      .finally(() => setLoading(false));
  }, [workspaceId]);

  async function handleCreate() {
    if (!workspaceId || creating) return;
    setCreating(true);
    try {
      const rm = await createRoadmap(workspaceId, {
        workspace_id: workspaceId,
        name: "Untitled Roadmap",
        created_by: user.id,
      });
      await updateProfile({ last_roadmap_id: rm.id });
      const updatedUser = { ...user, lastRoadmapId: rm.id, last_roadmap_id: rm.id };
      localStorage.setItem("user", JSON.stringify(updatedUser));
      navigate(`/roadmap/${rm.id}`);
    } catch (err) {
      console.error("Failed to create roadmap:", err);
    } finally {
      setCreating(false);
    }
  }

  function handleOpen(rmId) {
    updateProfile({ last_roadmap_id: rmId }).catch(() => {});
    const updatedUser = { ...user, lastRoadmapId: rmId, last_roadmap_id: rmId };
    localStorage.setItem("user", JSON.stringify(updatedUser));
    navigate(`/roadmap/${rmId}`);
  }

  if (loading) {
    return (
      <div style={{ padding: 40, display: "flex", justifyContent: "center" }}>
        <span className="text-muted">Loading roadmaps...</span>
      </div>
    );
  }

  if (roadmaps.length === 0) {
    return (
      <div className="empty-roadmap-list">
        <div className="empty-roadmap-icon">
          <Map size={48} strokeWidth={1.5} />
        </div>
        <h2 style={{ fontSize: 20, fontWeight: 700, margin: "16px 0 8px" }}>No roadmaps yet</h2>
        <p className="text-muted" style={{ fontSize: 14, marginBottom: 24 }}>
          Create your first roadmap to start planning.
        </p>
        <button className="btn btn-primary" onClick={handleCreate} disabled={creating}>
          <Plus size={16} />
          {creating ? "Creating..." : "New Roadmap"}
        </button>
      </div>
    );
  }

  return (
    <div style={{ padding: "32px 40px", maxWidth: 800 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700 }}>Roadmaps</h1>
        <button className="btn btn-primary" onClick={handleCreate} disabled={creating}>
          <Plus size={16} />
          {creating ? "Creating..." : "New Roadmap"}
        </button>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {roadmaps.map((rm) => (
          <button
            key={rm.id}
            type="button"
            onClick={() => handleOpen(rm.id)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "14px 16px",
              background: "var(--bg-primary)",
              border: "1px solid var(--border-default)",
              borderRadius: 8,
              cursor: "pointer",
              textAlign: "left",
              width: "100%",
            }}
          >
            <Map size={18} style={{ color: "var(--teal)", flexShrink: 0 }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: 14 }}>{rm.name}</div>
              <div className="text-muted" style={{ fontSize: 12, marginTop: 2 }}>
                {rm.status || "draft"} &middot; Created {new Date(rm.created_at).toLocaleDateString()}
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
