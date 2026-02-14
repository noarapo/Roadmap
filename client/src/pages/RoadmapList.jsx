import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getRoadmaps, createRoadmap, deleteRoadmap } from "../services/api";

export default function RoadmapList() {
  const [roadmaps, setRoadmaps] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadRoadmaps();
  }, []);

  async function loadRoadmaps() {
    setLoading(true);
    try {
      setRoadmaps(await getRoadmaps());
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  }

  async function handleCreate(e) {
    e.preventDefault();
    if (!title.trim()) return;
    await createRoadmap({ title, description });
    setTitle("");
    setDescription("");
    setShowForm(false);
    loadRoadmaps();
  }

  async function handleDelete(id) {
    if (!confirm("Delete this roadmap and all its data?")) return;
    await deleteRoadmap(id);
    loadRoadmaps();
  }

  const statusColors = { draft: "#6b7280", active: "#2563eb", completed: "#16a34a", archived: "#9333ea" };

  if (loading) return <div className="loading">Loading roadmaps...</div>;

  return (
    <div className="page">
      <div className="page-header">
        <h1>Your Roadmaps</h1>
        <button className="btn btn-primary" onClick={() => setShowForm(!showForm)}>
          {showForm ? "Cancel" : "+ New Roadmap"}
        </button>
      </div>

      {showForm && (
        <form className="card form-card" onSubmit={handleCreate}>
          <input
            type="text"
            placeholder="Roadmap title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            autoFocus
          />
          <textarea
            placeholder="Description (optional)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
          />
          <button className="btn btn-primary" type="submit">Create Roadmap</button>
        </form>
      )}

      {roadmaps.length === 0 ? (
        <div className="empty-state">
          <h2>No roadmaps yet</h2>
          <p>Create your first roadmap or use the Developer Agent to generate one.</p>
        </div>
      ) : (
        <div className="roadmap-grid">
          {roadmaps.map((r) => (
            <div key={r.id} className="card roadmap-card">
              <div className="card-header">
                <Link to={`/roadmap/${r.id}`} className="card-title">{r.title}</Link>
                <span className="status-badge" style={{ background: statusColors[r.status] || "#6b7280" }}>
                  {r.status}
                </span>
              </div>
              {r.description && <p className="card-desc">{r.description}</p>}
              <div className="card-footer">
                <span className="meta">Created {new Date(r.created_at).toLocaleDateString()}</span>
                <button className="btn btn-danger btn-sm" onClick={() => handleDelete(r.id)}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
