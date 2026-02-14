import React, { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronDown, ChevronUp, ArrowUpDown } from "lucide-react";

const LENSES = [
  { id: "cs", name: "Customer Success" },
  { id: "eng", name: "Engineering" },
  { id: "rev", name: "Revenue" },
];

const SCORES = {
  supports: { icon: "\u2B24", color: "var(--green)", label: "Supports" },
  neutral: { icon: "\u25D0", color: "var(--yellow)", label: "Neutral" },
  risk: { icon: "\u25B2", color: "var(--red)", label: "Risk" },
};

const MOCK_FEATURES = [
  {
    id: 1,
    name: "SSO & SAML Integration",
    month: "Mar 2026",
    team: "Platform",
    category: "Security",
    scores: {
      cs: { score: "supports", text: "Top enterprise request" },
      eng: { score: "supports", text: "Straightforward implementation" },
      rev: { score: "supports", text: "Unlocks $1.2M pipeline" },
    },
  },
  {
    id: 2,
    name: "AI-Powered Suggestions",
    month: "Apr 2026",
    team: "Product",
    category: "AI/ML",
    scores: {
      cs: { score: "supports", text: "Reduces manual triaging" },
      eng: { score: "risk", text: "Requires new ML infra" },
      rev: { score: "neutral", text: "No direct revenue impact" },
    },
  },
  {
    id: 3,
    name: "Custom Dashboard Builder",
    month: "Mar 2026",
    team: "Frontend",
    category: "Analytics",
    scores: {
      cs: { score: "neutral", text: "Nice-to-have for power users" },
      eng: { score: "risk", text: "Significant frontend rework" },
      rev: { score: "supports", text: "Key to enterprise tier upsell" },
    },
  },
  {
    id: 4,
    name: "Bulk Import / Export",
    month: "May 2026",
    team: "Platform",
    category: "Data",
    scores: {
      cs: { score: "supports", text: "Frequent support ticket topic" },
      eng: { score: "neutral", text: "Moderate effort, known patterns" },
      rev: { score: "neutral", text: "Retention play, not new ARR" },
    },
  },
  {
    id: 5,
    name: "Mobile Responsive Redesign",
    month: "Jun 2026",
    team: "Frontend",
    category: "UX",
    scores: {
      cs: { score: "risk", text: "Low user demand currently" },
      eng: { score: "risk", text: "Touches every component" },
      rev: { score: "supports", text: "Required for SMB segment" },
    },
  },
  {
    id: 6,
    name: "Webhook & Event System",
    month: "Apr 2026",
    team: "Platform",
    category: "Integrations",
    scores: {
      cs: { score: "supports", text: "Enables partner integrations" },
      eng: { score: "supports", text: "Aligns with event-driven arch" },
      rev: { score: "supports", text: "Opens marketplace revenue" },
    },
  },
  {
    id: 7,
    name: "Role-Based Access Control",
    month: "May 2026",
    team: "Platform",
    category: "Security",
    scores: {
      cs: { score: "supports", text: "Blocker for 3 enterprise deals" },
      eng: { score: "neutral", text: "Auth layer needs refactoring" },
      rev: { score: "supports", text: "Enables enterprise pricing" },
    },
  },
  {
    id: 8,
    name: "Real-Time Collaboration",
    month: "Jun 2026",
    team: "Product",
    category: "Collaboration",
    scores: {
      cs: { score: "neutral", text: "Some teams request it" },
      eng: { score: "risk", text: "WebSocket infra not ready" },
      rev: { score: "neutral", text: "Differentiator, not closer" },
    },
  },
];

const TEAMS = ["All Teams", "Platform", "Product", "Frontend"];
const CATEGORIES = ["All Categories", "Security", "AI/ML", "Analytics", "Data", "UX", "Integrations", "Collaboration"];
const TIME_RANGES = ["All Time", "Mar 2026", "Apr 2026", "May 2026", "Jun 2026"];

function hasConflict(feature) {
  const scoreValues = Object.values(feature.scores).map((s) => s.score);
  return scoreValues.includes("supports") && scoreValues.includes("risk");
}

function scoreToNumeric(score) {
  if (score === "supports") return 3;
  if (score === "neutral") return 2;
  if (score === "risk") return 1;
  return 0;
}

export default function AdvisorPage() {
  const navigate = useNavigate();
  const [teamFilter, setTeamFilter] = useState("All Teams");
  const [categoryFilter, setCategoryFilter] = useState("All Categories");
  const [timeFilter, setTimeFilter] = useState("All Time");
  const [sortColumn, setSortColumn] = useState(null);
  const [sortDirection, setSortDirection] = useState("asc");

  function handleSort(columnId) {
    if (sortColumn === columnId) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortColumn(columnId);
      setSortDirection("asc");
    }
  }

  const filteredFeatures = useMemo(() => {
    let result = [...MOCK_FEATURES];

    if (teamFilter !== "All Teams") {
      result = result.filter((f) => f.team === teamFilter);
    }
    if (categoryFilter !== "All Categories") {
      result = result.filter((f) => f.category === categoryFilter);
    }
    if (timeFilter !== "All Time") {
      result = result.filter((f) => f.month === timeFilter);
    }

    if (sortColumn) {
      result.sort((a, b) => {
        let aVal, bVal;

        if (sortColumn === "conflict") {
          aVal = hasConflict(a) ? 1 : 0;
          bVal = hasConflict(b) ? 1 : 0;
        } else {
          aVal = scoreToNumeric(a.scores[sortColumn]?.score);
          bVal = scoreToNumeric(b.scores[sortColumn]?.score);
        }

        return sortDirection === "asc" ? aVal - bVal : bVal - aVal;
      });
    }

    return result;
  }, [teamFilter, categoryFilter, timeFilter, sortColumn, sortDirection]);

  function renderSortIcon(columnId) {
    if (sortColumn === columnId) {
      return sortDirection === "asc" ? (
        <ChevronUp size={12} style={{ marginLeft: 4 }} />
      ) : (
        <ChevronDown size={12} style={{ marginLeft: 4 }} />
      );
    }
    return <ArrowUpDown size={10} style={{ marginLeft: 4, opacity: 0.4 }} />;
  }

  function renderScoreCell(scoreData) {
    if (!scoreData) return null;
    const config = SCORES[scoreData.score];
    return (
      <div className="advisor-score">
        <span className="advisor-score-icon" style={{ color: config.color }}>
          {config.icon}
        </span>
        <span className="advisor-score-text" title={scoreData.text}>
          {scoreData.text}
        </span>
      </div>
    );
  }

  return (
    <div className="advisor-page">
      <div className="page-header">
        <h1>Advisor Board</h1>
        <p className="page-header-subtitle">
          All agent lens perspectives across features — spot conflicts at a glance
        </p>
      </div>

      <div className="filter-bar">
        <select
          className="input"
          value={teamFilter}
          onChange={(e) => setTeamFilter(e.target.value)}
        >
          {TEAMS.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>

        <select
          className="input"
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
        >
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>

        <select
          className="input"
          value={timeFilter}
          onChange={(e) => setTimeFilter(e.target.value)}
        >
          {TIME_RANGES.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </div>

      <div className="advisor-table-wrapper">
        <table className="advisor-table">
          <thead>
            <tr>
              <th>Feature</th>
              {LENSES.map((lens) => (
                <th key={lens.id} onClick={() => handleSort(lens.id)}>
                  {lens.name}
                  {renderSortIcon(lens.id)}
                </th>
              ))}
              <th onClick={() => handleSort("conflict")}>
                Conflict
                {renderSortIcon("conflict")}
              </th>
            </tr>
          </thead>
          <tbody>
            {filteredFeatures.map((feature) => {
              const conflict = hasConflict(feature);
              return (
                <tr key={feature.id} className={conflict ? "conflict" : ""}>
                  <td>
                    <span
                      style={{ cursor: "pointer", fontWeight: 600 }}
                      onClick={() => navigate("/roadmap/1")}
                    >
                      {feature.name}
                    </span>
                    <br />
                    <span className="text-muted" style={{ fontSize: 11 }}>
                      {feature.month}
                    </span>
                  </td>
                  {LENSES.map((lens) => (
                    <td key={lens.id}>
                      {renderScoreCell(feature.scores[lens.id])}
                    </td>
                  ))}
                  <td>
                    {conflict && (
                      <span className="conflict-badge">CONFLICT</span>
                    )}
                  </td>
                </tr>
              );
            })}
            {filteredFeatures.length === 0 && (
              <tr>
                <td
                  colSpan={LENSES.length + 2}
                  style={{ textAlign: "center", padding: 32, color: "var(--text-muted)" }}
                >
                  No features match the current filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
