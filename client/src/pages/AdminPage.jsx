import React, { useState, useEffect } from "react";
import { Users, Map, Trash2, ShieldCheck, ShieldOff, BarChart3 } from "lucide-react";
import {
  getAdminStats,
  getAdminUsers,
  updateAdminUser,
  deleteAdminUser,
  getAdminRoadmaps,
  deleteAdminRoadmap,
} from "../services/api";

const TABS = ["Overview", "Users", "Roadmaps"];

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState("Overview");

  return (
    <div style={{ padding: "32px 40px", maxWidth: 1100, margin: "0 auto" }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 600, color: "var(--text-primary)" }}>Admin Panel</h1>
        <p style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 4 }}>
          Manage users, roadmaps, and monitor your app.
        </p>
      </div>

      <div style={{ display: "flex", gap: 4, borderBottom: "1px solid var(--border-default)", marginBottom: 24 }}>
        {TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              padding: "8px 16px",
              fontSize: 13,
              fontWeight: activeTab === tab ? 600 : 400,
              color: activeTab === tab ? "var(--teal)" : "var(--text-secondary)",
              background: "none",
              border: "none",
              borderBottom: activeTab === tab ? "2px solid var(--teal)" : "2px solid transparent",
              cursor: "pointer",
              fontFamily: "var(--font-family)",
              transition: "color 100ms",
            }}
          >
            {tab}
          </button>
        ))}
      </div>

      {activeTab === "Overview" && <OverviewTab />}
      {activeTab === "Users" && <UsersTab />}
      {activeTab === "Roadmaps" && <RoadmapsTab />}
    </div>
  );
}

/* ===== Overview Tab ===== */

function OverviewTab() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getAdminStats()
      .then(setStats)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p style={{ color: "var(--text-muted)", fontSize: 13 }}>Loading...</p>;
  if (!stats) return <p style={{ color: "var(--red)", fontSize: 13 }}>Failed to load stats.</p>;

  const cards = [
    { label: "Users", value: stats.users, icon: Users, color: "var(--blue)" },
    { label: "Workspaces", value: stats.workspaces, icon: ShieldCheck, color: "var(--purple)" },
    { label: "Roadmaps", value: stats.roadmaps, icon: Map, color: "var(--teal)" },
    { label: "Cards", value: stats.cards, icon: BarChart3, color: "var(--orange)" },
  ];

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 16 }}>
      {cards.map((c) => (
        <div
          key={c.label}
          style={{
            background: "var(--bg-primary)",
            border: "1px solid var(--border-default)",
            borderRadius: 10,
            padding: "20px 24px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <c.icon size={16} color={c.color} />
            <span style={{ fontSize: 12, fontWeight: 500, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
              {c.label}
            </span>
          </div>
          <span style={{ fontSize: 28, fontWeight: 700, color: "var(--text-primary)" }}>{c.value}</span>
        </div>
      ))}
    </div>
  );
}

/* ===== Users Tab ===== */

function UsersTab() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    getAdminUsers()
      .then(setUsers)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  async function handleToggleAdmin(user) {
    try {
      const updated = await updateAdminUser(user.id, { is_admin: !user.is_admin });
      setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
    } catch (err) {
      alert(err.message);
    }
  }

  async function handleDelete(user) {
    if (!window.confirm(`Delete user "${user.name}" and all their data? This cannot be undone.`)) return;
    try {
      await deleteAdminUser(user.id);
      setUsers((prev) => prev.filter((u) => u.id !== user.id));
    } catch (err) {
      alert(err.message);
    }
  }

  if (loading) return <p style={{ color: "var(--text-muted)", fontSize: 13 }}>Loading users...</p>;
  if (error) return <p style={{ color: "var(--red)", fontSize: 13 }}>{error}</p>;

  const currentUserId = (() => {
    try { return JSON.parse(localStorage.getItem("user") || "{}").id; } catch { return null; }
  })();

  return (
    <div>
      <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 16 }}>{users.length} user{users.length !== 1 ? "s" : ""} total</p>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr style={{ borderBottom: "2px solid var(--border-default)" }}>
            {["Name", "Email", "Workspace", "Roadmaps", "Joined", "Last Login", "Admin", ""].map((h) => (
              <th key={h} style={{ textAlign: "left", padding: "8px 12px", fontWeight: 600, color: "var(--text-secondary)", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {users.map((user) => (
            <tr key={user.id} style={{ borderBottom: "1px solid var(--border-default)" }}>
              <td style={{ padding: "10px 12px", fontWeight: 500 }}>{user.name}</td>
              <td style={{ padding: "10px 12px", color: "var(--text-secondary)" }}>{user.email}</td>
              <td style={{ padding: "10px 12px", color: "var(--text-secondary)" }}>{user.workspace_name || "-"}</td>
              <td style={{ padding: "10px 12px", color: "var(--text-secondary)" }}>{user.roadmap_count}</td>
              <td style={{ padding: "10px 12px", color: "var(--text-muted)", fontSize: 12 }}>
                {user.created_at ? new Date(user.created_at).toLocaleDateString() : "-"}
              </td>
              <td style={{ padding: "10px 12px", color: "var(--text-muted)", fontSize: 12 }}>
                {user.last_login_at ? new Date(user.last_login_at).toLocaleDateString() : "Never"}
              </td>
              <td style={{ padding: "10px 12px" }}>
                <button
                  onClick={() => handleToggleAdmin(user)}
                  disabled={user.id === currentUserId}
                  title={user.id === currentUserId ? "Cannot change own admin" : user.is_admin ? "Remove admin" : "Make admin"}
                  style={{
                    background: "none",
                    border: "none",
                    cursor: user.id === currentUserId ? "not-allowed" : "pointer",
                    color: user.is_admin ? "var(--teal)" : "var(--text-muted)",
                    opacity: user.id === currentUserId ? 0.4 : 1,
                  }}
                >
                  {user.is_admin ? <ShieldCheck size={16} /> : <ShieldOff size={16} />}
                </button>
              </td>
              <td style={{ padding: "10px 12px" }}>
                {user.id !== currentUserId && (
                  <button
                    onClick={() => handleDelete(user)}
                    title="Delete user"
                    style={{
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      color: "var(--text-muted)",
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = "var(--red)")}
                    onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-muted)")}
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ===== Roadmaps Tab ===== */

function RoadmapsTab() {
  const [roadmaps, setRoadmaps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    getAdminRoadmaps()
      .then(setRoadmaps)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  async function handleDelete(rm) {
    if (!window.confirm(`Delete roadmap "${rm.name}"? This cannot be undone.`)) return;
    try {
      await deleteAdminRoadmap(rm.id);
      setRoadmaps((prev) => prev.filter((r) => r.id !== rm.id));
    } catch (err) {
      alert(err.message);
    }
  }

  if (loading) return <p style={{ color: "var(--text-muted)", fontSize: 13 }}>Loading roadmaps...</p>;
  if (error) return <p style={{ color: "var(--red)", fontSize: 13 }}>{error}</p>;

  return (
    <div>
      <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 16 }}>{roadmaps.length} roadmap{roadmaps.length !== 1 ? "s" : ""} total</p>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr style={{ borderBottom: "2px solid var(--border-default)" }}>
            {["Name", "Workspace", "Cards", "Status", "Created", ""].map((h) => (
              <th key={h} style={{ textAlign: "left", padding: "8px 12px", fontWeight: 600, color: "var(--text-secondary)", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {roadmaps.map((rm) => (
            <tr key={rm.id} style={{ borderBottom: "1px solid var(--border-default)" }}>
              <td style={{ padding: "10px 12px", fontWeight: 500 }}>{rm.name}</td>
              <td style={{ padding: "10px 12px", color: "var(--text-secondary)" }}>{rm.workspace_name || "-"}</td>
              <td style={{ padding: "10px 12px", color: "var(--text-secondary)" }}>{rm.card_count}</td>
              <td style={{ padding: "10px 12px" }}>
                <span style={{
                  fontSize: 11,
                  fontWeight: 600,
                  padding: "2px 8px",
                  borderRadius: 4,
                  background: rm.status === "active" ? "var(--green-bg)" : "var(--bg-secondary)",
                  color: rm.status === "active" ? "var(--green)" : "var(--text-muted)",
                }}>
                  {rm.status || "draft"}
                </span>
              </td>
              <td style={{ padding: "10px 12px", color: "var(--text-muted)", fontSize: 12 }}>
                {rm.created_at ? new Date(rm.created_at).toLocaleDateString() : "-"}
              </td>
              <td style={{ padding: "10px 12px" }}>
                <button
                  onClick={() => handleDelete(rm)}
                  title="Delete roadmap"
                  style={{
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    color: "var(--text-muted)",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = "var(--red)")}
                  onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-muted)")}
                >
                  <Trash2 size={14} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
