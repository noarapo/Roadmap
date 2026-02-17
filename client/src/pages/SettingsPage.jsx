import React, { useState, useEffect } from "react";
import { Save, Trash2, Plus, Pencil, Check, Eye, EyeOff, Users } from "lucide-react";
import {
  getWorkspaceSettings,
  updateWorkspaceSettings,
  getAllTeams,
  createTeamDirect,
  updateTeamDirect,
  deleteTeamDirect,
  getMe,
  updateProfile,
} from "../services/api";

const EFFORT_UNITS = [
  { value: "Story Points", label: "Story Points" },
  { value: "Days", label: "Days" },
];

const TABS = ["Workspace", "Teams", "Profile"];

const DEFAULT_TEAM_COLORS = [
  "#4F87C5", "#38A169", "#805AD5", "#DD6B20", "#E53E3E",
  "#D69E2E", "#2D6A5E", "#3182CE",
];

function getWorkspaceId() {
  try {
    const user = JSON.parse(localStorage.getItem("user") || "{}");
    return user.workspace_id || null;
  } catch {
    return null;
  }
}

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState("Workspace");

  return (
    <div className="settings-page">
      <div className="page-header">
        <h1>Settings</h1>
      </div>

      <div className="settings-tabs">
        {TABS.map((tab) => (
          <button
            key={tab}
            className={`settings-tab ${activeTab === tab ? "active" : ""}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab}
          </button>
        ))}
      </div>

      <div style={{ paddingTop: "var(--space-5)" }}>
        {activeTab === "Workspace" && <WorkspaceTab />}
        {activeTab === "Teams" && <TeamsTab />}
        {activeTab === "Profile" && <ProfileTab />}
      </div>
    </div>
  );
}

/* ===== Workspace Tab ===== */

function WorkspaceTab() {
  const [workspaceName, setWorkspaceName] = useState("");
  const [originalName, setOriginalName] = useState("");
  const [effortUnit, setEffortUnit] = useState("Story Points");
  const [originalEffortUnit, setOriginalEffortUnit] = useState("Story Points");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const workspaceId = getWorkspaceId();
    if (!workspaceId) {
      setLoading(false);
      setError("No workspace found");
      return;
    }
    getWorkspaceSettings(workspaceId)
      .then((data) => {
        const name = data.workspace_name || "";
        setWorkspaceName(name);
        setOriginalName(name);
        const unit = data.effort_unit || "Story Points";
        setEffortUnit(unit);
        setOriginalEffortUnit(unit);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const hasChanges = workspaceName !== originalName || effortUnit !== originalEffortUnit;

  async function handleSave() {
    const workspaceId = getWorkspaceId();
    if (!workspaceId) return;
    if (!workspaceName.trim()) {
      setError("Workspace name cannot be empty");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const body = {};
      if (workspaceName !== originalName) {
        body.workspace_name = workspaceName.trim();
      }
      if (effortUnit !== originalEffortUnit) {
        body.effort_unit = effortUnit;
      }
      const data = await updateWorkspaceSettings(workspaceId, body);
      const name = data.workspace_name || workspaceName.trim();
      setOriginalName(name);
      setWorkspaceName(name);
      const unit = data.effort_unit || effortUnit;
      setOriginalEffortUnit(unit);
      setEffortUnit(unit);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="settings-section">
        <p className="text-muted">Loading workspace settings...</p>
      </div>
    );
  }

  return (
    <div className="settings-section">
      <h2>Workspace Settings</h2>
      {error && <p className="form-error" style={{ marginBottom: "var(--space-3)" }}>{error}</p>}
      <div className="form-group" style={{ marginBottom: "var(--space-4)" }}>
        <label className="form-label">Workspace Name</label>
        <input
          className="input"
          type="text"
          value={workspaceName}
          onChange={(e) => setWorkspaceName(e.target.value)}
        />
      </div>
      <div className="form-group" style={{ marginBottom: "var(--space-4)" }}>
        <label className="form-label">Work Metric</label>
        <span className="form-helper">Choose how your teams measure effort</span>
        <div className="settings-effort-unit-options">
          {EFFORT_UNITS.map((option) => (
            <label
              key={option.value}
              className={`settings-effort-unit-option ${effortUnit === option.value ? "selected" : ""}`}
            >
              <input
                type="radio"
                name="effort_unit"
                value={option.value}
                checked={effortUnit === option.value}
                onChange={() => setEffortUnit(option.value)}
              />
              <span className="settings-effort-unit-label">{option.label}</span>
            </label>
          ))}
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
        <button
          className="btn btn-primary"
          onClick={handleSave}
          disabled={saving || !hasChanges}
        >
          <Save size={14} />
          {saving ? "Saving..." : saved ? "Saved!" : "Save"}
        </button>
      </div>
    </div>
  );
}

/* ===== Teams Tab ===== */

function TeamsTab() {
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newTeamName, setNewTeamName] = useState("");
  const [newTeamColor, setNewTeamColor] = useState(DEFAULT_TEAM_COLORS[0]);
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState("");
  const [editColor, setEditColor] = useState("");
  const [editDevCount, setEditDevCount] = useState(5);
  const [newTeamDevCount, setNewTeamDevCount] = useState(5);
  const [deletingId, setDeletingId] = useState(null);

  useEffect(() => {
    fetchTeams();
  }, []);

  async function fetchTeams() {
    const workspaceId = getWorkspaceId();
    if (!workspaceId) {
      setLoading(false);
      setError("No workspace found");
      return;
    }
    try {
      const data = await getAllTeams(workspaceId);
      setTeams(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate() {
    if (!newTeamName.trim()) return;
    setCreating(true);
    setError("");
    try {
      const team = await createTeamDirect({
        name: newTeamName.trim(),
        color: newTeamColor,
        dev_count: newTeamDevCount,
      });
      setTeams((prev) => [...prev, { ...team, member_count: 0 }]);
      setNewTeamName("");
      setNewTeamColor(DEFAULT_TEAM_COLORS[0]);
      setNewTeamDevCount(5);
      setShowCreateForm(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setCreating(false);
    }
  }

  function startEdit(team) {
    setEditingId(team.id);
    setEditName(team.name);
    setEditColor(team.color || DEFAULT_TEAM_COLORS[0]);
    setEditDevCount(team.dev_count ?? 5);
  }

  async function handleEditSave(teamId) {
    if (!editName.trim()) return;
    setError("");
    try {
      const updated = await updateTeamDirect(teamId, {
        name: editName.trim(),
        color: editColor,
        dev_count: editDevCount,
      });
      setTeams((prev) =>
        prev.map((t) => (t.id === teamId ? { ...t, ...updated } : t))
      );
      setEditingId(null);
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleDelete(teamId) {
    setError("");
    try {
      await deleteTeamDirect(teamId);
      setTeams((prev) => prev.filter((t) => t.id !== teamId));
      setDeletingId(null);
    } catch (err) {
      setError(err.message);
    }
  }

  if (loading) {
    return (
      <div className="settings-section">
        <p className="text-muted">Loading teams...</p>
      </div>
    );
  }

  return (
    <div className="settings-section">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--space-4)" }}>
        <h2>Teams</h2>
      </div>
      {error && <p className="form-error" style={{ marginBottom: "var(--space-3)" }}>{error}</p>}
      <div className="settings-team-grid">
        {teams.map((team) => (
          <div key={team.id} className="settings-team-card">
            {editingId === team.id ? (
              <>
                <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
                  <input
                    className="input"
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    autoFocus
                  />
                  <div className="settings-color-row">
                    {DEFAULT_TEAM_COLORS.map((c) => (
                      <button
                        key={c}
                        className={`settings-color-swatch ${editColor === c ? "selected" : ""}`}
                        style={{ background: c }}
                        onClick={() => setEditColor(c)}
                      />
                    ))}
                  </div>
                  <div className="settings-headcount-field">
                    <label className="form-label">Headcount</label>
                    <input
                      className="input"
                      type="number"
                      min="0"
                      step="1"
                      value={editDevCount}
                      onChange={(e) => setEditDevCount(Math.max(0, parseInt(e.target.value, 10) || 0))}
                      style={{ width: 80 }}
                    />
                  </div>
                </div>
                <div style={{ display: "flex", gap: "var(--space-2)", marginTop: "var(--space-3)" }}>
                  <button className="btn btn-primary" onClick={() => handleEditSave(team.id)}>
                    <Check size={14} />
                    Save
                  </button>
                  <button className="btn btn-secondary" onClick={() => setEditingId(null)}>
                    Cancel
                  </button>
                </div>
              </>
            ) : deletingId === team.id ? (
              <div>
                <p style={{ fontSize: 13, marginBottom: "var(--space-3)" }}>
                  Delete <strong>{team.name}</strong>? This cannot be undone.
                </p>
                <div style={{ display: "flex", gap: "var(--space-2)" }}>
                  <button className="btn btn-destructive" onClick={() => handleDelete(team.id)}>
                    <Trash2 size={14} />
                    Delete
                  </button>
                  <button className="btn btn-secondary" onClick={() => setDeletingId(null)}>
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="settings-team-card-header">
                  <div className="settings-team-card-name">
                    <span
                      className="color-dot color-dot-lg"
                      style={{ background: team.color || "#A0AEC0" }}
                    />
                    {team.name}
                  </div>
                  <span className="badge badge-teal">{team.member_count || 0} members</span>
                </div>
                <div className="settings-team-card-headcount">
                  <Users size={14} />
                  <span>{team.dev_count ?? 5} people</span>
                </div>
                <div style={{ display: "flex", gap: "var(--space-2)", marginTop: "var(--space-3)" }}>
                  <button className="btn-icon" onClick={() => startEdit(team)} title="Edit team">
                    <Pencil size={14} />
                  </button>
                  <button className="btn-icon" onClick={() => setDeletingId(team.id)} title="Delete team">
                    <Trash2 size={14} />
                  </button>
                </div>
              </>
            )}
          </div>
        ))}
        {showCreateForm ? (
          <div className="settings-team-card">
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
              <input
                className="input"
                type="text"
                placeholder="Team name"
                value={newTeamName}
                onChange={(e) => setNewTeamName(e.target.value)}
                autoFocus
              />
              <div className="settings-color-row">
                {DEFAULT_TEAM_COLORS.map((c) => (
                  <button
                    key={c}
                    className={`settings-color-swatch ${newTeamColor === c ? "selected" : ""}`}
                    style={{ background: c }}
                    onClick={() => setNewTeamColor(c)}
                  />
                ))}
              </div>
              <div className="settings-headcount-field">
                <label className="form-label">Headcount</label>
                <input
                  className="input"
                  type="number"
                  min="0"
                  step="1"
                  value={newTeamDevCount}
                  onChange={(e) => setNewTeamDevCount(Math.max(0, parseInt(e.target.value, 10) || 0))}
                  style={{ width: 80 }}
                />
              </div>
            </div>
            <div style={{ display: "flex", gap: "var(--space-2)", marginTop: "var(--space-3)" }}>
              <button
                className="btn btn-primary"
                onClick={handleCreate}
                disabled={creating || !newTeamName.trim()}
              >
                <Plus size={14} />
                {creating ? "Creating..." : "Create"}
              </button>
              <button className="btn btn-secondary" onClick={() => { setShowCreateForm(false); setNewTeamName(""); setNewTeamDevCount(5); }}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div
            className="settings-add-team-card"
            onClick={() => setShowCreateForm(true)}
          >
            <Plus size={20} />
            <span>Add Team</span>
          </div>
        )}
      </div>
    </div>
  );
}

/* ===== Profile Tab ===== */

function ProfileTab() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [originalName, setOriginalName] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  // Password change
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [pwSaving, setPwSaving] = useState(false);
  const [pwSaved, setPwSaved] = useState(false);
  const [pwError, setPwError] = useState("");

  useEffect(() => {
    getMe()
      .then((data) => {
        const user = data.user || data;
        setName(user.name || "");
        setOriginalName(user.name || "");
        setEmail(user.email || "");
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  async function handleSaveName() {
    if (!name.trim()) {
      setError("Name cannot be empty");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const data = await updateProfile({ name: name.trim() });
      const user = data.user || data;
      setOriginalName(user.name || name.trim());
      setName(user.name || name.trim());
      // Update localStorage user object
      try {
        const stored = JSON.parse(localStorage.getItem("user") || "{}");
        stored.name = user.name || name.trim();
        localStorage.setItem("user", JSON.stringify(stored));
      } catch { /* ignore */ }
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleChangePassword() {
    if (!currentPassword || !newPassword) {
      setPwError("Both fields are required");
      return;
    }
    if (newPassword.length < 6) {
      setPwError("New password must be at least 6 characters");
      return;
    }
    setPwSaving(true);
    setPwError("");
    try {
      await updateProfile({ password: currentPassword, new_password: newPassword });
      setCurrentPassword("");
      setNewPassword("");
      setPwSaved(true);
      setTimeout(() => setPwSaved(false), 2000);
    } catch (err) {
      setPwError(err.message);
    } finally {
      setPwSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="settings-section">
        <p className="text-muted">Loading profile...</p>
      </div>
    );
  }

  return (
    <div className="settings-section">
      <h2>Profile</h2>
      {error && <p className="form-error" style={{ marginBottom: "var(--space-3)" }}>{error}</p>}
      <div className="form-group" style={{ marginBottom: "var(--space-4)" }}>
        <label className="form-label">Name</label>
        <input
          className="input"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <div className="form-group" style={{ marginBottom: "var(--space-4)" }}>
        <label className="form-label">Email</label>
        <input
          className="input"
          type="email"
          value={email}
          disabled
        />
        <span className="form-helper">Email cannot be changed</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", marginBottom: "var(--space-8)" }}>
        <button
          className="btn btn-primary"
          onClick={handleSaveName}
          disabled={saving || name === originalName}
        >
          <Save size={14} />
          {saving ? "Saving..." : saved ? "Saved!" : "Save"}
        </button>
      </div>

      <div style={{ paddingTop: "var(--space-6)", borderTop: "1px solid var(--border-default)" }}>
        <h2>Change Password</h2>
        {pwError && <p className="form-error" style={{ marginBottom: "var(--space-3)" }}>{pwError}</p>}
        <div className="form-group" style={{ marginBottom: "var(--space-4)" }}>
          <label className="form-label">Current Password</label>
          <div style={{ position: "relative" }}>
            <input
              className="input"
              type={showCurrentPassword ? "text" : "password"}
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              style={{ paddingRight: 36 }}
            />
            <button
              type="button"
              className="btn-icon"
              style={{ position: "absolute", right: 4, top: "50%", transform: "translateY(-50%)" }}
              onClick={() => setShowCurrentPassword((v) => !v)}
            >
              {showCurrentPassword ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
        </div>
        <div className="form-group" style={{ marginBottom: "var(--space-4)" }}>
          <label className="form-label">New Password</label>
          <div style={{ position: "relative" }}>
            <input
              className="input"
              type={showNewPassword ? "text" : "password"}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              style={{ paddingRight: 36 }}
            />
            <button
              type="button"
              className="btn-icon"
              style={{ position: "absolute", right: 4, top: "50%", transform: "translateY(-50%)" }}
              onClick={() => setShowNewPassword((v) => !v)}
            >
              {showNewPassword ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
          <span className="form-helper">Minimum 6 characters</span>
        </div>
        <button
          className="btn btn-primary"
          onClick={handleChangePassword}
          disabled={pwSaving || !currentPassword || !newPassword}
        >
          <Save size={14} />
          {pwSaving ? "Saving..." : pwSaved ? "Password Changed!" : "Change Password"}
        </button>
      </div>
    </div>
  );
}
