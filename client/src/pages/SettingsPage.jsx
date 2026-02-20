import React, { useState, useEffect } from "react";
import { Save, Trash2, Plus, Pencil, Check, Eye, EyeOff, Users, Gauge, Mail, X, Clock, Copy, Link2, Loader2, RefreshCw, AlertCircle, Unplug } from "lucide-react";
import {
  getWorkspaceSettings,
  updateWorkspaceSettings,
  getAllTeams,
  createTeamDirect,
  updateTeamDirect,
  deleteTeamDirect,
  getMe,
  updateProfile,
  getWorkspaceMembers,
  getPendingInvites,
  sendInvite,
  revokeInvite,
  getIntegrations,
  getHubSpotAuthUrl,
  disconnectIntegration,
  enrichAllCards,
} from "../services/api";
import HubSpotMappingModal from "../components/HubSpotMappingModal";

const EFFORT_UNITS = [
  { value: "Story Points", label: "Story Points" },
  { value: "Days", label: "Days" },
];

const TABS = ["Workspace", "Teams", "Integrations", "Profile"];

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
  // Check URL params for tab override (used by HubSpot OAuth callback redirect)
  const [activeTab, setActiveTab] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("tab") || "Workspace";
  });

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
        {activeTab === "Integrations" && <IntegrationsTab />}
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

      <InviteMembersSection />
    </div>
  );
}

/* ===== Invite Members Section ===== */

function InviteMembersSection() {
  const [members, setMembers] = useState([]);
  const [invites, setInvites] = useState([]);
  const [inviteEmail, setInviteEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [inviteError, setInviteError] = useState("");
  const [inviteSuccess, setInviteSuccess] = useState("");
  const [lastInviteLink, setLastInviteLink] = useState("");
  const [copiedLink, setCopiedLink] = useState(false);
  const [loadingMembers, setLoadingMembers] = useState(true);
  const [loadingInvites, setLoadingInvites] = useState(true);
  const [revokingId, setRevokingId] = useState(null);

  useEffect(() => {
    getWorkspaceMembers()
      .then((data) => setMembers(data.members || []))
      .catch(() => {})
      .finally(() => setLoadingMembers(false));

    getPendingInvites()
      .then((data) => setInvites(data.invites || []))
      .catch(() => {})
      .finally(() => setLoadingInvites(false));
  }, []);

  async function handleSendInvite() {
    if (!inviteEmail.trim()) return;
    setSending(true);
    setInviteError("");
    setInviteSuccess("");
    setLastInviteLink("");
    setCopiedLink(false);
    try {
      const data = await sendInvite(inviteEmail.trim());
      setInvites((prev) => [data.invite, ...prev]);
      setLastInviteLink(data.invite_link || "");
      setInviteSuccess("Invite sent to " + inviteEmail.trim());
      setInviteEmail("");
      setTimeout(() => setInviteSuccess(""), 5000);
    } catch (err) {
      setInviteError(err.message || "Failed to send invite");
    } finally {
      setSending(false);
    }
  }

  async function handleRevoke(inviteId) {
    setRevokingId(inviteId);
    setInviteError("");
    try {
      await revokeInvite(inviteId);
      setInvites((prev) => prev.filter((i) => i.id !== inviteId));
    } catch (err) {
      setInviteError(err.message || "Failed to revoke invite");
    } finally {
      setRevokingId(null);
    }
  }

  function handleCopyLink() {
    if (!lastInviteLink) return;
    navigator.clipboard.writeText(lastInviteLink).then(() => {
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    });
  }

  function formatDate(dateStr) {
    if (!dateStr) return "";
    const d = new Date(dateStr);
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  }

  return (
    <div style={{ paddingTop: "var(--space-6)", borderTop: "1px solid var(--border-default)", marginTop: "var(--space-6)" }}>
      <h2>Invite Members</h2>

      {/* Invite form */}
      <div style={{ marginBottom: "var(--space-4)" }}>
        <div className="settings-invite-form">
          <input
            className="input"
            type="email"
            placeholder="colleague@company.com"
            value={inviteEmail}
            onChange={(e) => { setInviteEmail(e.target.value); setInviteError(""); }}
            onKeyDown={(e) => { if (e.key === "Enter" && inviteEmail.trim()) handleSendInvite(); }}
            style={{ flex: 1 }}
          />
          <button
            className="btn btn-primary"
            onClick={handleSendInvite}
            disabled={sending || !inviteEmail.trim()}
          >
            <Mail size={14} />
            {sending ? "Sending..." : "Send Invite"}
          </button>
        </div>
        {inviteError && <p className="form-error" style={{ marginTop: "var(--space-2)" }}>{inviteError}</p>}
        {inviteSuccess && (
          <div className="settings-invite-success" style={{ marginTop: "var(--space-2)" }}>
            <p className="form-success">{inviteSuccess}</p>
            {lastInviteLink && (
              <button
                className="btn btn-secondary btn-sm"
                onClick={handleCopyLink}
                title="Copy invite link"
              >
                <Copy size={12} />
                {copiedLink ? "Copied!" : "Copy link"}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Current members */}
      <div style={{ marginBottom: "var(--space-5)" }}>
        <h3 className="settings-invite-subheading">Members</h3>
        {loadingMembers ? (
          <p className="text-muted" style={{ fontSize: 13 }}>Loading members...</p>
        ) : members.length === 0 ? (
          <p className="text-muted" style={{ fontSize: 13 }}>No members found</p>
        ) : (
          <div className="settings-members-list">
            {members.map((member) => (
              <div key={member.id} className="settings-member-row">
                <div className="settings-member-avatar">
                  {member.avatar_url ? (
                    <img src={member.avatar_url} alt="" className="settings-member-avatar-img" />
                  ) : (
                    <span className="settings-member-avatar-initials">
                      {(member.name || "?").charAt(0).toUpperCase()}
                    </span>
                  )}
                </div>
                <div className="settings-member-info">
                  <span className="settings-member-name">{member.name}</span>
                  <span className="settings-member-email">{member.email}</span>
                </div>
                <span className="settings-member-role">{member.role || "member"}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Pending invites */}
      <div>
        <h3 className="settings-invite-subheading">Pending Invites</h3>
        {loadingInvites ? (
          <p className="text-muted" style={{ fontSize: 13 }}>Loading invites...</p>
        ) : invites.length === 0 ? (
          <p className="text-muted" style={{ fontSize: 13 }}>No pending invites</p>
        ) : (
          <div className="settings-members-list">
            {invites.map((inv) => (
              <div key={inv.id} className="settings-member-row">
                <div className="settings-member-avatar">
                  <Clock size={14} style={{ color: "var(--text-muted)" }} />
                </div>
                <div className="settings-member-info">
                  <span className="settings-member-name">{inv.email}</span>
                  <span className="settings-member-email">
                    Invited by {inv.invited_by_name || "a teammate"} — expires {formatDate(inv.expires_at)}
                  </span>
                </div>
                <button
                  className="btn-icon"
                  onClick={() => handleRevoke(inv.id)}
                  disabled={revokingId === inv.id}
                  title="Revoke invite"
                >
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
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
  const [editSprintCapacity, setEditSprintCapacity] = useState("");
  const [newTeamDevCount, setNewTeamDevCount] = useState(5);
  const [newTeamSprintCapacity, setNewTeamSprintCapacity] = useState("");
  const [deletingId, setDeletingId] = useState(null);
  const [effortUnit, setEffortUnit] = useState("Story Points");

  const totalCapacity = teams.reduce((sum, t) => sum + (t.sprint_capacity || 0), 0);
  const teamsWithCapacity = teams.filter((t) => t.sprint_capacity != null && t.sprint_capacity > 0);

  useEffect(() => {
    fetchTeams();
    const workspaceId = getWorkspaceId();
    if (workspaceId) {
      getWorkspaceSettings(workspaceId)
        .then((data) => {
          setEffortUnit(data.effort_unit || "Story Points");
        })
        .catch(() => {});
    }
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
      const body = {
        name: newTeamName.trim(),
        color: newTeamColor,
        dev_count: newTeamDevCount,
      };
      if (newTeamSprintCapacity !== "") {
        body.sprint_capacity = parseFloat(newTeamSprintCapacity);
      }
      const team = await createTeamDirect(body);
      setTeams((prev) => [...prev, { ...team, member_count: 0 }]);
      setNewTeamName("");
      setNewTeamColor(DEFAULT_TEAM_COLORS[0]);
      setNewTeamDevCount(5);
      setNewTeamSprintCapacity("");
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
    setEditSprintCapacity(team.sprint_capacity != null ? String(team.sprint_capacity) : "");
  }

  async function handleEditSave(teamId) {
    if (!editName.trim()) return;
    setError("");
    try {
      const body = {
        name: editName.trim(),
        color: editColor,
        dev_count: editDevCount,
        sprint_capacity: editSprintCapacity === "" ? null : parseFloat(editSprintCapacity),
      };
      const updated = await updateTeamDirect(teamId, body);
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

      <div className="settings-capacity-bar">
        <div className="settings-capacity-bar-inner">
          <Gauge size={16} />
          <span className="settings-capacity-label">Total Sprint Capacity</span>
          {teamsWithCapacity.length > 0 ? (
            <>
              <span style={{ fontSize: "1.1rem", fontWeight: 600, color: "var(--teal)" }}>
                {totalCapacity} {effortUnit === "Story Points" ? "sp" : "days"}
              </span>
              <span className="form-helper" style={{ whiteSpace: "nowrap", margin: 0 }}>
                across {teamsWithCapacity.length} team{teamsWithCapacity.length !== 1 ? "s" : ""}
              </span>
            </>
          ) : (
            <span className="form-helper" style={{ margin: 0 }}>
              Set capacity on each team below to track sprint limits
            </span>
          )}
        </div>
      </div>

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
                  <div className="settings-headcount-field">
                    <label className="form-label">Sprint Capacity</label>
                    <input
                      className="input"
                      type="number"
                      min="0"
                      step="1"
                      placeholder="No limit"
                      value={editSprintCapacity}
                      onChange={(e) => setEditSprintCapacity(e.target.value)}
                      style={{ width: 100 }}
                    />
                    <span className="form-helper" style={{ whiteSpace: "nowrap" }}>
                      {effortUnit === "Story Points" ? "sp" : "days"}
                    </span>
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
                </div>
                <div className="settings-team-card-headcount">
                  <Users size={14} />
                  <span>{team.dev_count ?? 5} people</span>
                </div>
                <div className="settings-team-card-headcount">
                  <Gauge size={14} />
                  <span>
                    {team.sprint_capacity != null
                      ? `${team.sprint_capacity} ${effortUnit === "Story Points" ? "sp" : "days"} / sprint`
                      : "No capacity limit"}
                  </span>
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
              <div className="settings-headcount-field">
                <label className="form-label">Sprint Capacity</label>
                <input
                  className="input"
                  type="number"
                  min="0"
                  step="1"
                  placeholder="No limit"
                  value={newTeamSprintCapacity}
                  onChange={(e) => setNewTeamSprintCapacity(e.target.value)}
                  style={{ width: 100 }}
                />
                <span className="form-helper" style={{ whiteSpace: "nowrap" }}>
                  {effortUnit === "Story Points" ? "sp" : "days"}
                </span>
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
              <button className="btn btn-secondary" onClick={() => { setShowCreateForm(false); setNewTeamName(""); setNewTeamDevCount(5); setNewTeamSprintCapacity(""); }}>
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

/* ===== Integrations Tab ===== */

function IntegrationsTab() {
  const [integrations, setIntegrations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(null);
  const [error, setError] = useState("");
  const [showMappingModal, setShowMappingModal] = useState(null);
  const [enriching, setEnriching] = useState(null);
  const [enrichResult, setEnrichResult] = useState(null);
  // Check for callback status from URL params
  const [callbackStatus] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("hubspot");
  });

  useEffect(() => {
    loadIntegrations();
  }, []);

  async function loadIntegrations() {
    try {
      const data = await getIntegrations();
      setIntegrations(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleConnectHubSpot() {
    setConnecting(true);
    setError("");
    try {
      const data = await getHubSpotAuthUrl();
      window.location.href = data.url;
    } catch (err) {
      setError(err.message || "Failed to start HubSpot connection");
      setConnecting(false);
    }
  }

  async function handleDisconnect(integrationId) {
    setDisconnecting(integrationId);
    setError("");
    try {
      await disconnectIntegration(integrationId);
      setIntegrations((prev) => prev.filter((i) => i.id !== integrationId));
    } catch (err) {
      setError(err.message);
    } finally {
      setDisconnecting(null);
    }
  }

  async function handleEnrichAll(integrationId) {
    setEnriching(integrationId);
    setEnrichResult(null);
    setError("");
    try {
      // Get user's last roadmap ID
      const user = JSON.parse(localStorage.getItem("user") || "{}");
      const roadmapId = user.last_roadmap_id;
      if (!roadmapId) {
        setError("No roadmap selected. Open a roadmap first.");
        return;
      }
      const result = await enrichAllCards(integrationId, roadmapId);
      setEnrichResult(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setEnriching(null);
    }
  }

  const hubspotIntegration = integrations.find((i) => i.type === "hubspot");
  const hasMappings = hubspotIntegration?.field_mapping;

  if (loading) {
    return (
      <div className="settings-section">
        <p className="text-muted">Loading integrations...</p>
      </div>
    );
  }

  return (
    <div className="settings-section">
      <h2>Integrations</h2>
      <p className="form-helper" style={{ marginBottom: "var(--space-4)" }}>
        Connect external tools to enrich your roadmap with real business data.
      </p>

      {error && <p className="form-error" style={{ marginBottom: "var(--space-3)" }}>{error}</p>}

      {callbackStatus === "connected" && (
        <div className="hs-success-banner">
          <Check size={14} /> HubSpot connected successfully! Configure your field mappings below.
        </div>
      )}
      {callbackStatus === "error" && (
        <div className="hs-error-banner">
          <AlertCircle size={14} /> HubSpot connection failed. Please try again.
        </div>
      )}

      {/* HubSpot Integration Card */}
      <div className="hs-integration-card">
        <div className="hs-integration-card-header">
          <div className="hs-integration-card-icon">
            <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 6v6l4 2" />
            </svg>
          </div>
          <div className="hs-integration-card-info">
            <h3>HubSpot</h3>
            <p>Pull deal data, revenue metrics, and customer insights into your roadmap.</p>
          </div>
          {hubspotIntegration ? (
            <span className={`hs-status-badge ${hubspotIntegration.status}`}>
              {hubspotIntegration.status === "active" ? "Connected" : hubspotIntegration.status === "error" ? "Error" : hubspotIntegration.status}
            </span>
          ) : null}
        </div>

        {hubspotIntegration ? (
          <div className="hs-integration-card-body">
            {hubspotIntegration.last_synced && (
              <p className="text-muted" style={{ fontSize: 12, marginBottom: "var(--space-3)" }}>
                Last synced: {new Date(hubspotIntegration.last_synced).toLocaleString()}
              </p>
            )}

            <div className="hs-integration-actions">
              <button
                className="btn btn-primary"
                onClick={() => setShowMappingModal(hubspotIntegration.id)}
              >
                <Settings2 size={14} />
                {hasMappings ? "Edit Mappings" : "Configure Mappings"}
              </button>

              {hasMappings && (
                <button
                  className="btn btn-secondary"
                  onClick={() => handleEnrichAll(hubspotIntegration.id)}
                  disabled={enriching === hubspotIntegration.id}
                >
                  {enriching === hubspotIntegration.id
                    ? <><Loader2 size={14} className="hs-spin" /> Enriching...</>
                    : <><RefreshCw size={14} /> Enrich All Cards</>}
                </button>
              )}

              <button
                className="btn btn-secondary"
                onClick={() => handleDisconnect(hubspotIntegration.id)}
                disabled={disconnecting === hubspotIntegration.id}
                style={{ color: "var(--red)" }}
              >
                <Unplug size={14} />
                {disconnecting === hubspotIntegration.id ? "Disconnecting..." : "Disconnect"}
              </button>
            </div>

            {enrichResult && (
              <div className="hs-enrich-result">
                <Check size={14} />
                Enriched {enrichResult.enriched} of {enrichResult.total_cards} cards with HubSpot data.
              </div>
            )}
          </div>
        ) : (
          <div className="hs-integration-card-body">
            <button
              className="btn btn-primary"
              onClick={handleConnectHubSpot}
              disabled={connecting}
            >
              {connecting
                ? <><Loader2 size={14} className="hs-spin" /> Connecting...</>
                : <><Link2 size={14} /> Connect HubSpot</>}
            </button>
          </div>
        )}
      </div>

      {/* Mapping Modal */}
      {showMappingModal && (
        <HubSpotMappingModal
          integrationId={showMappingModal}
          onClose={() => setShowMappingModal(null)}
          onSaved={() => loadIntegrations()}
        />
      )}
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
