import React, { useState, useEffect } from "react";
import { Save, Trash2, Plus, Pencil, Check, Eye, EyeOff, Users, Gauge, Mail, X, Clock, Copy, Link2, Loader2, RefreshCw, AlertCircle, Unplug, Settings2, ChevronDown, Shield, Database } from "lucide-react";
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
  updateMemberRole,
  getIntegrations,
  getHubSpotAuthUrl,
  getLinearAuthUrl,
  getNotionAuthUrl,
  disconnectIntegration,
  enrichAllCards,
  enrichAllCardsNotion,
  getCustomFields,
  getOnboardingResponses,
} from "../services/api";
import HubSpotMappingModal from "../components/HubSpotMappingModal";
import LinearSetupWizard from "../components/LinearSetupWizard";
import NotionMappingModal from "../components/NotionMappingModal";
import NotionImportWizard from "../components/NotionImportWizard";
import WorkspaceEditor from "../components/WorkspaceEditor";
import DrawerPreview from "../components/DrawerPreview";

const EFFORT_UNITS = [
  { value: "Story Points", label: "Story Points" },
  { value: "Days", label: "Days" },
];

const TABS = ["Workspace", "Editor", "Teams", "Profile"];

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

function getCurrentUser() {
  try {
    return JSON.parse(localStorage.getItem("user") || "{}");
  } catch {
    return {};
  }
}

export default function SettingsPage() {
  // Check URL params for tab override (used by HubSpot OAuth callback redirect)
  const [activeTab, setActiveTab] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("tab") || "Workspace";
  });

  return (
    <div className={`settings-page${activeTab === "Editor" ? " settings-page--wide" : ""}`}>
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
        {activeTab === "Editor" && <EditorTab />}
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const workspaceId = getWorkspaceId();

  // Data sources state (from onboarding)
  const [onboardingResponses, setOnboardingResponses] = useState(null);

  useEffect(() => {
    if (!workspaceId) {
      setLoading(false);
      setError("No workspace found");
      return;
    }

    Promise.all([
      getWorkspaceSettings(workspaceId),
      getOnboardingResponses().catch(() => null),
    ])
      .then(([settings, obResponses]) => {
        // General settings
        const name = settings.workspace_name || "";
        setWorkspaceName(name);
        setOriginalName(name);
        const unit = settings.effort_unit || "Story Points";
        setEffortUnit(unit);

        // Onboarding responses
        if (obResponses) setOnboardingResponses(obResponses);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function autoSave(body) {
    if (!workspaceId) return;
    try {
      await updateWorkspaceSettings(workspaceId, body);
    } catch (err) {
      setError(err.message);
    }
  }

  function handleNameBlur() {
    const trimmed = workspaceName.trim();
    if (!trimmed) {
      setWorkspaceName(originalName);
      return;
    }
    if (trimmed !== originalName) {
      setOriginalName(trimmed);
      setWorkspaceName(trimmed);
      autoSave({ workspace_name: trimmed });
    }
  }

  function handleEffortUnitChange(newUnit) {
    setEffortUnit(newUnit);
    autoSave({ effort_unit: newUnit });
  }

  if (loading) {
    return (
      <div className="settings-section">
        <p className="text-muted">Loading workspace settings...</p>
      </div>
    );
  }

  const DATA_SOURCE_LABELS = {
    current_roadmap_tool: { label: "Where my roadmap lives", icon: Database },
    tracks_feature_requests: { label: "Where feature requests come from", icon: Database },
    crm: { label: "CRM", icon: Database },
    dev_task_tool: { label: "Dev task tool", icon: Database },
  };

  return (
    <div className="settings-section">
      {/* Section 1: General */}
      <div className="settings-card">
        <h2>General</h2>
        {error && <p className="form-error" style={{ marginBottom: "var(--space-3)" }}>{error}</p>}
        <div className="form-group" style={{ marginBottom: "var(--space-4)" }}>
          <label className="form-label">Workspace Name</label>
          <input
            className="input"
            type="text"
            value={workspaceName}
            onChange={(e) => setWorkspaceName(e.target.value)}
            onBlur={handleNameBlur}
            onKeyDown={(e) => { if (e.key === "Enter") e.target.blur(); }}
          />
        </div>
        <div className="form-group">
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
                  onChange={() => handleEffortUnitChange(option.value)}
                />
                <span className="settings-effort-unit-label">{option.label}</span>
              </label>
            ))}
          </div>
        </div>
      </div>

      {/* Section 2: Data Sources (from onboarding) */}
      {onboardingResponses && (
        <div className="settings-card">
          <h2>Data Sources</h2>
          <p className="form-helper" style={{ marginBottom: "var(--space-4)" }}>
            Information collected during onboarding about where your data lives.
          </p>
          <div className="settings-data-sources">
            {Object.entries(DATA_SOURCE_LABELS).map(([key, { label }]) => {
              const value = onboardingResponses[key];
              if (!value) return null;
              return (
                <div key={key} className="settings-data-source-row">
                  <Database size={14} className="settings-data-source-icon" />
                  <span className="settings-data-source-label">{label}</span>
                  <span className="settings-data-source-value">{value}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Section 3: Members & Permissions */}
      <InviteMembersSection />
    </div>
  );
}

/* ===== Editor Tab ===== */

function EditorTab() {
  const [statuses, setStatuses] = useState([]);
  const [customFields, setCustomFields] = useState([]);
  const [builtinFields, setBuiltinFields] = useState([
    { name: "Status", builtin: true, visible: true },
    { name: "Teams", builtin: true, visible: true },
    { name: "Sprint", builtin: true, visible: true },
    { name: "Duration", builtin: true, visible: true },
    { name: "Tags", builtin: true, visible: true },
  ]);
  const [connectedIntegrations, setConnectedIntegrations] = useState(new Set());
  const [hubspotIntegrationId, setHubspotIntegrationId] = useState(null);
  const [linearIntegrationId, setLinearIntegrationId] = useState(null);
  const [notionIntegrationId, setNotionIntegrationId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const workspaceId = getWorkspaceId();

  useEffect(() => {
    if (!workspaceId) {
      setLoading(false);
      setError("No workspace found");
      return;
    }

    Promise.all([
      getWorkspaceSettings(workspaceId),
      getCustomFields(workspaceId),
      getIntegrations(),
    ])
      .then(([settings, fields, integrations]) => {
        // Statuses
        const statusNames = settings.custom_statuses ? JSON.parse(settings.custom_statuses) : ["Placeholder", "Planned", "In Progress", "Done"];
        const statusColors = settings.status_colors ? JSON.parse(settings.status_colors) : {};
        const defaultColors = { Placeholder: "#9CA3AF", Planned: "#3B82F6", "In Progress": "#ECC94B", Done: "#22C55E" };
        setStatuses(statusNames.map((name) => ({ name, color: statusColors[name] || defaultColors[name] || "#A0AEC0" })));

        // Custom fields
        const mappedFields = (fields || []).map((f) => ({
          id: f.id,
          name: f.name,
          field_type: f.field_type,
          options: f.options ? (typeof f.options === "string" ? JSON.parse(f.options) : f.options) : [],
          description: "",
          visible: true,
          source: f.source || "manual",
          source_property: f.source_property || null,
        }));

        // Apply hidden fields
        const hiddenFields = settings.drawer_hidden_fields ? JSON.parse(settings.drawer_hidden_fields) : [];
        const hiddenSet = new Set(hiddenFields);
        setBuiltinFields((prev) => prev.map((f) => ({ ...f, visible: !hiddenSet.has(f.name) })));
        setCustomFields(mappedFields.map((f) => ({ ...f, visible: !hiddenSet.has(f.name) })));

        // Connected integrations
        const active = new Set();
        const hsInt = (integrations || []).find((i) => i.type === "hubspot" && i.status === "active");
        if (hsInt) { active.add("HubSpot"); setHubspotIntegrationId(hsInt.id); }
        const lnInt = (integrations || []).find((i) => i.type === "linear" && i.status === "active");
        if (lnInt) { active.add("Linear"); setLinearIntegrationId(lnInt.id); }
        const ntInt = (integrations || []).find((i) => i.type === "notion" && i.status === "active");
        if (ntInt) { active.add("Notion"); setNotionIntegrationId(ntInt.id); }
        setConnectedIntegrations(active);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) {
    return (
      <div className="settings-section">
        <p className="text-muted">Loading editor...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="settings-section">
        <p className="form-error">{error}</p>
      </div>
    );
  }

  return (
    <div className="settings-section">
      <div className="settings-card">
        <h2>Workspace Editor</h2>
        <p className="form-helper" style={{ marginBottom: "var(--space-4)" }}>
          Configure statuses, fields, and integrations for your workspace.
        </p>
      </div>
      <div className="settings-editor-layout">
        <div className="settings-editor-main">
          <WorkspaceEditor
            statuses={statuses}
            onStatusesChange={setStatuses}
            customFields={customFields}
            onCustomFieldsChange={setCustomFields}
            builtinFields={builtinFields}
            onBuiltinFieldsChange={setBuiltinFields}
            connectedIntegrations={connectedIntegrations}
            onIntegrationsChange={setConnectedIntegrations}
            hubspotIntegrationId={hubspotIntegrationId}
            linearIntegrationId={linearIntegrationId}
            notionIntegrationId={notionIntegrationId}
            mode="settings"
            autoSave={true}
            workspaceId={workspaceId}
          />
        </div>
        <div className="settings-editor-preview">
          <DrawerPreview
            statuses={statuses}
            customFields={customFields}
            builtinFields={builtinFields}
            connectedIntegrations={connectedIntegrations}
          />
        </div>
      </div>
    </div>
  );
}

/* ===== Invite Members Section ===== */

function InviteMembersSection() {
  const [members, setMembers] = useState([]);
  const [invites, setInvites] = useState([]);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("editor");
  const [sending, setSending] = useState(false);
  const [inviteError, setInviteError] = useState("");
  const [inviteSuccess, setInviteSuccess] = useState("");
  const [lastInviteLink, setLastInviteLink] = useState("");
  const [copiedLink, setCopiedLink] = useState(false);
  const [loadingMembers, setLoadingMembers] = useState(true);
  const [loadingInvites, setLoadingInvites] = useState(true);
  const [revokingId, setRevokingId] = useState(null);
  const [changingRoleId, setChangingRoleId] = useState(null);

  const currentUser = getCurrentUser();
  const isAdmin = currentUser.role === "admin";

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
      const data = await sendInvite(inviteEmail.trim(), inviteRole);
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

  async function handleChangeRole(userId, newRole) {
    setChangingRoleId(userId);
    setInviteError("");
    try {
      await updateMemberRole(userId, newRole);
      setMembers((prev) =>
        prev.map((m) => (m.id === userId ? { ...m, role: newRole } : m))
      );
    } catch (err) {
      setInviteError(err.message || "Failed to change role");
    } finally {
      setChangingRoleId(null);
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

  const ROLE_LABELS = { admin: "Admin", editor: "Editor", viewer: "Viewer" };

  return (
    <div className="settings-card">
      <h2>Members & Permissions</h2>

      {/* Invite form — admin only */}
      {isAdmin && (
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
            <select
              className="input role-select"
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value)}
            >
              <option value="editor">Editor</option>
              <option value="viewer">Viewer</option>
            </select>
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
      )}

      {/* Current members */}
      <div style={{ marginBottom: "var(--space-5)" }}>
        <h3 className="settings-invite-subheading">Members</h3>
        {loadingMembers ? (
          <p className="text-muted" style={{ fontSize: 13 }}>Loading members...</p>
        ) : members.length === 0 ? (
          <p className="text-muted" style={{ fontSize: 13 }}>No members found</p>
        ) : (
          <div className="settings-members-list">
            {members.map((member) => {
              const isSelf = member.id === currentUser.id;
              const memberRole = member.role || "editor";
              return (
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
                    <span className="settings-member-name">
                      {member.name}{isSelf ? " (you)" : ""}
                    </span>
                    <span className="settings-member-email">{member.email}</span>
                  </div>
                  {isAdmin && !isSelf ? (
                    <div className="role-selector-wrap">
                      <select
                        className={`role-badge role-${memberRole}`}
                        value={memberRole}
                        onChange={(e) => handleChangeRole(member.id, e.target.value)}
                        disabled={changingRoleId === member.id}
                      >
                        <option value="admin">Admin</option>
                        <option value="editor">Editor</option>
                        <option value="viewer">Viewer</option>
                      </select>
                      {changingRoleId === member.id && <Loader2 size={12} className="spin" />}
                    </div>
                  ) : (
                    <span className={`role-badge role-${memberRole}`}>
                      {ROLE_LABELS[memberRole] || memberRole}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Pending invites — admin only */}
      {isAdmin && (
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
                      {inv.role ? `${inv.role} · ` : ""}Invited by {inv.invited_by_name || "a teammate"} — expires {formatDate(inv.expires_at)}
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
      )}
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
      <div className="settings-card">
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
    </div>
  );
}

/* ===== Integrations Tab ===== */

function IntegrationsTab() {
  const [integrations, setIntegrations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [connectingLinear, setConnectingLinear] = useState(false);
  const [connectingNotion, setConnectingNotion] = useState(false);
  const [disconnecting, setDisconnecting] = useState(null);
  const [error, setError] = useState("");
  const [showMappingModal, setShowMappingModal] = useState(null);
  const [showLinearWizard, setShowLinearWizard] = useState(null);
  const [showNotionMappingModal, setShowNotionMappingModal] = useState(null);
  const [showNotionImportWizard, setShowNotionImportWizard] = useState(null);
  const [enriching, setEnriching] = useState(null);
  const [enrichResult, setEnrichResult] = useState(null);
  // Check for callback status from URL params
  const [callbackStatus] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return { hubspot: params.get("hubspot"), linear: params.get("linear"), notion: params.get("notion") };
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

  async function handleConnectLinear() {
    setConnectingLinear(true);
    setError("");
    try {
      const data = await getLinearAuthUrl();
      window.location.href = data.url;
    } catch (err) {
      setError(err.message || "Failed to start Linear connection");
      setConnectingLinear(false);
    }
  }

  async function handleConnectNotion() {
    setConnectingNotion(true);
    setError("");
    try {
      const data = await getNotionAuthUrl();
      window.location.href = data.url;
    } catch (err) {
      setError(err.message || "Failed to start Notion connection");
      setConnectingNotion(false);
    }
  }

  async function handleEnrichAllNotion(integrationId) {
    setEnriching(integrationId);
    setEnrichResult(null);
    setError("");
    try {
      const user = JSON.parse(localStorage.getItem("user") || "{}");
      const roadmapId = user.last_roadmap_id;
      if (!roadmapId) {
        setError("No roadmap selected. Open a roadmap first.");
        return;
      }
      const result = await enrichAllCardsNotion(integrationId, roadmapId);
      setEnrichResult(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setEnriching(null);
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
  const linearIntegration = integrations.find((i) => i.type === "linear");
  const notionIntegration = integrations.find((i) => i.type === "notion");
  const hasNotionMappings = notionIntegration?.field_mapping;

  if (loading) {
    return (
      <div className="settings-section">
        <p className="text-muted">Loading integrations...</p>
      </div>
    );
  }

  return (
    <div className="settings-section">
      <div className="settings-card">
      <h2>Integrations</h2>
      <p className="form-helper" style={{ marginBottom: "var(--space-4)" }}>
        Connect external tools to enrich your roadmap with real business data.
      </p>

      {error && <p className="form-error" style={{ marginBottom: "var(--space-3)" }}>{error}</p>}

      {callbackStatus.hubspot === "connected" && (
        <div className="hs-success-banner">
          <Check size={14} /> HubSpot connected successfully! Configure your field mappings below.
        </div>
      )}
      {callbackStatus.hubspot === "error" && (
        <div className="hs-error-banner">
          <AlertCircle size={14} /> HubSpot connection failed. Please try again.
        </div>
      )}
      {callbackStatus.linear === "connected" && (
        <div className="hs-success-banner">
          <Check size={14} /> Linear connected successfully! Configure your mappings below.
        </div>
      )}
      {callbackStatus.linear === "error" && (
        <div className="hs-error-banner">
          <AlertCircle size={14} /> Linear connection failed. Please try again.
        </div>
      )}
      {callbackStatus.notion === "connected" && (
        <div className="hs-success-banner">
          <Check size={14} /> Notion connected successfully! Configure your mappings below.
        </div>
      )}
      {callbackStatus.notion === "error" && (
        <div className="hs-error-banner">
          <AlertCircle size={14} /> Notion connection failed. Please try again.
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

      {/* Linear Integration Card */}
      <div className="hs-integration-card" style={{ marginTop: "var(--space-4)" }}>
        <div className="hs-integration-card-header">
          <div className="hs-integration-card-icon" style={{ background: "#5E6AD2" }}>
            <svg width="20" height="20" viewBox="0 0 100 100" fill="currentColor">
              <path d="M3.35 46.05a47.76 47.76 0 0 0 50.6 50.6L3.35 46.04ZM1.26 38.23a49.62 49.62 0 0 0 4.38 14.78l21.76-21.76A24.82 24.82 0 0 1 50 24.82a24.82 24.82 0 0 1 24.82 24.82H50v6.43l41.53 41.53a49.62 49.62 0 0 0 7.21-11.6C103.78 73.63 100 49.64 100 49.64S86.37 0 50 0 1.26 38.23 1.26 38.23Z"/>
            </svg>
          </div>
          <div className="hs-integration-card-info">
            <h3>Linear</h3>
            <p>Import projects and sync issues from Linear into your roadmap.</p>
          </div>
          {linearIntegration ? (
            <span className={`hs-status-badge ${linearIntegration.status}`}>
              {linearIntegration.status === "active" ? "Connected" : linearIntegration.status === "error" ? "Error" : linearIntegration.status}
            </span>
          ) : null}
        </div>

        {linearIntegration ? (
          <div className="hs-integration-card-body">
            {linearIntegration.last_synced && (
              <p className="text-muted" style={{ fontSize: 12, marginBottom: "var(--space-3)" }}>
                Last synced: {new Date(linearIntegration.last_synced).toLocaleString()}
              </p>
            )}
            <div className="hs-integration-actions">
              <button
                className="btn btn-primary"
                onClick={() => setShowLinearWizard(linearIntegration.id)}
              >
                <Settings2 size={14} />
                Setup & Import
              </button>
              <button
                className="btn btn-secondary"
                onClick={() => handleDisconnect(linearIntegration.id)}
                disabled={disconnecting === linearIntegration.id}
                style={{ color: "var(--red)" }}
              >
                <Unplug size={14} />
                {disconnecting === linearIntegration.id ? "Disconnecting..." : "Disconnect"}
              </button>
            </div>
          </div>
        ) : (
          <div className="hs-integration-card-body">
            <button
              className="btn btn-primary"
              onClick={handleConnectLinear}
              disabled={connectingLinear}
            >
              {connectingLinear
                ? <><Loader2 size={14} className="hs-spin" /> Connecting...</>
                : <><Link2 size={14} /> Connect Linear</>}
            </button>
          </div>
        )}
      </div>

      {/* Notion Integration Card */}
      <div className="hs-integration-card" style={{ marginTop: "var(--space-4)" }}>
        <div className="hs-integration-card-header">
          <div className="hs-integration-card-icon" style={{ background: "#000" }}>
            <svg width="20" height="20" viewBox="0 0 100 100" fill="none">
              <path d="M6.017 4.313l55.333-4.087c6.797-.583 8.543-.19 12.817 2.917l17.663 12.443c2.913 2.14 3.883 2.723 3.883 5.053v68.243c0 4.277-1.553 6.807-6.99 7.193L24.467 99.967c-4.08.193-6.023-.39-8.16-3.113L3.3 79.94c-2.333-3.113-3.3-5.443-3.3-8.167V11.113c0-3.497 1.553-6.413 6.017-6.8z" fill="#fff"/>
              <path d="M61.35.227l-55.333 4.087C.554 4.7 0 7.617 0 11.113v60.66c0 2.723.967 5.053 3.3 8.167l13.007 16.913c2.137 2.723 4.08 3.307 8.16 3.113l64.257-3.89c5.433-.387 6.99-2.917 6.99-7.193V20.64c0-2.21-.81-2.903-3.16-4.64L76.49 3.267c-4.16-3.3-6.117-3.547-12.817-2.96zM25.92 19.523c-5.247.353-6.437.433-9.417-1.99L8.927 11.507c-.777-.583-.39-1.36.973-1.553l53.193-3.887c4.467-.39 6.793 1.167 8.543 2.527l9.123 6.61c.39.193 1.36 1.553.193 1.553l-55.033 3.153v-.387zM19.803 88.3V30.367c0-2.53.777-3.697 3.103-3.893L86 22.78c2.14-.193 3.107 1.167 3.107 3.693v57.547c0 2.53-0.39 4.667-3.883 4.863l-60.377 3.5c-3.493.193-5.043-.97-5.043-4.083zM79.6 33.6c.39 1.75 0 3.5-1.75 3.7l-2.91.58v42.77c-2.53 1.36-4.86 2.14-6.8 2.14-3.107 0-3.883-.97-6.21-3.887L42.44 50.45v27.457l6.02 1.36s0 3.5-4.86 3.5l-13.39.78c-.39-.78 0-2.723 1.36-3.11l3.5-.97V42.033l-4.86-.39c-.39-1.75.58-4.277 3.3-4.473l14.36-.97 20.237 30.95v-27.46l-5.053-.583c-.39-2.143 1.163-3.7 3.103-3.89l13.4-.777z" fill="#000"/>
            </svg>
          </div>
          <div className="hs-integration-card-info">
            <h3>Notion</h3>
            <p>Import databases, enrich cards with Notion data, and use pages as AI context.</p>
          </div>
          {notionIntegration ? (
            <span className={`hs-status-badge ${notionIntegration.status}`}>
              {notionIntegration.status === "active" ? "Connected" : notionIntegration.status === "error" ? "Error" : notionIntegration.status}
            </span>
          ) : null}
        </div>

        {notionIntegration ? (
          <div className="hs-integration-card-body">
            {notionIntegration.last_synced && (
              <p className="text-muted" style={{ fontSize: 12, marginBottom: "var(--space-3)" }}>
                Last synced: {new Date(notionIntegration.last_synced).toLocaleString()}
              </p>
            )}

            <div className="hs-integration-actions">
              <button
                className="btn btn-primary"
                onClick={() => setShowNotionMappingModal(notionIntegration.id)}
              >
                <Settings2 size={14} />
                {hasNotionMappings ? "Edit Mappings" : "Configure Mappings"}
              </button>

              <button
                className="btn btn-secondary"
                onClick={() => setShowNotionImportWizard(notionIntegration.id)}
              >
                <Plus size={14} />
                Import from Notion
              </button>

              {hasNotionMappings && (
                <button
                  className="btn btn-secondary"
                  onClick={() => handleEnrichAllNotion(notionIntegration.id)}
                  disabled={enriching === notionIntegration.id}
                >
                  {enriching === notionIntegration.id
                    ? <><Loader2 size={14} className="hs-spin" /> Enriching...</>
                    : <><RefreshCw size={14} /> Enrich All Cards</>}
                </button>
              )}

              <button
                className="btn btn-secondary"
                onClick={() => handleDisconnect(notionIntegration.id)}
                disabled={disconnecting === notionIntegration.id}
                style={{ color: "var(--red)" }}
              >
                <Unplug size={14} />
                {disconnecting === notionIntegration.id ? "Disconnecting..." : "Disconnect"}
              </button>
            </div>

            {enrichResult && enriching === null && (
              <div className="hs-enrich-result">
                <Check size={14} />
                Enriched {enrichResult.enriched} of {enrichResult.total_cards} cards with Notion data.
              </div>
            )}
          </div>
        ) : (
          <div className="hs-integration-card-body">
            <button
              className="btn btn-primary"
              onClick={handleConnectNotion}
              disabled={connectingNotion}
            >
              {connectingNotion
                ? <><Loader2 size={14} className="hs-spin" /> Connecting...</>
                : <><Link2 size={14} /> Connect Notion</>}
            </button>
          </div>
        )}
      </div>
      </div>

      {/* HubSpot Mapping Modal */}
      {showMappingModal && (
        <HubSpotMappingModal
          integrationId={showMappingModal}
          onClose={() => setShowMappingModal(null)}
          onSaved={() => loadIntegrations()}
        />
      )}

      {/* Linear Setup Wizard */}
      {showLinearWizard && (
        <LinearSetupWizard
          integrationId={showLinearWizard}
          onClose={() => setShowLinearWizard(null)}
          onComplete={() => loadIntegrations()}
        />
      )}

      {/* Notion Mapping Modal */}
      {showNotionMappingModal && (
        <NotionMappingModal
          integrationId={showNotionMappingModal}
          onClose={() => setShowNotionMappingModal(null)}
          onSaved={() => loadIntegrations()}
        />
      )}

      {/* Notion Import Wizard */}
      {showNotionImportWizard && (
        <NotionImportWizard
          integrationId={showNotionImportWizard}
          onClose={() => setShowNotionImportWizard(null)}
          onComplete={() => loadIntegrations()}
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
      <div className="settings-card">
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
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
          <button
            className="btn btn-primary"
            onClick={handleSaveName}
            disabled={saving || name === originalName}
          >
            <Save size={14} />
            {saving ? "Saving..." : saved ? "Saved!" : "Save"}
          </button>
        </div>
      </div>

      <div className="settings-card">
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
