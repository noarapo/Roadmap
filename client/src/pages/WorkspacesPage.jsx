import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, X } from "lucide-react";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const currentYear = new Date().getFullYear();
const YEARS = [currentYear, currentYear + 1, currentYear + 2, currentYear + 3];

const MOCK_ROADMAPS = [
  {
    id: "rm-1",
    name: "Q1-Q2 Product Roadmap",
    horizon: "Jan 2026 - Jun 2026",
    lastEdited: "2 hours ago",
    collaborators: [
      { initials: "JS", color: "#2D6A5E" },
      { initials: "AK", color: "#805AD5" },
      { initials: "TM", color: "#DD6B20" },
    ],
  },
  {
    id: "rm-2",
    name: "Platform Infrastructure",
    horizon: "Mar 2026 - Dec 2026",
    lastEdited: "Yesterday",
    collaborators: [
      { initials: "JS", color: "#2D6A5E" },
      { initials: "RD", color: "#4F87C5" },
    ],
  },
  {
    id: "rm-3",
    name: "Mobile App v2",
    horizon: "Apr 2026 - Sep 2026",
    lastEdited: "3 days ago",
    collaborators: [
      { initials: "LW", color: "#E53E3E" },
      { initials: "AK", color: "#805AD5" },
      { initials: "CP", color: "#38A169" },
      { initials: "JS", color: "#2D6A5E" },
    ],
  },
];

export default function WorkspacesPage() {
  const navigate = useNavigate();
  const [roadmaps, setRoadmaps] = useState(MOCK_ROADMAPS);
  const [showModal, setShowModal] = useState(false);

  // New roadmap form state
  const [newName, setNewName] = useState("");
  const [startMonth, setStartMonth] = useState(MONTHS[new Date().getMonth()]);
  const [startYear, setStartYear] = useState(String(currentYear));
  const [endMonth, setEndMonth] = useState(MONTHS[Math.min(new Date().getMonth() + 5, 11)]);
  const [endYear, setEndYear] = useState(String(currentYear + 1));
  const [subdivision, setSubdivision] = useState("quarters");

  function handleCardClick(id) {
    navigate(`/roadmap/${id}`);
  }

  function handleCreateRoadmap() {
    if (!newName.trim()) return;
    const newRoadmap = {
      id: `rm-${Date.now()}`,
      name: newName,
      horizon: `${startMonth.slice(0, 3)} ${startYear} - ${endMonth.slice(0, 3)} ${endYear}`,
      lastEdited: "Just now",
      collaborators: [{ initials: "ME", color: "#2D6A5E" }],
    };
    setRoadmaps((prev) => [...prev, newRoadmap]);
    setShowModal(false);
    resetForm();
  }

  function resetForm() {
    setNewName("");
    setStartMonth(MONTHS[new Date().getMonth()]);
    setStartYear(String(currentYear));
    setEndMonth(MONTHS[Math.min(new Date().getMonth() + 5, 11)]);
    setEndYear(String(currentYear + 1));
    setSubdivision("quarters");
  }

  return (
    <div className="workspace-content">
      <div className="page-header">
        <h1>Your Roadmaps</h1>
      </div>

      <div className="roadmap-grid">
        {roadmaps.map((rm) => (
          <div
            key={rm.id}
            className="roadmap-card"
            onClick={() => handleCardClick(rm.id)}
          >
            <div className="roadmap-card-name">{rm.name}</div>
            <div className="roadmap-card-horizon">{rm.horizon}</div>
            <div className="roadmap-card-footer">
              <span className="roadmap-card-date">Edited {rm.lastEdited}</span>
              <div className="avatar-stack">
                {rm.collaborators.map((c, i) => (
                  <div
                    key={i}
                    className="avatar"
                    style={{ background: c.color }}
                  >
                    {c.initials}
                  </div>
                ))}
              </div>
            </div>
          </div>
        ))}

        <div className="new-roadmap-card" onClick={() => setShowModal(true)}>
          <Plus size={24} />
          <span>New Roadmap</span>
        </div>
      </div>

      {/* Create Roadmap Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Create New Roadmap</h2>
              <button
                className="btn-icon"
                onClick={() => setShowModal(false)}
              >
                <X size={18} />
              </button>
            </div>

            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">Roadmap name</label>
                <input
                  type="text"
                  className="input"
                  placeholder="e.g. Q1-Q2 Product Roadmap"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  autoFocus
                />
              </div>

              <div className="form-group">
                <label className="form-label">Time horizon start</label>
                <div style={{ display: "flex", gap: "var(--space-2)" }}>
                  <select
                    className="input"
                    value={startMonth}
                    onChange={(e) => setStartMonth(e.target.value)}
                  >
                    {MONTHS.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                  <select
                    className="input"
                    value={startYear}
                    onChange={(e) => setStartYear(e.target.value)}
                  >
                    {YEARS.map((y) => (
                      <option key={y} value={String(y)}>
                        {y}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Time horizon end</label>
                <div style={{ display: "flex", gap: "var(--space-2)" }}>
                  <select
                    className="input"
                    value={endMonth}
                    onChange={(e) => setEndMonth(e.target.value)}
                  >
                    {MONTHS.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                  <select
                    className="input"
                    value={endYear}
                    onChange={(e) => setEndYear(e.target.value)}
                  >
                    {YEARS.map((y) => (
                      <option key={y} value={String(y)}>
                        {y}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Subdivision</label>
                <div className="radio-group">
                  <div
                    className={`radio-option ${subdivision === "quarters" ? "selected" : ""}`}
                    onClick={() => setSubdivision("quarters")}
                  >
                    <div className="radio-dot">
                      <div className="radio-dot-inner" />
                    </div>
                    Quarters (Q1, Q2, Q3, Q4)
                  </div>
                  <div
                    className={`radio-option ${subdivision === "months" ? "selected" : ""}`}
                    onClick={() => setSubdivision("months")}
                  >
                    <div className="radio-dot">
                      <div className="radio-dot-inner" />
                    </div>
                    Months (Jan, Feb, Mar...)
                  </div>
                  <div
                    className={`radio-option ${subdivision === "sprints" ? "selected" : ""}`}
                    onClick={() => setSubdivision("sprints")}
                  >
                    <div className="radio-dot">
                      <div className="radio-dot-inner" />
                    </div>
                    Sprints (Sprint 1, Sprint 2...)
                  </div>
                </div>
              </div>
            </div>

            <div className="modal-footer">
              <button
                className="btn btn-secondary"
                onClick={() => setShowModal(false)}
              >
                Cancel
              </button>
              <button
                className="btn btn-primary"
                onClick={handleCreateRoadmap}
                disabled={!newName.trim()}
              >
                Create Roadmap
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
