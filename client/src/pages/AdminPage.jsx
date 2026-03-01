import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Users, Map, Trash2, ShieldCheck, ShieldOff, BarChart3, Download, Sparkles, Search } from "lucide-react";
import {
  getAdminStats,
  getAdminUsers,
  updateAdminUser,
  deleteAdminUser,
  getAdminRoadmaps,
  deleteAdminRoadmap,
  getAdminOnboardingResponses,
} from "../services/api";

const TABS = ["Overview", "Users", "Roadmaps", "Onboarding"];

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
      {activeTab === "Onboarding" && <OnboardingTab />}
    </div>
  );
}

/* ===== Overview Tab ===== */

function OverviewTab() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

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
    <div>
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

      <div style={{ marginTop: 32, paddingTop: 24, borderTop: "1px solid var(--border-default)" }}>
        <h3 style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)", marginBottom: 12 }}>Quick Actions</h3>
        <button
          className="btn btn-secondary"
          onClick={() => navigate("/onboarding")}
          style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
        >
          <Sparkles size={14} />
          Re-run Onboarding
        </button>
      </div>
    </div>
  );
}

/* ===== Users Tab ===== */

function UsersTab() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    getAdminUsers()
      .then(setUsers)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const currentUserId = (() => {
    try { return JSON.parse(localStorage.getItem("user") || "{}").id; } catch { return null; }
  })();

  const q = searchQuery.toLowerCase().trim();
  const filteredUsers = q
    ? users.filter((u) => u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q) || (u.workspace_name || "").toLowerCase().includes(q))
    : users;

  // Selectable users = filtered users except the current user
  const selectableUsers = filteredUsers.filter((u) => u.id !== currentUserId);
  const allSelected = selectableUsers.length > 0 && selectableUsers.every((u) => selected.has(u.id));

  function toggleSelect(userId) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  }

  function toggleSelectAll() {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(selectableUsers.map((u) => u.id)));
    }
  }

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
      setSelected((prev) => { const next = new Set(prev); next.delete(user.id); return next; });
    } catch (err) {
      alert(err.message);
    }
  }

  async function handleBulkDelete() {
    const count = selected.size;
    if (count === 0) return;
    if (!window.confirm(`Delete ${count} user${count !== 1 ? "s" : ""} and all their data? This cannot be undone.`)) return;
    setBulkDeleting(true);
    const ids = [...selected];
    const failed = [];
    for (const id of ids) {
      try {
        await deleteAdminUser(id);
        setUsers((prev) => prev.filter((u) => u.id !== id));
      } catch {
        failed.push(id);
      }
    }
    setSelected(new Set(failed));
    setBulkDeleting(false);
    if (failed.length > 0) alert(`Failed to delete ${failed.length} user${failed.length !== 1 ? "s" : ""}.`);
  }

  if (loading) return <p style={{ color: "var(--text-muted)", fontSize: 13 }}>Loading users...</p>;
  if (error) return <p style={{ color: "var(--red)", fontSize: 13 }}>{error}</p>;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flex: 1 }}>
          <p style={{ fontSize: 13, color: "var(--text-muted)", margin: 0, whiteSpace: "nowrap" }}>
            {filteredUsers.length}{q ? ` / ${users.length}` : ""} user{users.length !== 1 ? "s" : ""}
          </p>
          <div style={{ display: "flex", alignItems: "center", gap: 6, background: "var(--bg-secondary)", borderRadius: 6, padding: "5px 10px", flex: 1, maxWidth: 280 }}>
            <Search size={13} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
            <input
              type="text"
              placeholder="Search by name, email, or workspace..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                border: "none", background: "transparent", outline: "none",
                fontSize: 12, color: "var(--text-primary)", width: "100%",
                fontFamily: "var(--font-family)",
              }}
            />
          </div>
        </div>
        {selected.size > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
            <span style={{ fontSize: 12, fontWeight: 500, color: "var(--text-secondary)" }}>
              {selected.size} selected
            </span>
            <button
              onClick={handleBulkDelete}
              disabled={bulkDeleting}
              style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                padding: "5px 14px", fontSize: 12, fontWeight: 500,
                color: "#fff", background: "var(--red)", border: "none",
                borderRadius: 6, cursor: bulkDeleting ? "not-allowed" : "pointer",
                opacity: bulkDeleting ? 0.6 : 1, fontFamily: "var(--font-family)",
              }}
            >
              <Trash2 size={13} />
              {bulkDeleting ? "Deleting..." : `Delete ${selected.size}`}
            </button>
          </div>
        )}
      </div>
      <div style={{ maxHeight: 520, overflowY: "auto", border: "1px solid var(--border-default)", borderRadius: 8 }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead style={{ position: "sticky", top: 0, background: "var(--bg-primary)", zIndex: 1 }}>
          <tr style={{ borderBottom: "2px solid var(--border-default)" }}>
            <th style={{ width: 36, padding: "8px 12px" }}>
              <input
                type="checkbox"
                checked={allSelected}
                onChange={toggleSelectAll}
                style={{ margin: 0, cursor: "pointer" }}
                title="Select all"
              />
            </th>
            {["Name", "Email", "Workspace", "Roadmaps", "Joined", "Last Login", "Admin", ""].map((h) => (
              <th key={h} style={{ textAlign: "left", padding: "8px 12px", fontWeight: 600, color: "var(--text-secondary)", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filteredUsers.map((user) => {
            const isSelected = selected.has(user.id);
            const isSelf = user.id === currentUserId;
            return (
              <tr
                key={user.id}
                style={{
                  borderBottom: "1px solid var(--border-default)",
                  background: isSelected ? "rgba(59, 130, 246, 0.04)" : "transparent",
                }}
              >
                <td style={{ padding: "10px 12px", width: 36 }}>
                  {!isSelf && (
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleSelect(user.id)}
                      style={{ margin: 0, cursor: "pointer" }}
                    />
                  )}
                </td>
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
                    disabled={isSelf}
                    title={isSelf ? "Cannot change own admin" : user.is_admin ? "Remove admin" : "Make admin"}
                    style={{
                      background: "none",
                      border: "none",
                      cursor: isSelf ? "not-allowed" : "pointer",
                      color: user.is_admin ? "var(--teal)" : "var(--text-muted)",
                      opacity: isSelf ? 0.4 : 1,
                    }}
                  >
                    {user.is_admin ? <ShieldCheck size={16} /> : <ShieldOff size={16} />}
                  </button>
                </td>
                <td style={{ padding: "10px 12px" }}>
                  {!isSelf && (
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
            );
          })}
        </tbody>
      </table>
      </div>
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

/* ===== Onboarding Tab ===== */

const ONBOARDING_COLUMNS = [
  { key: "name", label: "Name" },
  { key: "email", label: "Email" },
  { key: "company_size", label: "Company Size" },
  { key: "company_nature", label: "Industry" },
  { key: "current_roadmap_tool", label: "Roadmap Tool" },
  { key: "tracks_feature_requests", label: "Tracks Requests" },
  { key: "crm", label: "CRM" },
  { key: "dev_task_tool", label: "Dev Tool" },
  { key: "created_at", label: "Completed" },
];

function OnboardingTab() {
  const [responses, setResponses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    getAdminOnboardingResponses()
      .then(setResponses)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  function exportCsv() {
    const headers = ONBOARDING_COLUMNS.map((c) => c.label);
    const rows = responses.map((r) =>
      ONBOARDING_COLUMNS.map((c) => {
        const val = r[c.key] || "";
        const escaped = String(val).replace(/"/g, '""');
        return `"${escaped}"`;
      })
    );
    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `onboarding-responses-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (loading) return <p style={{ color: "var(--text-muted)", fontSize: 13 }}>Loading responses...</p>;
  if (error) return <p style={{ color: "var(--red)", fontSize: 13 }}>{error}</p>;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <p style={{ fontSize: 13, color: "var(--text-muted)" }}>
          {responses.length} response{responses.length !== 1 ? "s" : ""}
        </p>
        {responses.length > 0 && (
          <button
            onClick={exportCsv}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "6px 14px",
              fontSize: 13,
              fontWeight: 500,
              color: "var(--text-secondary)",
              background: "var(--bg-primary)",
              border: "1px solid var(--border-default)",
              borderRadius: 6,
              cursor: "pointer",
              fontFamily: "var(--font-family)",
            }}
          >
            <Download size={14} />
            Export CSV
          </button>
        )}
      </div>
      {responses.length === 0 ? (
        <p style={{ fontSize: 13, color: "var(--text-muted)" }}>No onboarding responses yet.</p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: "2px solid var(--border-default)" }}>
                {ONBOARDING_COLUMNS.map((c) => (
                  <th
                    key={c.key}
                    style={{
                      textAlign: "left",
                      padding: "8px 12px",
                      fontWeight: 600,
                      color: "var(--text-secondary)",
                      fontSize: 11,
                      textTransform: "uppercase",
                      letterSpacing: "0.04em",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {responses.map((r) => (
                <tr key={r.id} style={{ borderBottom: "1px solid var(--border-default)" }}>
                  {ONBOARDING_COLUMNS.map((c) => (
                    <td
                      key={c.key}
                      style={{
                        padding: "10px 12px",
                        color: c.key === "name" ? "var(--text-primary)" : "var(--text-secondary)",
                        fontWeight: c.key === "name" ? 500 : 400,
                        fontSize: c.key === "created_at" ? 12 : 13,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {c.key === "created_at"
                        ? r[c.key] ? new Date(r[c.key]).toLocaleDateString() : "-"
                        : r[c.key] || "-"}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
