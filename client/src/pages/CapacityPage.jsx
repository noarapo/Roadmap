import React, { useState } from "react";
import { Plus, X, Users, Calendar } from "lucide-react";

// ---- Mock Data ----

const TEAM_COLORS = ["#2D6A5E", "#805AD5", "#DD6B20", "#E53E3E", "#4F87C5"];

const INITIAL_TEAMS = [
  {
    id: "t-1",
    name: "Platform",
    color: TEAM_COLORS[0],
    developers: 6,
    avgOutput: 8,
    sprintLength: 2,
    method: "Story Points",
  },
  {
    id: "t-2",
    name: "Mobile",
    color: TEAM_COLORS[1],
    developers: 4,
    avgOutput: 10,
    sprintLength: 2,
    method: "Story Points",
  },
  {
    id: "t-3",
    name: "Data",
    color: TEAM_COLORS[2],
    developers: 3,
    avgOutput: 6,
    sprintLength: 2,
    method: "Hours",
  },
];

const SPRINT_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun"];

const SPRINT_DATA = {
  "t-1": {
    Jan: { used: 34, total: 48 },
    Feb: { used: 42, total: 48 },
    Mar: { used: 50, total: 48 },
    Apr: { used: 38, total: 48 },
    May: { used: 44, total: 48 },
    Jun: { used: 30, total: 48 },
  },
  "t-2": {
    Jan: { used: 28, total: 40 },
    Feb: { used: 36, total: 40 },
    Mar: { used: 40, total: 40 },
    Apr: { used: 32, total: 40 },
    May: { used: 38, total: 40 },
    Jun: { used: 25, total: 40 },
  },
  "t-3": {
    Jan: { used: 14, total: 18 },
    Feb: { used: 16, total: 18 },
    Mar: { used: 20, total: 18 },
    Apr: { used: 12, total: 18 },
    May: { used: 15, total: 18 },
    Jun: { used: 10, total: 18 },
  },
};

const INITIAL_TIME_OFF = [
  {
    id: "to-1",
    person: "Alice Chen",
    team: "Platform",
    startDate: "Feb 10, 2026",
    endDate: "Feb 14, 2026",
    type: "VACATION",
  },
  {
    id: "to-2",
    person: "Marcus Kim",
    team: "Mobile",
    startDate: "Mar 3, 2026",
    endDate: "Mar 5, 2026",
    type: "SICK",
  },
  {
    id: "to-3",
    person: "All Teams",
    team: "--",
    startDate: "Jan 20, 2026",
    endDate: "Jan 20, 2026",
    type: "HOLIDAY",
  },
  {
    id: "to-4",
    person: "Priya Patel",
    team: "Data",
    startDate: "Apr 7, 2026",
    endDate: "Apr 18, 2026",
    type: "VACATION",
  },
];

// ---- Helpers ----

function getHealthColor(used, total) {
  const pct = (used / total) * 100;
  if (pct > 100) return "red";
  if (pct >= 80) return "yellow";
  return "green";
}

function getBaseCapacity(team) {
  return team.developers * team.avgOutput;
}

function typeBadgeClass(type) {
  switch (type) {
    case "VACATION":
      return "badge badge-blue";
    case "SICK":
      return "badge badge-red";
    case "HOLIDAY":
      return "badge badge-teal";
    default:
      return "badge badge-gray";
  }
}

// ---- Component ----

export default function CapacityPage() {
  const [teams, setTeams] = useState(INITIAL_TEAMS);
  const [timeOff, setTimeOff] = useState(INITIAL_TIME_OFF);
  const [editingTeamId, setEditingTeamId] = useState(null);
  const [editFields, setEditFields] = useState({});
  const [showAddTeam, setShowAddTeam] = useState(false);
  const [showAddTimeOff, setShowAddTimeOff] = useState(false);

  // New team form
  const [newTeamName, setNewTeamName] = useState("");
  const [newTeamDevs, setNewTeamDevs] = useState(4);
  const [newTeamAvg, setNewTeamAvg] = useState(8);
  const [newTeamMethod, setNewTeamMethod] = useState("Story Points");
  const [newTeamSprint, setNewTeamSprint] = useState(2);

  // New time off form
  const [toName, setToName] = useState("");
  const [toTeam, setToTeam] = useState("");
  const [toStart, setToStart] = useState("");
  const [toEnd, setToEnd] = useState("");
  const [toType, setToType] = useState("VACATION");

  function startEditing(team) {
    setEditingTeamId(team.id);
    setEditFields({
      name: team.name,
      developers: team.developers,
      avgOutput: team.avgOutput,
      method: team.method,
      sprintLength: team.sprintLength,
    });
  }

  function saveEditing() {
    setTeams((prev) =>
      prev.map((t) =>
        t.id === editingTeamId ? { ...t, ...editFields } : t
      )
    );
    setEditingTeamId(null);
    setEditFields({});
  }

  function cancelEditing() {
    setEditingTeamId(null);
    setEditFields({});
  }

  function handleAddTeam() {
    if (!newTeamName.trim()) return;
    const newTeam = {
      id: `t-${Date.now()}`,
      name: newTeamName,
      color: TEAM_COLORS[teams.length % TEAM_COLORS.length],
      developers: newTeamDevs,
      avgOutput: newTeamAvg,
      sprintLength: newTeamSprint,
      method: newTeamMethod,
    };
    setTeams((prev) => [...prev, newTeam]);
    setNewTeamName("");
    setNewTeamDevs(4);
    setNewTeamAvg(8);
    setNewTeamMethod("Story Points");
    setNewTeamSprint(2);
    setShowAddTeam(false);
  }

  function handleAddTimeOff() {
    if (!toName.trim() || !toStart || !toEnd) return;
    const entry = {
      id: `to-${Date.now()}`,
      person: toName,
      team: toTeam || "--",
      startDate: toStart,
      endDate: toEnd,
      type: toType,
    };
    setTimeOff((prev) => [...prev, entry]);
    setToName("");
    setToTeam("");
    setToStart("");
    setToEnd("");
    setToType("VACATION");
    setShowAddTimeOff(false);
  }

  function removeTimeOff(id) {
    setTimeOff((prev) => prev.filter((e) => e.id !== id));
  }

  return (
    <div className="capacity-page">
      <h1 style={{ marginBottom: "var(--space-6)" }}>Capacity Management</h1>

      {/* ---- Teams Section ---- */}
      <h2 style={{ marginBottom: "var(--space-4)" }}>Teams</h2>
      <div className="team-grid">
        {teams.map((team) => {
          const isEditing = editingTeamId === team.id;

          return (
            <div key={team.id} className="team-card">
              <div className="team-card-header">
                <div className="team-card-name">
                  <span
                    className="color-dot color-dot-lg"
                    style={{ background: team.color }}
                  />
                  {isEditing ? (
                    <input
                      className="inline-input"
                      value={editFields.name}
                      onChange={(e) =>
                        setEditFields((f) => ({ ...f, name: e.target.value }))
                      }
                      style={{ fontSize: "16px", fontWeight: 700 }}
                    />
                  ) : (
                    team.name
                  )}
                </div>
                {isEditing ? (
                  <div style={{ display: "flex", gap: "var(--space-2)" }}>
                    <button
                      className="btn btn-primary"
                      style={{ fontSize: "12px", padding: "4px 10px" }}
                      onClick={saveEditing}
                    >
                      Save
                    </button>
                    <button
                      className="btn btn-secondary"
                      style={{ fontSize: "12px", padding: "4px 10px" }}
                      onClick={cancelEditing}
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <a
                    href="#"
                    onClick={(e) => {
                      e.preventDefault();
                      startEditing(team);
                    }}
                    style={{ fontSize: "13px" }}
                  >
                    Edit
                  </a>
                )}
              </div>

              <div className="team-stats">
                <div className="team-stat">
                  <span className="team-stat-label">Developers</span>
                  {isEditing ? (
                    <input
                      type="number"
                      className="inline-input"
                      value={editFields.developers}
                      onChange={(e) =>
                        setEditFields((f) => ({
                          ...f,
                          developers: parseInt(e.target.value, 10) || 0,
                        }))
                      }
                      style={{ fontSize: "16px", fontWeight: 700, width: "60px" }}
                    />
                  ) : (
                    <span className="team-stat-value">{team.developers}</span>
                  )}
                </div>
                <div className="team-stat">
                  <span className="team-stat-label">Avg Output</span>
                  {isEditing ? (
                    <input
                      type="number"
                      className="inline-input"
                      value={editFields.avgOutput}
                      onChange={(e) =>
                        setEditFields((f) => ({
                          ...f,
                          avgOutput: parseInt(e.target.value, 10) || 0,
                        }))
                      }
                      style={{ fontSize: "16px", fontWeight: 700, width: "60px" }}
                    />
                  ) : (
                    <span className="team-stat-value">{team.avgOutput}</span>
                  )}
                </div>
                <div className="team-stat">
                  <span className="team-stat-label">Base Capacity</span>
                  <span className="team-stat-value">
                    {getBaseCapacity(isEditing ? { ...team, ...editFields } : team)}
                  </span>
                </div>
                <div className="team-stat">
                  <span className="team-stat-label">Method</span>
                  {isEditing ? (
                    <select
                      className="inline-input"
                      value={editFields.method}
                      onChange={(e) =>
                        setEditFields((f) => ({ ...f, method: e.target.value }))
                      }
                      style={{ fontSize: "13px", fontWeight: 600 }}
                    >
                      <option value="Story Points">Story Points</option>
                      <option value="Hours">Hours</option>
                      <option value="Tasks">Tasks</option>
                    </select>
                  ) : (
                    <span className="team-stat-value" style={{ fontSize: "13px" }}>
                      {team.method}
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {/* Add Team Card */}
        <div
          className="add-team-card"
          onClick={() => setShowAddTeam(true)}
        >
          <Plus size={24} />
          <span>Add Team</span>
        </div>
      </div>

      {/* Add Team Modal */}
      {showAddTeam && (
        <div className="modal-overlay" onClick={() => setShowAddTeam(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Add Team</h2>
              <button className="btn-icon" onClick={() => setShowAddTeam(false)}>
                <X size={18} />
              </button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">Team name</label>
                <input
                  className="input"
                  placeholder="e.g. Backend"
                  value={newTeamName}
                  onChange={(e) => setNewTeamName(e.target.value)}
                  autoFocus
                />
              </div>
              <div className="form-group">
                <label className="form-label">Developers</label>
                <input
                  className="input"
                  type="number"
                  min="1"
                  value={newTeamDevs}
                  onChange={(e) => setNewTeamDevs(parseInt(e.target.value, 10) || 1)}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Avg output per dev per sprint</label>
                <input
                  className="input"
                  type="number"
                  min="1"
                  value={newTeamAvg}
                  onChange={(e) => setNewTeamAvg(parseInt(e.target.value, 10) || 1)}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Capacity method</label>
                <select
                  className="input"
                  value={newTeamMethod}
                  onChange={(e) => setNewTeamMethod(e.target.value)}
                >
                  <option value="Story Points">Story Points</option>
                  <option value="Hours">Hours</option>
                  <option value="Tasks">Tasks</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Sprint length (weeks)</label>
                <select
                  className="input"
                  value={newTeamSprint}
                  onChange={(e) => setNewTeamSprint(parseInt(e.target.value, 10))}
                >
                  <option value={1}>1 week</option>
                  <option value={2}>2 weeks</option>
                  <option value={3}>3 weeks</option>
                  <option value={4}>4 weeks</option>
                </select>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowAddTeam(false)}>
                Cancel
              </button>
              <button
                className="btn btn-primary"
                onClick={handleAddTeam}
                disabled={!newTeamName.trim()}
              >
                Add Team
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---- Sprint Capacity Grid ---- */}
      <h2 style={{ marginBottom: "var(--space-4)" }}>Sprint Capacity Grid</h2>
      <div className="sprint-capacity-table">
        <table>
          <thead>
            <tr>
              <th>Team</th>
              {SPRINT_MONTHS.map((m) => (
                <th key={m}>{m}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {teams.map((team) => (
              <tr key={team.id}>
                <td>
                  <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
                    <span
                      className="color-dot color-dot-md"
                      style={{ background: team.color }}
                    />
                    <span style={{ fontWeight: 600 }}>{team.name}</span>
                  </div>
                </td>
                {SPRINT_MONTHS.map((month) => {
                  const data = SPRINT_DATA[team.id]
                    ? SPRINT_DATA[team.id][month]
                    : null;
                  if (!data) {
                    return (
                      <td key={month}>
                        <span className="text-muted">--</span>
                      </td>
                    );
                  }
                  const pct = Math.round((data.used / data.total) * 100);
                  const healthColor = getHealthColor(data.used, data.total);
                  return (
                    <td key={month}>
                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                          gap: "var(--space-1)",
                        }}
                      >
                        <div className="health-bar">
                          <div
                            className={`health-bar-fill ${healthColor}`}
                            style={{ width: `${Math.min(pct, 100)}%` }}
                          />
                        </div>
                        <span className="capacity-numbers">
                          {data.used}/{data.total}
                        </span>
                        {pct > 100 && (
                          <span className="badge-over">OVER</span>
                        )}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ---- Time Off Section ---- */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "var(--space-4)",
        }}
      >
        <h2>Time Off</h2>
        <button
          className="btn btn-primary"
          onClick={() => setShowAddTimeOff(true)}
        >
          <Plus size={14} />
          Add Time Off
        </button>
      </div>

      <div className="time-off-list">
        {timeOff.map((entry) => (
          <div key={entry.id} className="time-off-item">
            <div className="time-off-info">
              <div className="avatar" style={{ background: "var(--teal)" }}>
                {entry.person
                  .split(" ")
                  .map((w) => w[0])
                  .join("")
                  .slice(0, 2)}
              </div>
              <div>
                <div style={{ fontWeight: 600, fontSize: "13px" }}>
                  {entry.person}
                </div>
                <div className="text-muted" style={{ fontSize: "12px" }}>
                  {entry.team} &middot; {entry.startDate}
                  {entry.startDate !== entry.endDate && ` - ${entry.endDate}`}
                </div>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
              <span className={typeBadgeClass(entry.type)}>{entry.type}</span>
              <button
                className="btn-icon"
                onClick={() => removeTimeOff(entry.id)}
              >
                <X size={14} />
              </button>
            </div>
          </div>
        ))}
        {timeOff.length === 0 && (
          <div className="empty-state">
            <Calendar size={32} className="empty-state-icon" />
            <div className="empty-state-title">No time off entries</div>
            <div className="empty-state-subtitle">
              Add time off to adjust sprint capacity.
            </div>
          </div>
        )}
      </div>

      {/* Add Time Off Modal */}
      {showAddTimeOff && (
        <div className="modal-overlay" onClick={() => setShowAddTimeOff(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Add Time Off</h2>
              <button
                className="btn-icon"
                onClick={() => setShowAddTimeOff(false)}
              >
                <X size={18} />
              </button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">Person</label>
                <input
                  className="input"
                  placeholder="e.g. Jane Smith"
                  value={toName}
                  onChange={(e) => setToName(e.target.value)}
                  autoFocus
                />
              </div>
              <div className="form-group">
                <label className="form-label">Team</label>
                <select
                  className="input"
                  value={toTeam}
                  onChange={(e) => setToTeam(e.target.value)}
                >
                  <option value="">-- Select team --</option>
                  {teams.map((t) => (
                    <option key={t.id} value={t.name}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
              <div style={{ display: "flex", gap: "var(--space-3)" }}>
                <div className="form-group" style={{ flex: 1 }}>
                  <label className="form-label">Start date</label>
                  <input
                    className="input"
                    type="date"
                    value={toStart}
                    onChange={(e) => setToStart(e.target.value)}
                  />
                </div>
                <div className="form-group" style={{ flex: 1 }}>
                  <label className="form-label">End date</label>
                  <input
                    className="input"
                    type="date"
                    value={toEnd}
                    onChange={(e) => setToEnd(e.target.value)}
                  />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Type</label>
                <select
                  className="input"
                  value={toType}
                  onChange={(e) => setToType(e.target.value)}
                >
                  <option value="VACATION">Vacation</option>
                  <option value="SICK">Sick</option>
                  <option value="HOLIDAY">Holiday</option>
                </select>
              </div>
            </div>
            <div className="modal-footer">
              <button
                className="btn btn-secondary"
                onClick={() => setShowAddTimeOff(false)}
              >
                Cancel
              </button>
              <button
                className="btn btn-primary"
                onClick={handleAddTimeOff}
                disabled={!toName.trim() || !toStart || !toEnd}
              >
                Add Time Off
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
