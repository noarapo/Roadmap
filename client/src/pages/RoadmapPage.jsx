import React, { useState, useCallback, useRef, useEffect } from "react";
import { useParams } from "react-router-dom";
import {
  Plus,
  Share2,
  Clock,
  MoreHorizontal,
  GripVertical,
  User,
  X,
} from "lucide-react";
import SidePanel from "../components/SidePanel";
import VersionHistoryPanel from "../components/VersionHistoryPanel";

/* ==================================================================
   MOCK DATA
   ================================================================== */

const MONTHS = [
  { key: "jan", label: "Jan", quarter: "Q1 2026" },
  { key: "feb", label: "Feb", quarter: "Q1 2026" },
  { key: "mar", label: "Mar", quarter: "Q1 2026" },
  { key: "apr", label: "Apr", quarter: "Q2 2026" },
  { key: "may", label: "May", quarter: "Q2 2026" },
  { key: "jun", label: "Jun", quarter: "Q2 2026" },
];

const SPRINTS_PER_MONTH = 2;
const TOTAL_SPRINTS = MONTHS.length * SPRINTS_PER_MONTH; // 12

/* Build a flat array of sprint descriptors */
const SPRINTS = MONTHS.flatMap((m, mi) =>
  Array.from({ length: SPRINTS_PER_MONTH }, (_, si) => ({
    id: `${m.key}-s${si + 1}`,
    label: `S${si + 1}`,
    monthIndex: mi,
    monthLabel: m.label,
    quarter: m.quarter,
    globalIndex: mi * SPRINTS_PER_MONTH + si,
  }))
);

/* Quarters derived from months */
const QUARTERS = [];
let prevQ = null;
MONTHS.forEach((m, i) => {
  if (m.quarter !== prevQ) {
    QUARTERS.push({ label: m.quarter, startMonth: i, monthSpan: 1 });
    prevQ = m.quarter;
  } else {
    QUARTERS[QUARTERS.length - 1].monthSpan += 1;
  }
});

const TAG_COLORS = {
  MVP: { bg: "var(--teal-bg)", color: "var(--teal)" },
  API: { bg: "var(--blue-bg)", color: "var(--blue)" },
  UX: { bg: "var(--purple-bg)", color: "var(--purple)" },
  Infra: { bg: "var(--orange-bg)", color: "var(--orange)" },
  Security: { bg: "var(--red-bg)", color: "var(--red)" },
  Analytics: { bg: "var(--yellow-bg)", color: "var(--yellow)" },
  Beta: { bg: "var(--green-bg)", color: "var(--green)" },
  Mobile: { bg: "var(--purple-bg)", color: "var(--purple)" },
};

function tagStyle(tag) {
  const c = TAG_COLORS[tag];
  return c
    ? { background: c.bg, color: c.color }
    : { background: "var(--bg-secondary)", color: "var(--text-secondary)" };
}

const INITIAL_ROWS = [
  { id: "row-1", name: "Core Platform", color: "var(--teal)" },
  { id: "row-2", name: "Integrations", color: "var(--blue)" },
  { id: "row-3", name: "Analytics", color: "var(--purple)" },
];

const INITIAL_CARDS = [
  {
    id: "card-1",
    name: "User Auth Overhaul",
    rowId: "row-1",
    sprintStart: 0,
    duration: 2,
    tags: ["MVP", "Security"],
    headcount: 3,
    lenses: ["green", "yellow"],
    status: "In Progress",
    team: "Backend",
    effort: 8,
    description: "Complete rewrite of the authentication flow with OAuth2 and SSO support.",
  },
  {
    id: "card-2",
    name: "Dashboard Redesign",
    rowId: "row-1",
    sprintStart: 2,
    duration: 3,
    tags: ["UX"],
    headcount: 2,
    lenses: ["green", "green", "yellow"],
    status: "Planned",
    team: "Frontend",
    effort: 13,
    description: "New analytics dashboard with customizable widgets and real-time data.",
  },
  {
    id: "card-3",
    name: "Auth Service v2",
    rowId: "row-1",
    sprintStart: 6,
    duration: 2,
    tags: ["API", "Infra"],
    headcount: 4,
    lenses: ["red"],
    status: "Planned",
    team: "Backend",
    effort: 21,
    description: "",
  },
  {
    id: "card-4",
    name: "Slack Integration",
    rowId: "row-2",
    sprintStart: 1,
    duration: 2,
    tags: ["API"],
    headcount: 2,
    lenses: ["green"],
    status: "In Progress",
    team: "Frontend",
    effort: 5,
    description: "Bi-directional Slack integration for notifications and commands.",
  },
  {
    id: "card-5",
    name: "Jira Sync",
    rowId: "row-2",
    sprintStart: 4,
    duration: 3,
    tags: ["API", "MVP"],
    headcount: 3,
    lenses: ["yellow", "green"],
    status: "Planned",
    team: "Backend",
    effort: 13,
    description: "",
  },
  {
    id: "card-6",
    name: "Webhook Framework",
    rowId: "row-2",
    sprintStart: 8,
    duration: 2,
    tags: ["Infra"],
    headcount: 2,
    lenses: ["green", "green"],
    status: "Placeholder",
    team: "Backend",
    effort: 8,
    description: "Generic webhook delivery system with retry and DLQ.",
  },
  {
    id: "card-7",
    name: "API Rate Limiting",
    rowId: "row-2",
    sprintStart: 10,
    duration: 2,
    tags: ["Security", "Infra"],
    headcount: 1,
    lenses: ["yellow"],
    status: "Placeholder",
    team: "Platform",
    effort: 5,
    description: "",
  },
  {
    id: "card-8",
    name: "Event Tracking v2",
    rowId: "row-3",
    sprintStart: 0,
    duration: 2,
    tags: ["Analytics"],
    headcount: 2,
    lenses: ["green", "yellow"],
    status: "In Progress",
    team: "Frontend",
    effort: 8,
    description: "Enhanced client-side event tracking with custom properties.",
  },
  {
    id: "card-9",
    name: "Funnel Analysis",
    rowId: "row-3",
    sprintStart: 3,
    duration: 2,
    tags: ["Analytics", "UX"],
    headcount: 2,
    lenses: ["green"],
    status: "Planned",
    team: "Frontend",
    effort: 8,
    description: "",
  },
  {
    id: "card-10",
    name: "Mobile SDK Beta",
    rowId: "row-3",
    sprintStart: 7,
    duration: 3,
    tags: ["Beta", "Mobile"],
    headcount: 3,
    lenses: ["yellow", "red"],
    status: "Placeholder",
    team: "Platform",
    effort: 21,
    description: "Cross-platform mobile SDK for iOS and Android.",
  },
];

const TEAMS = [
  { id: "team-fe", name: "Frontend", abbr: "FE", color: "var(--teal)" },
  { id: "team-be", name: "Backend", abbr: "BE", color: "var(--blue)" },
];

/* Per-month capacity data: [allocated, total] */
const CAPACITY_DATA = {
  "team-fe": [
    [4, 6], [5, 6], [3, 6], [6, 6], [4, 6], [5, 6],
  ],
  "team-be": [
    [5, 5], [4, 5], [5, 5], [3, 5], [5, 5], [5, 5],
  ],
};

function healthColor(allocated, total) {
  const ratio = allocated / total;
  if (ratio > 1) return "red";
  if (ratio > 0.8) return "yellow";
  return "green";
}

/* ==================================================================
   COLUMN CONFIG
   ================================================================== */

const SPRINT_COL_WIDTH = 110;
const ROW_HEADER_COL = "140px";

/* ==================================================================
   COMPONENT
   ================================================================== */

export default function RoadmapPage() {
  const { id } = useParams();

  /* --- Core state --- */
  const [roadmapName, setRoadmapName] = useState("2026 Product Roadmap");
  const [roadmapStatus, setRoadmapStatus] = useState("live"); // "live" | "draft"
  const [rows, setRows] = useState(INITIAL_ROWS);
  const [cards, setCards] = useState(INITIAL_CARDS);
  const [selectedCard, setSelectedCard] = useState(null);
  const [showVersionHistory, setShowVersionHistory] = useState(false);

  /* --- Top bar inline editing --- */
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(roadmapName);
  const titleInputRef = useRef(null);

  /* --- Row more-menu --- */
  const [rowMenuId, setRowMenuId] = useState(null);

  /* --- Share dropdown --- */
  const [showMoreMenu, setShowMoreMenu] = useState(false);

  /* --- Inline card creation --- */
  const [inlineCreate, setInlineCreate] = useState(null); // { rowId, sprintIndex }
  const [inlineCreateName, setInlineCreateName] = useState("");
  const inlineInputRef = useRef(null);

  useEffect(() => {
    setTitleDraft(roadmapName);
  }, [roadmapName]);

  useEffect(() => {
    if (editingTitle && titleInputRef.current) {
      titleInputRef.current.focus();
      titleInputRef.current.select();
    }
  }, [editingTitle]);

  useEffect(() => {
    if (inlineCreate && inlineInputRef.current) {
      inlineInputRef.current.focus();
    }
  }, [inlineCreate]);

  /* Close menus on outside click */
  useEffect(() => {
    function handleClick() {
      setRowMenuId(null);
      setShowMoreMenu(false);
    }
    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, []);

  /* --- Handlers --- */

  const commitTitle = useCallback(() => {
    setEditingTitle(false);
    const trimmed = titleDraft.trim();
    if (trimmed) setRoadmapName(trimmed);
    else setTitleDraft(roadmapName);
  }, [titleDraft, roadmapName]);

  const handleTitleKeyDown = useCallback(
    (e) => {
      if (e.key === "Enter") commitTitle();
      if (e.key === "Escape") {
        setTitleDraft(roadmapName);
        setEditingTitle(false);
      }
    },
    [commitTitle, roadmapName]
  );

  const toggleStatus = useCallback(() => {
    setRoadmapStatus((prev) => (prev === "live" ? "draft" : "live"));
  }, []);

  const handleCardClick = useCallback(
    (card) => {
      /* Compute a display-friendly sprint label */
      const sprint = SPRINTS[card.sprintStart];
      const sprintLabel = sprint
        ? `${sprint.label} - ${sprint.monthLabel} 2026`
        : "";
      setSelectedCard({ ...card, sprintLabel });
    },
    []
  );

  const handleCardUpdate = useCallback(
    (updated) => {
      setCards((prev) =>
        prev.map((c) => (c.id === updated.id ? { ...c, ...updated } : c))
      );
      setSelectedCard((prev) =>
        prev && prev.id === updated.id ? { ...prev, ...updated } : prev
      );
    },
    []
  );

  const handleAddRow = useCallback(() => {
    const newId = `row-${Date.now()}`;
    const colors = ["var(--teal)", "var(--blue)", "var(--purple)", "var(--orange)", "var(--red)", "var(--green)"];
    setRows((prev) => [
      ...prev,
      {
        id: newId,
        name: `New Row ${prev.length + 1}`,
        color: colors[prev.length % colors.length],
      },
    ]);
  }, []);

  const handleDeleteRow = useCallback((rowId) => {
    setRows((prev) => prev.filter((r) => r.id !== rowId));
    setCards((prev) => prev.filter((c) => c.rowId !== rowId));
    setRowMenuId(null);
  }, []);

  const handleCellAddClick = useCallback((rowId, sprintIndex) => {
    setInlineCreate({ rowId, sprintIndex });
    setInlineCreateName("");
  }, []);

  const commitInlineCreate = useCallback(() => {
    if (!inlineCreate) return;
    const trimmed = inlineCreateName.trim();
    if (trimmed) {
      const newCard = {
        id: `card-${Date.now()}`,
        name: trimmed,
        rowId: inlineCreate.rowId,
        sprintStart: inlineCreate.sprintIndex,
        duration: 1,
        tags: [],
        headcount: 1,
        lenses: [],
        status: "Placeholder",
        team: "Frontend",
        effort: 0,
        description: "",
      };
      setCards((prev) => [...prev, newCard]);
    }
    setInlineCreate(null);
    setInlineCreateName("");
  }, [inlineCreate, inlineCreateName]);

  const handleInlineKeyDown = useCallback(
    (e) => {
      if (e.key === "Enter") commitInlineCreate();
      if (e.key === "Escape") {
        setInlineCreate(null);
        setInlineCreateName("");
      }
    },
    [commitInlineCreate]
  );

  /* --- Derived data --- */

  /* CSS grid template: row-header + one column per sprint */
  const gridTemplateColumns = `${ROW_HEADER_COL} repeat(${TOTAL_SPRINTS}, ${SPRINT_COL_WIDTH}px)`;

  /* Row index mapping: header rows occupy grid rows 1-3, data rows start at 4 */
  const HEADER_ROWS = 3; // quarter, month, sprint
  const dataRowStart = (rowIdx) => HEADER_ROWS + 1 + rowIdx;

  /* Sprint column in grid (1-indexed, offset by 1 for row header) */
  const sprintCol = (si) => si + 2; // col 1 = row header, col 2 = first sprint

  /* ==================================================================
     RENDER
     ================================================================== */

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {/* ── Top Bar ── */}
      <div className="topbar">
        <div className="topbar-left">
          {editingTitle ? (
            <input
              ref={titleInputRef}
              className="topbar-title-input"
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              onBlur={commitTitle}
              onKeyDown={handleTitleKeyDown}
            />
          ) : (
            <span
              className="topbar-title"
              onClick={() => setEditingTitle(true)}
              style={{ cursor: "pointer" }}
              title="Click to rename"
            >
              {roadmapName}
            </span>
          )}

          {/* Status pill */}
          <span
            className={`badge ${roadmapStatus === "live" ? "badge-green" : "badge-gray"}`}
            onClick={toggleStatus}
            style={{ cursor: "pointer", userSelect: "none" }}
            title="Click to toggle status"
          >
            {roadmapStatus === "live" ? "LIVE" : "DRAFT"}
          </span>
        </div>

        <div className="topbar-right">
          <button className="btn btn-secondary" type="button">
            <Share2 size={14} />
            Share
          </button>

          <button
            className="btn-icon"
            type="button"
            onClick={() => setShowVersionHistory(true)}
            title="Version history"
          >
            <Clock size={16} />
          </button>

          <div className="dropdown">
            <button
              className="btn-icon"
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setShowMoreMenu((v) => !v);
              }}
            >
              <MoreHorizontal size={16} />
            </button>
            {showMoreMenu && (
              <div className="dropdown-menu">
                <button className="dropdown-item" type="button">Duplicate roadmap</button>
                <button className="dropdown-item" type="button">Export as CSV</button>
                <button className="dropdown-item" type="button">Export as PNG</button>
                <div className="dropdown-divider" />
                <button className="dropdown-item destructive" type="button">Delete roadmap</button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Canvas Area ── */}
      <div className="canvas-wrapper">
        <div
          className="canvas-grid"
          style={{
            gridTemplateColumns,
            gridTemplateRows: `36px 32px 24px repeat(${rows.length}, minmax(90px, auto))`,
          }}
        >
          {/* ── Row 1: Quarter headers ── */}
          {/* Top-left corner cell spanning the 3 header rows */}
          <div
            style={{
              gridColumn: "1 / 2",
              gridRow: "1 / 4",
              background: "var(--bg-primary)",
              borderRight: "1px solid var(--border-default)",
              borderBottom: "1px solid var(--border-default)",
              position: "sticky",
              left: 0,
              top: 0,
              zIndex: 15,
            }}
          />

          {QUARTERS.map((q, qi) => {
            const startCol = q.startMonth * SPRINTS_PER_MONTH + 2; // +2 because col 1 = row-header
            const spanCols = q.monthSpan * SPRINTS_PER_MONTH;
            return (
              <div
                key={qi}
                className="quarter-header"
                style={{
                  gridColumn: `${startCol} / ${startCol + spanCols}`,
                  gridRow: "1 / 2",
                }}
              >
                {q.label}
              </div>
            );
          })}

          {/* ── Row 2: Month headers ── */}
          {MONTHS.map((m, mi) => {
            const startCol = mi * SPRINTS_PER_MONTH + 2;
            const spanCols = SPRINTS_PER_MONTH;
            return (
              <div
                key={m.key}
                className="month-header"
                style={{
                  gridColumn: `${startCol} / ${startCol + spanCols}`,
                  gridRow: "2 / 3",
                }}
              >
                {m.label}
              </div>
            );
          })}

          {/* ── Row 3: Sprint headers ── */}
          {SPRINTS.map((s) => (
            <div
              key={s.id}
              className="sprint-header"
              style={{
                gridColumn: `${sprintCol(s.globalIndex)} / ${sprintCol(s.globalIndex) + 1}`,
                gridRow: "3 / 4",
              }}
            >
              {s.label}
            </div>
          ))}

          {/* ── Data Rows ── */}
          {rows.map((row, ri) => {
            const gridRow = dataRowStart(ri);
            const cardsInRow = cards.filter((c) => c.rowId === row.id);

            return (
              <React.Fragment key={row.id}>
                {/* Row header (sticky left) */}
                <div
                  className="row-header"
                  style={{
                    gridColumn: "1 / 2",
                    gridRow: `${gridRow} / ${gridRow + 1}`,
                  }}
                >
                  <span className="row-color-bar" style={{ background: row.color }} />
                  <span className="row-name">{row.name}</span>
                  <div style={{ display: "flex", gap: 2, opacity: 0, transition: "opacity 150ms" }} className="row-actions">
                    <button className="btn-icon" type="button" style={{ padding: 2 }}>
                      <GripVertical size={12} />
                    </button>
                    <div className="dropdown">
                      <button
                        className="btn-icon"
                        type="button"
                        style={{ padding: 2 }}
                        onClick={(e) => {
                          e.stopPropagation();
                          setRowMenuId(rowMenuId === row.id ? null : row.id);
                        }}
                      >
                        <MoreHorizontal size={12} />
                      </button>
                      {rowMenuId === row.id && (
                        <div className="dropdown-menu" style={{ left: 0, right: "auto" }}>
                          <button className="dropdown-item" type="button">Rename</button>
                          <button className="dropdown-item" type="button">Change color</button>
                          <div className="dropdown-divider" />
                          <button
                            className="dropdown-item destructive"
                            type="button"
                            onClick={() => handleDeleteRow(row.id)}
                          >
                            Delete row
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Grid cells for each sprint */}
                {SPRINTS.map((s) => {
                  const isInlineHere =
                    inlineCreate &&
                    inlineCreate.rowId === row.id &&
                    inlineCreate.sprintIndex === s.globalIndex;

                  /* Only render cards whose sprintStart equals this cell's index.
                     Multi-sprint cards span via gridColumn. */
                  const cellCards = cardsInRow.filter(
                    (c) => c.sprintStart === s.globalIndex
                  );

                  return (
                    <div
                      key={`${row.id}-${s.id}`}
                      className="grid-cell"
                      style={{
                        gridColumn: `${sprintCol(s.globalIndex)} / ${sprintCol(s.globalIndex) + 1}`,
                        gridRow: `${gridRow} / ${gridRow + 1}`,
                      }}
                    >
                      {/* Feature cards */}
                      {cellCards.map((c) => (
                        <div
                          key={c.id}
                          className={`feature-card${selectedCard && selectedCard.id === c.id ? " selected" : ""}`}
                          onClick={() => handleCardClick(c)}
                          style={
                            c.duration > 1
                              ? {
                                  /* Span multiple sprint columns */
                                  position: "absolute",
                                  top: "var(--space-2)",
                                  left: "var(--space-2)",
                                  width: `calc(${c.duration * SPRINT_COL_WIDTH}px - var(--space-2) - 1px)`,
                                  zIndex: 3,
                                }
                              : undefined
                          }
                        >
                          <div className="feature-card-name">{c.name}</div>
                          {c.tags.length > 0 && (
                            <div className="feature-card-tags">
                              {c.tags.map((t) => (
                                <span key={t} className="tag" style={tagStyle(t)}>
                                  {t}
                                </span>
                              ))}
                            </div>
                          )}
                          <div className="feature-card-footer">
                            {c.lenses.length > 0 && (
                              <div className="feature-card-lenses">
                                {c.lenses.map((color, li) => (
                                  <span
                                    key={li}
                                    className="lens-dot"
                                    style={{ background: `var(--${color})` }}
                                  />
                                ))}
                              </div>
                            )}
                            <span className="feature-card-headcount">
                              <User size={10} />
                              {c.headcount}
                            </span>
                          </div>
                        </div>
                      ))}

                      {/* Inline card creation input */}
                      {isInlineHere && (
                        <div className="feature-card placeholder" style={{ zIndex: 4 }}>
                          <input
                            ref={inlineInputRef}
                            className="inline-input"
                            style={{ fontSize: 12, fontWeight: 600 }}
                            placeholder="Card name..."
                            value={inlineCreateName}
                            onChange={(e) => setInlineCreateName(e.target.value)}
                            onBlur={commitInlineCreate}
                            onKeyDown={handleInlineKeyDown}
                          />
                        </div>
                      )}

                      {/* "+" button shown on cell hover */}
                      {!isInlineHere && (
                        <button
                          className="cell-add-btn"
                          type="button"
                          onClick={() => handleCellAddClick(row.id, s.globalIndex)}
                        >
                          <Plus size={14} />
                        </button>
                      )}
                    </div>
                  );
                })}
              </React.Fragment>
            );
          })}

          {/* ── "+ Add row" button ── */}
          <div
            style={{
              gridColumn: "1 / 2",
              gridRow: `${dataRowStart(rows.length)} / ${dataRowStart(rows.length) + 1}`,
              position: "sticky",
              left: 0,
              zIndex: 10,
              display: "flex",
              alignItems: "center",
              padding: "var(--space-2) var(--space-3)",
            }}
          >
            <button
              className="btn btn-ghost btn-full"
              type="button"
              onClick={handleAddRow}
              style={{ justifyContent: "flex-start", fontSize: 12 }}
            >
              <Plus size={14} />
              Add row
            </button>
          </div>
        </div>

        {/* ── Capacity Footer ── */}
        <div className="capacity-footer">
          <div className="capacity-footer-label">
            <span className="small-label">CAPACITY</span>
          </div>
          {MONTHS.map((m, mi) => {
            const colSpan = SPRINTS_PER_MONTH;
            return (
              <div
                key={m.key}
                className="capacity-cell"
                style={{ minWidth: SPRINT_COL_WIDTH * colSpan }}
              >
                {TEAMS.map((team) => {
                  const [alloc, total] = CAPACITY_DATA[team.id][mi];
                  const pct = Math.round((alloc / total) * 100);
                  const hc = healthColor(alloc, total);
                  return (
                    <div key={team.id} className="capacity-team-row">
                      <span
                        className="color-dot color-dot-sm"
                        style={{ background: team.color }}
                      />
                      <span className="capacity-team-name">{team.abbr}</span>
                      <div className="health-bar">
                        <div
                          className={`health-bar-fill ${hc}`}
                          style={{ width: `${Math.min(pct, 100)}%` }}
                        />
                      </div>
                      <span className="capacity-numbers">
                        {alloc}/{total}
                      </span>
                      {alloc > total && (
                        <span className="badge-over">OVER</span>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Side Panel (card detail) ── */}
      {selectedCard && (
        <SidePanel
          card={selectedCard}
          onClose={() => setSelectedCard(null)}
          onUpdate={handleCardUpdate}
        />
      )}

      {/* ── Version History Panel ── */}
      {showVersionHistory && (
        <VersionHistoryPanel onClose={() => setShowVersionHistory(false)} />
      )}

      {/* ── Inline styles for hover-reveal on row actions ── */}
      <style>{`
        .row-header:hover .row-actions {
          opacity: 1 !important;
        }
      `}</style>
    </div>
  );
}
