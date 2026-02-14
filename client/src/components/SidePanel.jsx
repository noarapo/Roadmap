import React, { useState, useCallback, useRef, useEffect } from "react";
import {
  X,
  Plus,
  ArrowRight,
  Trash2,
  Eye,
  AlertTriangle,
  CheckCircle2,
  MinusCircle,
} from "lucide-react";
import NumberStepper from "./NumberStepper";

/* ------------------------------------------------------------------ */
/*  Mock data used for Perspectives, Dependencies, and Activity tabs  */
/* ------------------------------------------------------------------ */

const MOCK_LENSES = [
  {
    id: "lens-1",
    icon: "eye",
    name: "Customer Impact",
    score: "SUPPORTS",
    badgeClass: "badge-green",
    narrative:
      "This feature directly addresses the #2 most-requested item in our NPS verbatims. Customers in the Enterprise segment have cited this gap as a reason for churn in 3 of the last 5 exit interviews.",
    updated: "2 hours ago",
  },
  {
    id: "lens-2",
    icon: "shield",
    name: "Engineering Risk",
    score: "FLAGS RISK",
    badgeClass: "badge-red",
    narrative:
      "Depends on the new auth service migration which is currently 2 sprints behind. The team estimates a 40% chance of scope creep due to legacy API compatibility requirements.",
    updated: "5 hours ago",
  },
  {
    id: "lens-3",
    icon: "target",
    name: "Strategic Alignment",
    score: "NEUTRAL",
    badgeClass: "badge-yellow",
    narrative:
      "Aligns with the H1 OKR for platform extensibility but competes for resources with the compliance initiative which has a hard regulatory deadline.",
    updated: "1 day ago",
  },
];

const MOCK_DEPENDENCIES = [
  {
    id: "dep-1",
    cardId: "card-3",
    cardName: "Auth Service v2",
    type: "blocked-by",
    status: "in-progress",
  },
  {
    id: "dep-2",
    cardId: "card-7",
    cardName: "API Rate Limiting",
    type: "blocks",
    status: "planned",
  },
];

const MOCK_ACTIVITY = [
  {
    id: "act-1",
    type: "comment",
    author: "Sarah Chen",
    initials: "SC",
    time: "2 hours ago",
    text: "Moved this to Sprint 3 based on the dependency analysis. Let me know if the backend team can start earlier.",
  },
  {
    id: "act-2",
    type: "system",
    text: "Status changed from Planned to In Progress",
    time: "5 hours ago",
  },
  {
    id: "act-3",
    type: "comment",
    author: "Marcus Liu",
    initials: "ML",
    time: "1 day ago",
    text: "The design specs are ready. I've attached the Figma link in the description. @Sarah please review before sprint planning.",
  },
  {
    id: "act-4",
    type: "system",
    text: "Card created by Alex Rivera",
    time: "3 days ago",
  },
];

const STATUS_OPTIONS = ["Placeholder", "Planned", "In Progress", "Done"];
const TEAM_OPTIONS = ["Frontend", "Backend", "Design", "Platform"];

const LENS_ICONS = {
  eye: Eye,
  shield: AlertTriangle,
  target: CheckCircle2,
};

const TYPE_LABELS = {
  "blocked-by": "Blocked by",
  blocks: "Blocks",
  "related-to": "Related to",
};

/* ------------------------------------------------------------------ */
/*  SidePanel Component                                                */
/* ------------------------------------------------------------------ */

export default function SidePanel({ card, onClose, onUpdate }) {
  const [activeTab, setActiveTab] = useState("details");
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState(card.name);
  const [description, setDescription] = useState(card.description || "");
  const [status, setStatus] = useState(card.status || "Planned");
  const [team, setTeam] = useState(card.team || "Frontend");
  const [effort, setEffort] = useState(card.effort || 5);
  const [headcount, setHeadcount] = useState(card.headcount || 2);
  const [tags, setTags] = useState(card.tags || []);
  const [addingTag, setAddingTag] = useState(false);
  const [newTagValue, setNewTagValue] = useState("");
  const [commentText, setCommentText] = useState("");
  const [activities, setActivities] = useState(MOCK_ACTIVITY);
  const [dependencies, setDependencies] = useState(MOCK_DEPENDENCIES);

  const nameInputRef = useRef(null);
  const tagInputRef = useRef(null);

  /* Keep local state in sync when card prop changes */
  useEffect(() => {
    setNameValue(card.name);
    setDescription(card.description || "");
    setStatus(card.status || "Planned");
    setTeam(card.team || "Frontend");
    setEffort(card.effort || 5);
    setHeadcount(card.headcount || 2);
    setTags(card.tags || []);
  }, [card]);

  useEffect(() => {
    if (editingName && nameInputRef.current) {
      nameInputRef.current.focus();
      nameInputRef.current.select();
    }
  }, [editingName]);

  useEffect(() => {
    if (addingTag && tagInputRef.current) {
      tagInputRef.current.focus();
    }
  }, [addingTag]);

  /* --- Handlers --- */

  const commitName = useCallback(() => {
    setEditingName(false);
    const trimmed = nameValue.trim();
    if (trimmed && trimmed !== card.name) {
      onUpdate({ ...card, name: trimmed });
    } else {
      setNameValue(card.name);
    }
  }, [nameValue, card, onUpdate]);

  const handleNameKeyDown = useCallback(
    (e) => {
      if (e.key === "Enter") commitName();
      if (e.key === "Escape") {
        setNameValue(card.name);
        setEditingName(false);
      }
    },
    [commitName, card.name]
  );

  const handleStatusChange = useCallback(
    (e) => {
      const val = e.target.value;
      setStatus(val);
      onUpdate({ ...card, status: val });
    },
    [card, onUpdate]
  );

  const handleTeamChange = useCallback(
    (e) => {
      const val = e.target.value;
      setTeam(val);
      onUpdate({ ...card, team: val });
    },
    [card, onUpdate]
  );

  const handleEffortChange = useCallback(
    (e) => {
      const val = parseInt(e.target.value, 10) || 0;
      setEffort(val);
      onUpdate({ ...card, effort: val });
    },
    [card, onUpdate]
  );

  const handleHeadcountChange = useCallback(
    (val) => {
      setHeadcount(val);
      onUpdate({ ...card, headcount: val });
    },
    [card, onUpdate]
  );

  const handleAddTag = useCallback(() => {
    if (addingTag) {
      const trimmed = newTagValue.trim();
      if (trimmed && !tags.includes(trimmed)) {
        const next = [...tags, trimmed];
        setTags(next);
        onUpdate({ ...card, tags: next });
      }
      setAddingTag(false);
      setNewTagValue("");
    } else {
      setAddingTag(true);
    }
  }, [addingTag, newTagValue, tags, card, onUpdate]);

  const handleTagKeyDown = useCallback(
    (e) => {
      if (e.key === "Enter") handleAddTag();
      if (e.key === "Escape") {
        setAddingTag(false);
        setNewTagValue("");
      }
    },
    [handleAddTag]
  );

  const handleRemoveTag = useCallback(
    (tagToRemove) => {
      const next = tags.filter((t) => t !== tagToRemove);
      setTags(next);
      onUpdate({ ...card, tags: next });
    },
    [tags, card, onUpdate]
  );

  const handlePostComment = useCallback(() => {
    const trimmed = commentText.trim();
    if (!trimmed) return;
    const newAct = {
      id: `act-${Date.now()}`,
      type: "comment",
      author: "You",
      initials: "YO",
      time: "Just now",
      text: trimmed,
    };
    setActivities((prev) => [newAct, ...prev]);
    setCommentText("");
  }, [commentText]);

  const handleCommentKeyDown = useCallback(
    (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handlePostComment();
      }
    },
    [handlePostComment]
  );

  const handleRemoveDependency = useCallback((depId) => {
    setDependencies((prev) => prev.filter((d) => d.id !== depId));
  }, []);

  /* --- Tab Content Renderers --- */

  const renderDetailsTab = () => (
    <div className="side-panel-content">
      {/* Field rows */}
      <div className="detail-field">
        <span className="detail-field-label">Team</span>
        <div className="detail-field-value">
          <select className="input" value={team} onChange={handleTeamChange} style={{ width: 140, textAlign: "left" }}>
            {TEAM_OPTIONS.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="detail-field">
        <span className="detail-field-label">Effort</span>
        <div className="detail-field-value" style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: "var(--space-2)" }}>
          <input
            className="input"
            type="number"
            value={effort}
            onChange={handleEffortChange}
            min={0}
            style={{ width: 60, textAlign: "center" }}
          />
          <span className="text-muted" style={{ fontSize: 12 }}>pts</span>
        </div>
      </div>

      <div className="detail-field">
        <span className="detail-field-label">Headcount</span>
        <div className="detail-field-value" style={{ display: "flex", justifyContent: "flex-end" }}>
          <NumberStepper value={headcount} onChange={handleHeadcountChange} min={1} max={20} />
        </div>
      </div>

      <div className="detail-field">
        <span className="detail-field-label">Sprint</span>
        <div className="detail-field-value">
          <span style={{ fontSize: 13 }}>{card.sprintLabel || "S1 - Jan 2026"}</span>
        </div>
      </div>

      <div className="detail-field">
        <span className="detail-field-label">Duration</span>
        <div className="detail-field-value">
          <span style={{ fontSize: 13 }}>{card.duration || 1} sprint{(card.duration || 1) !== 1 ? "s" : ""}</span>
        </div>
      </div>

      {/* Tags */}
      <div style={{ marginTop: "var(--space-4)" }}>
        <span className="small-label" style={{ marginBottom: "var(--space-2)", display: "block" }}>Tags</span>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-2)", alignItems: "center" }}>
          {tags.map((t) => (
            <span
              key={t}
              className="tag"
              style={{ background: "var(--teal-bg)", color: "var(--teal)", cursor: "pointer" }}
              onClick={() => handleRemoveTag(t)}
              title="Click to remove"
            >
              {t}
            </span>
          ))}
          {addingTag ? (
            <input
              ref={tagInputRef}
              className="input"
              style={{ width: 100, height: 24, fontSize: 11, padding: "2px 6px" }}
              value={newTagValue}
              onChange={(e) => setNewTagValue(e.target.value)}
              onBlur={handleAddTag}
              onKeyDown={handleTagKeyDown}
              placeholder="Tag name"
            />
          ) : (
            <button
              className="btn-icon"
              onClick={handleAddTag}
              type="button"
              style={{ fontSize: 11, color: "var(--teal)" }}
            >
              <Plus size={12} /> Add tag
            </button>
          )}
        </div>
      </div>

      {/* Dependencies in details */}
      <div style={{ marginTop: "var(--space-4)" }}>
        <span className="small-label" style={{ marginBottom: "var(--space-2)", display: "block" }}>Dependencies</span>
        {dependencies.length === 0 ? (
          <span className="text-muted" style={{ fontSize: 12 }}>No dependencies</span>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
            {dependencies.map((dep) => (
              <div
                key={dep.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "var(--space-2)",
                  background: "var(--bg-secondary)",
                  borderRadius: 6,
                  fontSize: 12,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
                  <span className="badge badge-blue" style={{ fontSize: 9 }}>{TYPE_LABELS[dep.type]}</span>
                  <span style={{ fontWeight: 600 }}>{dep.cardName}</span>
                </div>
              </div>
            ))}
          </div>
        )}
        <button
          className="btn-icon"
          type="button"
          style={{ fontSize: 11, color: "var(--teal)", marginTop: "var(--space-2)" }}
        >
          <Plus size={12} /> Add dependency
        </button>
      </div>
    </div>
  );

  const renderPerspectivesTab = () => (
    <div className="side-panel-content">
      {MOCK_LENSES.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon"><Eye size={32} /></div>
          <div className="empty-state-title">No agent lenses active yet</div>
          <div className="empty-state-subtitle">
            <a href="/lenses">Configure lenses</a> to get AI-powered perspectives on your roadmap items.
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
          {MOCK_LENSES.map((lens) => {
            const IconComp = LENS_ICONS[lens.icon] || Eye;
            return (
              <div
                key={lens.id}
                style={{
                  border: "1px solid var(--border-default)",
                  borderRadius: 8,
                  padding: "var(--space-3)",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "var(--space-2)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
                    <IconComp size={16} style={{ color: "var(--text-secondary)" }} />
                    <span style={{ fontWeight: 700, fontSize: 13 }}>{lens.name}</span>
                  </div>
                  <span className={`badge ${lens.badgeClass}`}>{lens.score}</span>
                </div>
                <p style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: "18px", margin: 0 }}>
                  {lens.narrative}
                </p>
                <span className="text-muted" style={{ fontSize: 11, display: "block", marginTop: "var(--space-2)" }}>
                  Last updated: {lens.updated}
                </span>
              </div>
            );
          })}
          <button className="btn btn-ghost btn-full" type="button">
            <Plus size={14} />
            Add context
          </button>
        </div>
      )}
    </div>
  );

  const renderDependenciesTab = () => (
    <div className="side-panel-content">
      {/* Mini-map visualization */}
      <div className="dep-minimap">
        {dependencies.length === 0 ? (
          <span className="text-muted" style={{ fontSize: 12 }}>No dependencies to visualize</span>
        ) : (
          <>
            {dependencies
              .filter((d) => d.type === "blocked-by")
              .map((dep) => (
                <React.Fragment key={dep.id}>
                  <div className="dep-minimap-card">{dep.cardName}</div>
                  <ArrowRight size={16} className="dep-minimap-arrow" />
                </React.Fragment>
              ))}
            <div className="dep-minimap-card current">{card.name}</div>
            {dependencies
              .filter((d) => d.type === "blocks")
              .map((dep) => (
                <React.Fragment key={dep.id}>
                  <ArrowRight size={16} className="dep-minimap-arrow" />
                  <div className="dep-minimap-card">{dep.cardName}</div>
                </React.Fragment>
              ))}
          </>
        )}
      </div>

      {/* List view */}
      <div style={{ marginTop: "var(--space-4)", display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
        <span className="small-label">All Dependencies</span>
        {dependencies.length === 0 ? (
          <span className="text-muted" style={{ fontSize: 12 }}>None</span>
        ) : (
          dependencies.map((dep) => (
            <div
              key={dep.id}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "var(--space-2) var(--space-3)",
                border: "1px solid var(--border-default)",
                borderRadius: 6,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
                <span style={{ fontWeight: 600, fontSize: 12 }}>{dep.cardName}</span>
                <span className="badge badge-blue" style={{ fontSize: 9 }}>{TYPE_LABELS[dep.type]}</span>
                <span className="badge badge-gray" style={{ fontSize: 9 }}>{dep.status}</span>
              </div>
              <button
                className="btn-icon"
                type="button"
                onClick={() => handleRemoveDependency(dep.id)}
                style={{ color: "var(--red)" }}
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))
        )}
        <button className="btn btn-ghost btn-full" type="button" style={{ marginTop: "var(--space-2)" }}>
          <Plus size={14} />
          Add dependency
        </button>
      </div>
    </div>
  );

  const renderActivityTab = () => (
    <div className="side-panel-content">
      <div className="activity-list">
        {activities.map((act) =>
          act.type === "system" ? (
            <div key={act.id} className="activity-system">
              {act.text} &middot; {act.time}
            </div>
          ) : (
            <div key={act.id} className="activity-item">
              <div className="avatar" style={{ background: "var(--teal)" }}>
                {act.initials}
              </div>
              <div className="activity-content">
                <div style={{ display: "flex", alignItems: "baseline", gap: "var(--space-2)" }}>
                  <span className="activity-author">{act.author}</span>
                  <span className="activity-time">{act.time}</span>
                </div>
                <div className="activity-text">{act.text}</div>
              </div>
            </div>
          )
        )}
      </div>

      <div className="comment-input-row">
        <input
          className="input"
          placeholder="Add a comment..."
          value={commentText}
          onChange={(e) => setCommentText(e.target.value)}
          onKeyDown={handleCommentKeyDown}
        />
        <button
          className="btn btn-primary"
          type="button"
          onClick={handlePostComment}
          disabled={!commentText.trim()}
        >
          Post
        </button>
      </div>
    </div>
  );

  const TABS = [
    { key: "details", label: "Details" },
    { key: "perspectives", label: "Perspectives" },
    { key: "dependencies", label: "Dependencies" },
    { key: "activity", label: "Activity" },
  ];

  const TAB_RENDERERS = {
    details: renderDetailsTab,
    perspectives: renderPerspectivesTab,
    dependencies: renderDependenciesTab,
    activity: renderActivityTab,
  };

  return (
    <div className="side-panel-overlay">
      {/* Header */}
      <div className="side-panel-header">
        <button className="btn-icon side-panel-close" onClick={onClose} type="button">
          <X size={16} />
        </button>

        {/* Editable card name */}
        {editingName ? (
          <input
            ref={nameInputRef}
            className="inline-input"
            style={{ fontSize: 18, fontWeight: 700 }}
            value={nameValue}
            onChange={(e) => setNameValue(e.target.value)}
            onBlur={commitName}
            onKeyDown={handleNameKeyDown}
          />
        ) : (
          <span
            style={{ fontSize: 18, fontWeight: 700, cursor: "pointer", paddingRight: 28 }}
            onClick={() => setEditingName(true)}
            title="Click to edit"
          >
            {nameValue}
          </span>
        )}

        {/* Description */}
        <textarea
          className="input"
          placeholder="Add a description..."
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onBlur={() => onUpdate({ ...card, description })}
          style={{ minHeight: 60, marginTop: "var(--space-2)" }}
        />

        {/* Status dropdown */}
        <div style={{ marginTop: "var(--space-2)" }}>
          <select className="input" value={status} onChange={handleStatusChange} style={{ width: 160 }}>
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Tab bar */}
      <div className="side-panel-tabs">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            className={`side-panel-tab${activeTab === tab.key ? " active" : ""}`}
            onClick={() => setActiveTab(tab.key)}
            type="button"
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {TAB_RENDERERS[activeTab]()}
    </div>
  );
}
