import React, { useState } from "react";
import { Save, Trash2, Plus } from "lucide-react";

const TABS = ["Workspace", "Teams", "Integrations", "Notifications", "Billing"];

const INITIAL_TEAMS = [
  { id: 1, name: "Platform", color: "#4F87C5", members: 6, capacity: 48 },
  { id: 2, name: "Frontend", color: "#38A169", members: 4, capacity: 32 },
  { id: 3, name: "Product", color: "#805AD5", members: 3, capacity: 24 },
  { id: 4, name: "Design", color: "#DD6B20", members: 2, capacity: 16 },
];

const INITIAL_INTEGRATIONS = [
  { id: 1, name: "HubSpot", logo: "H", connected: true },
  { id: 2, name: "Salesforce", logo: "SF", connected: false },
  { id: 3, name: "Jira", logo: "J", connected: true },
  { id: 4, name: "Linear", logo: "L", connected: false },
  { id: 5, name: "Meta", logo: "M", connected: false },
  { id: 6, name: "Slack", logo: "S", connected: true },
];

const INITIAL_NOTIFICATIONS = [
  { id: 1, label: "Email on capacity overflow", description: "Get notified when a team exceeds sprint capacity", enabled: true },
  { id: 2, label: "Email on reprioritization", description: "Get notified when an AI lens triggers a reprioritization suggestion", enabled: true },
  { id: 3, label: "Email on comments", description: "Get notified when someone comments on a feature you own", enabled: false },
  { id: 4, label: "Slack notifications", description: "Send all notifications to the connected Slack channel", enabled: true },
];

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState("Workspace");

  // Workspace state
  const [workspaceName, setWorkspaceName] = useState("Acme Corp Workspace");
  const [saved, setSaved] = useState(false);

  // Teams state
  const [teams, setTeams] = useState(INITIAL_TEAMS);

  // Integrations state
  const [integrations, setIntegrations] = useState(INITIAL_INTEGRATIONS);

  // Notifications state
  const [notifications, setNotifications] = useState(INITIAL_NOTIFICATIONS);

  function handleSaveWorkspace() {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  function toggleIntegration(id) {
    setIntegrations((prev) =>
      prev.map((integ) =>
        integ.id === id ? { ...integ, connected: !integ.connected } : integ
      )
    );
  }

  function toggleNotification(id) {
    setNotifications((prev) =>
      prev.map((notif) =>
        notif.id === id ? { ...notif, enabled: !notif.enabled } : notif
      )
    );
  }

  function renderWorkspaceTab() {
    return (
      <div className="settings-section">
        <h2>Workspace Settings</h2>
        <div className="form-group" style={{ marginBottom: "var(--space-4)" }}>
          <label className="form-label">Workspace Name</label>
          <input
            className="input"
            type="text"
            value={workspaceName}
            onChange={(e) => setWorkspaceName(e.target.value)}
          />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
          <button className="btn btn-primary" onClick={handleSaveWorkspace}>
            <Save size={14} />
            {saved ? "Saved!" : "Save"}
          </button>
        </div>

        <div style={{ marginTop: "var(--space-8)", paddingTop: "var(--space-6)", borderTop: "1px solid var(--border-default)" }}>
          <h2>Danger Zone</h2>
          <p className="text-muted" style={{ marginBottom: "var(--space-4)", fontSize: 13 }}>
            Permanently delete this workspace and all associated data. This action cannot be undone.
          </p>
          <button className="btn btn-destructive">
            <Trash2 size={14} />
            Delete Workspace
          </button>
        </div>
      </div>
    );
  }

  function renderTeamsTab() {
    return (
      <div className="settings-section">
        <h2>Teams</h2>
        <div className="team-grid">
          {teams.map((team) => (
            <div key={team.id} className="team-card">
              <div className="team-card-header">
                <div className="team-card-name">
                  <span
                    className="color-dot color-dot-lg"
                    style={{ background: team.color }}
                  />
                  {team.name}
                </div>
                <span className="badge badge-teal">{team.members} members</span>
              </div>
              <div className="team-stats">
                <div className="team-stat">
                  <span className="team-stat-label">Members</span>
                  <span className="team-stat-value">{team.members}</span>
                </div>
                <div className="team-stat">
                  <span className="team-stat-label">Capacity</span>
                  <span className="team-stat-value">{team.capacity}h</span>
                </div>
              </div>
            </div>
          ))}
          <div
            className="add-team-card"
            onClick={() => {
              const newId = Math.max(...teams.map((t) => t.id)) + 1;
              setTeams((prev) => [
                ...prev,
                { id: newId, name: "New Team", color: "#A0AEC0", members: 0, capacity: 0 },
              ]);
            }}
          >
            <Plus size={20} />
            <span>Add Team</span>
          </div>
        </div>
      </div>
    );
  }

  function renderIntegrationsTab() {
    return (
      <div className="settings-section">
        <h2>Integrations</h2>
        <div className="integration-grid">
          {integrations.map((integ) => (
            <div key={integ.id} className="integration-card">
              <div className="integration-card-header">
                <div className="integration-logo">{integ.logo}</div>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{integ.name}</div>
                  <span className={`badge ${integ.connected ? "badge-green" : "badge-gray"}`}>
                    {integ.connected ? "CONNECTED" : "NOT CONNECTED"}
                  </span>
                </div>
              </div>
              <button
                className={`btn ${integ.connected ? "btn-secondary" : "btn-primary"} btn-full`}
                onClick={() => toggleIntegration(integ.id)}
              >
                {integ.connected ? "Disconnect" : "Connect"}
              </button>
            </div>
          ))}
        </div>
      </div>
    );
  }

  function renderNotificationsTab() {
    return (
      <div className="settings-section">
        <h2>Notifications</h2>
        {notifications.map((notif) => (
          <div key={notif.id} className="settings-row">
            <div className="settings-row-info">
              <span className="settings-row-label">{notif.label}</span>
              <span className="settings-row-desc">{notif.description}</span>
            </div>
            <button
              className={`toggle ${notif.enabled ? "active" : ""}`}
              onClick={() => toggleNotification(notif.id)}
            />
          </div>
        ))}
      </div>
    );
  }

  function renderBillingTab() {
    return (
      <div className="settings-section">
        <h2>Billing & Plan</h2>
        <div
          className="card"
          style={{ padding: "var(--space-5)", marginBottom: "var(--space-5)" }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--space-4)" }}>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>Pro Plan</div>
              <span className="badge badge-teal">CURRENT PLAN</span>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 24, fontWeight: 700 }}>$49</div>
              <div className="text-muted" style={{ fontSize: 12 }}>per month</div>
            </div>
          </div>
          <div style={{ borderTop: "1px solid var(--border-default)", paddingTop: "var(--space-4)" }}>
            <div className="lens-section-title" style={{ marginBottom: "var(--space-3)" }}>Usage This Month</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "var(--space-4)" }}>
              <div>
                <div className="text-muted" style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>Roadmaps</div>
                <div style={{ fontSize: 20, fontWeight: 700 }}>3 / 10</div>
              </div>
              <div>
                <div className="text-muted" style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>Agent Runs</div>
                <div style={{ fontSize: 20, fontWeight: 700 }}>47 / 200</div>
              </div>
              <div>
                <div className="text-muted" style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>Team Members</div>
                <div style={{ fontSize: 20, fontWeight: 700 }}>8 / 15</div>
              </div>
            </div>
          </div>
        </div>
        <button className="btn btn-primary">Upgrade to Enterprise</button>
      </div>
    );
  }

  function renderTabContent() {
    switch (activeTab) {
      case "Workspace":
        return renderWorkspaceTab();
      case "Teams":
        return renderTeamsTab();
      case "Integrations":
        return renderIntegrationsTab();
      case "Notifications":
        return renderNotificationsTab();
      case "Billing":
        return renderBillingTab();
      default:
        return null;
    }
  }

  return (
    <div className="settings-page">
      <div className="page-header">
        <h1>Settings</h1>
      </div>

      <div className="tabs">
        {TABS.map((tab) => (
          <button
            key={tab}
            className={`tab ${activeTab === tab ? "active" : ""}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab}
          </button>
        ))}
      </div>

      <div style={{ paddingTop: "var(--space-5)" }}>
        {renderTabContent()}
      </div>
    </div>
  );
}
