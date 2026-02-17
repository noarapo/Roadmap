import React, { useState, useCallback, useRef, useEffect, useMemo } from "react";
import {
  ArrowLeft, X, Plus, Trash2, Settings, ChevronDown, ChevronRight,
  GripVertical, Link, Calendar, Hash, Type, CheckSquare,
  List, Users, Tag,
} from "lucide-react";
import NumberStepper from "./NumberStepper";
import {
  getWorkspaceSettings, updateWorkspaceSettings,
  getCustomFields, createCustomField, deleteCustomField,
  getCardTeams, setCardTeams as apiSetCardTeams, setCardCustomFields,
  getAllTeams,
} from "../services/api";

/* ------------------------------------------------------------------ */
/*  SidePanel — Redesigned card detail drawer                          */
/* ------------------------------------------------------------------ */

const FIELD_TYPE_ICONS = {
  text: Type, number: Hash, date: Calendar, date_range: Calendar, select: List,
  multi_select: List, checkbox: CheckSquare, url: Link,
};

const DEFAULT_STATUSES = ["Placeholder", "Planned", "In Progress", "Done"];
const DEFAULT_STATUS_COLORS = {
  Placeholder: "#9CA3AF", Planned: "#3B82F6", "In Progress": "#F59E0B", Done: "#22C55E",
};

export default function SidePanel({ card, onClose, onUpdate, onDelete }) {
  /* --- Core state --- */
  const [editingName, setEditingName] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [nameValue, setNameValue] = useState(card.name);
  const [description, setDescription] = useState(card.description || "");
  const [editingDesc, setEditingDesc] = useState(false);
  const [status, setStatus] = useState(card.status || "Placeholder");
  const [tags, setTags] = useState(card.tags || []);
  const [addingTag, setAddingTag] = useState(false);
  const [newTagValue, setNewTagValue] = useState("");

  /* --- Teams with effort --- */
  const [cardTeams, setCardTeams] = useState([]); // [{team_id, team_name, team_color, effort}]
  const [allTeams, setAllTeams] = useState([]);
  const [showTeamPicker, setShowTeamPicker] = useState(false);

  /* --- Custom fields --- */
  const [customFieldDefs, setCustomFieldDefs] = useState([]);
  const [customFieldValues, setCustomFieldValues] = useState({}); // {field_id: value}

  /* --- Workspace settings --- */
  const [settings, setSettings] = useState(null);
  const [statuses, setStatuses] = useState(DEFAULT_STATUSES);
  const [statusColors, setStatusColors] = useState(DEFAULT_STATUS_COLORS);
  const effortUnit = "Story Points";

  /* --- Config panel --- */
  const [showConfig, setShowConfig] = useState(false);
  const [hiddenFields, setHiddenFields] = useState([]);
  const [fieldOrder, setFieldOrder] = useState(null);

  /* --- Resize --- */
  const [panelWidth, setPanelWidth] = useState(() => {
    const saved = sessionStorage.getItem("drawerWidth");
    return saved ? parseInt(saved, 10) : 420;
  });
  const resizing = useRef(false);
  const panelRef = useRef(null);

  const nameInputRef = useRef(null);
  const tagInputRef = useRef(null);
  const descRef = useRef(null);

  /* --- New custom field --- */
  const [addingField, setAddingField] = useState(false);
  const [newFieldName, setNewFieldName] = useState("");
  const [newFieldType, setNewFieldType] = useState("text");

  const workspaceId = useMemo(() => {
    const user = JSON.parse(localStorage.getItem("user") || "{}");
    return user.workspace_id;
  }, []);

  /* ================================================================
     LOAD DATA
     ================================================================ */

  useEffect(() => {
    if (!workspaceId) return;
    // Load workspace settings
    getWorkspaceSettings(workspaceId).then((s) => {
      setSettings(s);
      try { setStatuses(JSON.parse(s.custom_statuses)); } catch { setStatuses(DEFAULT_STATUSES); }
      try { setStatusColors(JSON.parse(s.status_colors)); } catch { setStatusColors(DEFAULT_STATUS_COLORS); }
      try { setHiddenFields(JSON.parse(s.drawer_hidden_fields) || []); } catch { setHiddenFields([]); }
      try { setFieldOrder(s.drawer_field_order ? JSON.parse(s.drawer_field_order) : null); } catch { setFieldOrder(null); }
    }).catch(console.error);

    // Load teams for workspace
    getAllTeams(workspaceId).then(setAllTeams).catch(console.error);

    // Load custom field definitions
    getCustomFields(workspaceId).then(setCustomFieldDefs).catch(console.error);
  }, [workspaceId]);

  // Load card-specific data
  useEffect(() => {
    if (!card.id) return;
    getCardTeams(card.id).then(setCardTeams).catch(() => setCardTeams([]));
  }, [card.id]);

  /* Keep local state in sync when card prop changes */
  useEffect(() => {
    setNameValue(card.name);
    setDescription(card.description || "");
    setStatus(card.status || "Placeholder");
    setTags(card.tags || []);
    // Load custom field values from card
    const vals = {};
    (card.customFields || []).forEach((cf) => { vals[cf.custom_field_id] = cf.value; });
    setCustomFieldValues(vals);
  }, [card]);

  useEffect(() => {
    if (editingName && nameInputRef.current) { nameInputRef.current.focus(); nameInputRef.current.select(); }
  }, [editingName]);
  useEffect(() => {
    if (addingTag && tagInputRef.current) tagInputRef.current.focus();
  }, [addingTag]);

  /* Escape key */
  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === "Escape") {
        if (showConfig) { setShowConfig(false); return; }
        if (showDeleteConfirm) { setShowDeleteConfirm(false); return; }
        onClose();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose, showDeleteConfirm, showConfig]);

  /* ================================================================
     RESIZE HANDLER
     ================================================================ */

  const handleResizeStart = useCallback((e) => {
    e.preventDefault();
    resizing.current = true;
    const startX = e.clientX;
    const startWidth = panelWidth;

    const handleMouseMove = (e) => {
      const delta = startX - e.clientX;
      const newWidth = Math.max(320, Math.min(window.innerWidth * 0.8, startWidth + delta));
      setPanelWidth(newWidth);
    };
    const handleMouseUp = () => {
      resizing.current = false;
      sessionStorage.setItem("drawerWidth", String(panelWidth));
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  }, [panelWidth]);

  /* ================================================================
     HANDLERS
     ================================================================ */

  const commitName = useCallback(() => {
    setEditingName(false);
    const trimmed = nameValue.trim();
    if (trimmed && trimmed !== card.name) {
      onUpdate({ ...card, name: trimmed });
    } else {
      setNameValue(card.name);
    }
  }, [nameValue, card, onUpdate]);

  const handleStatusChange = useCallback((val) => {
    setStatus(val);
    onUpdate({ ...card, status: val });
  }, [card, onUpdate]);

  const handleDescBlur = useCallback(() => {
    setEditingDesc(false);
    if (description !== (card.description || "")) {
      onUpdate({ ...card, description });
    }
  }, [description, card, onUpdate]);

  /* --- Tags --- */
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

  const handleRemoveTag = useCallback((t) => {
    const next = tags.filter((x) => x !== t);
    setTags(next);
    onUpdate({ ...card, tags: next });
  }, [tags, card, onUpdate]);

  /* --- Card teams --- */
  const persistTeams = useCallback((teams) => {
    setCardTeams(teams);
    if (card.id) {
      apiSetCardTeams(card.id, teams.map((t) => ({ team_id: t.team_id, effort: t.effort || 0 }))).catch(console.error);
    }
  }, [card.id]);

  /* ================================================================
     RENDER
     ================================================================ */

  // Determine visible fields
  const defaultFields = ["status", "teams", "sprint", "duration", "tags"];
  const visibleDefaultFields = defaultFields.filter((f) => !hiddenFields.includes(f));

  const availableTeams = allTeams.filter((t) => !cardTeams.some((ct) => ct.team_id === t.id));

  return (
    <div className="side-panel-overlay" ref={panelRef} style={{ "--side-panel-width": `${panelWidth}px` }}>
      {/* Resize handle */}
      <div className="side-panel-resize-handle" onMouseDown={handleResizeStart} />

      {/* Delete confirmation */}
      {showDeleteConfirm && (
        <div className="side-panel-confirm-overlay">
          <div className="side-panel-confirm-dialog">
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Delete this card?</div>
            <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 16, lineHeight: 1.5 }}>
              "{card.name}" will be permanently removed.
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
              <button className="btn btn-secondary" type="button" onClick={() => setShowDeleteConfirm(false)}>Cancel</button>
              <button className="btn" type="button" style={{ background: "var(--red)", color: "#fff", border: "none" }}
                onClick={() => { setShowDeleteConfirm(false); onDelete(card.id); }}>Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* Config panel */}
      {showConfig && (
        <div className="side-panel-config">
          <div className="side-panel-config-header">
            <span style={{ fontWeight: 600, fontSize: 13 }}>Drawer Setup</span>
            <button className="btn-icon" type="button" onClick={() => setShowConfig(false)}><X size={14} /></button>
          </div>
          <div className="side-panel-config-body">
            {/* Field visibility */}
            <div className="config-section">
              <span className="config-label">Visible fields</span>
              {defaultFields.map((f) => (
                <label key={f} className="config-toggle">
                  <input type="checkbox" checked={!hiddenFields.includes(f)}
                    onChange={(e) => {
                      const next = e.target.checked ? hiddenFields.filter((h) => h !== f) : [...hiddenFields, f];
                      setHiddenFields(next);
                      if (workspaceId) updateWorkspaceSettings(workspaceId, { drawer_hidden_fields: JSON.stringify(next) }).catch(console.error);
                    }}
                  />
                  <span style={{ textTransform: "capitalize" }}>{f}</span>
                </label>
              ))}
            </div>

            {/* Custom statuses */}
            <div className="config-section">
              <span className="config-label">Statuses</span>
              {statuses.map((s, i) => (
                <div key={i} className="config-status-row">
                  <input type="color" value={statusColors[s] || "#9CA3AF"} style={{ width: 20, height: 20, padding: 0, border: "none", cursor: "pointer" }}
                    onChange={(e) => {
                      const next = { ...statusColors, [s]: e.target.value };
                      setStatusColors(next);
                      if (workspaceId) updateWorkspaceSettings(workspaceId, { status_colors: JSON.stringify(next) }).catch(console.error);
                    }}
                  />
                  <span style={{ fontSize: 12 }}>{s}</span>
                  {statuses.length > 1 && (
                    <button className="btn-icon" type="button" style={{ marginLeft: "auto", color: "var(--text-muted)", padding: 2 }}
                      onClick={() => {
                        const next = statuses.filter((_, j) => j !== i);
                        setStatuses(next);
                        if (workspaceId) updateWorkspaceSettings(workspaceId, { custom_statuses: JSON.stringify(next) }).catch(console.error);
                      }}>
                      <X size={10} />
                    </button>
                  )}
                </div>
              ))}
              <button className="sp-add-btn" type="button" onClick={() => {
                const name = prompt("New status name:");
                if (name?.trim()) {
                  const next = [...statuses, name.trim()];
                  setStatuses(next);
                  setStatusColors((prev) => ({ ...prev, [name.trim()]: "#9CA3AF" }));
                  if (workspaceId) {
                    updateWorkspaceSettings(workspaceId, {
                      custom_statuses: JSON.stringify(next),
                      status_colors: JSON.stringify({ ...statusColors, [name.trim()]: "#9CA3AF" }),
                    }).catch(console.error);
                  }
                }
              }}>
                <Plus size={11} /> Add status
              </button>
            </div>

            {/* Custom fields */}
            <div className="config-section">
              <span className="config-label">Custom fields</span>
              {customFieldDefs.map((f) => (
                <div key={f.id} className="config-field-row">
                  <span style={{ fontSize: 12 }}>{f.name}</span>
                  <span className="config-field-type">{f.field_type}</span>
                  <button className="btn-icon" type="button" style={{ marginLeft: "auto", color: "var(--text-muted)", padding: 2 }}
                    onClick={() => {
                      deleteCustomField(f.id).then(() => {
                        setCustomFieldDefs((prev) => prev.filter((x) => x.id !== f.id));
                      }).catch(console.error);
                    }}>
                    <Trash2 size={10} />
                  </button>
                </div>
              ))}
              {addingField ? (
                <div className="config-add-field-form">
                  <input className="sp-input" placeholder="Field name" value={newFieldName}
                    onChange={(e) => setNewFieldName(e.target.value)} autoFocus />
                  <select className="sp-input" value={newFieldType} onChange={(e) => setNewFieldType(e.target.value)}>
                    <option value="text">Text</option>
                    <option value="number">Number</option>
                    <option value="date">Date</option>
                    <option value="date_range">Date Range</option>
                    <option value="select">Dropdown</option>
                    <option value="multi_select">Multi-select</option>
                    <option value="checkbox">Checkbox</option>
                    <option value="url">URL</option>
                  </select>
                  <div style={{ display: "flex", gap: 4 }}>
                    <button className="btn btn-sm" style={{ fontSize: 10, background: "var(--teal)", color: "#fff", border: "none" }} type="button"
                      onClick={() => {
                        if (!newFieldName.trim() || !workspaceId) return;
                        createCustomField({ workspace_id: workspaceId, name: newFieldName.trim(), field_type: newFieldType })
                          .then((f) => { setCustomFieldDefs((prev) => [...prev, f]); setAddingField(false); setNewFieldName(""); })
                          .catch(console.error);
                      }}>Add</button>
                    <button className="btn btn-sm" style={{ fontSize: 10 }} type="button" onClick={() => { setAddingField(false); setNewFieldName(""); }}>Cancel</button>
                  </div>
                </div>
              ) : (
                <button className="sp-add-btn" type="button" onClick={() => setAddingField(true)}>
                  <Plus size={11} /> Add custom field
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ---- Header ---- */}
      <div className="sp-header">
        <div className="sp-header-row">
          <button className="btn-icon" type="button" onClick={onClose}><ArrowLeft size={16} /></button>
          <div style={{ flex: 1 }} />
          <button className="btn-icon" type="button" onClick={() => setShowConfig(!showConfig)} title="Drawer setup">
            <Settings size={14} />
          </button>
          {onDelete && (
            <button className="btn-icon" type="button" onClick={() => setShowDeleteConfirm(true)} title="Delete card" style={{ color: "var(--text-muted)" }}>
              <Trash2 size={14} />
            </button>
          )}
        </div>

        {/* Card name */}
        {editingName ? (
          <input
            ref={nameInputRef}
            className="sp-name-input"
            value={nameValue}
            onChange={(e) => setNameValue(e.target.value)}
            onBlur={commitName}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitName();
              if (e.key === "Escape") { setNameValue(card.name); setEditingName(false); }
            }}
          />
        ) : (
          <h2 className="sp-name" onClick={() => setEditingName(true)} title="Click to edit">
            {nameValue}
          </h2>
        )}

        {/* Description */}
        {editingDesc || description ? (
          <textarea
            ref={descRef}
            className="sp-description"
            placeholder="Add a description..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            onFocus={() => setEditingDesc(true)}
            onBlur={handleDescBlur}
            rows={editingDesc ? 3 : 1}
          />
        ) : (
          <div className="sp-description-placeholder" onClick={() => { setEditingDesc(true); setTimeout(() => descRef.current?.focus(), 50); }}>
            Add a description...
          </div>
        )}
      </div>

      {/* ---- Fields ---- */}
      <div className="sp-fields">
        {/* Status */}
        {visibleDefaultFields.includes("status") && (
          <div className="sp-field">
            <span className="sp-field-label">Status</span>
            <div className="sp-field-value">
              <div className="sp-status-select">
                <span className="sp-status-dot" style={{ background: statusColors[status] || "#9CA3AF" }} />
                <select className="sp-select" value={status} onChange={(e) => handleStatusChange(e.target.value)}>
                  {statuses.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>
          </div>
        )}

        {/* Teams with per-team effort */}
        {visibleDefaultFields.includes("teams") && (
          <div className="sp-field sp-field-block">
            <div className="sp-field-header">
              <Users size={12} style={{ color: "var(--text-muted)" }} />
              <span className="sp-field-label" style={{ marginBottom: 0 }}>Teams</span>
            </div>
            <div className="sp-teams">
              {cardTeams.map((ct, i) => (
                <div key={ct.team_id} className="sp-team-row">
                  <span className="sp-team-color" style={{ background: ct.team_color || "var(--teal)" }} />
                  <span className="sp-team-name">{ct.team_name}</span>
                  <div className="sp-team-effort">
                    <input
                      type="number" min="0" step="0.25" className="sp-input sp-input-sm"
                      value={ct.effort || 0}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value) || 0;
                        const next = cardTeams.map((t, j) => j === i ? { ...t, effort: val } : t);
                        setCardTeams(next);
                      }}
                      onBlur={() => persistTeams(cardTeams)}
                    />
                    <span className="sp-unit">{effortUnit === "Story Points" ? "sp" : effortUnit.toLowerCase()}</span>
                  </div>
                  <button className="btn-icon" type="button" style={{ padding: 2, color: "var(--text-muted)" }}
                    onClick={() => {
                      const next = cardTeams.filter((_, j) => j !== i);
                      persistTeams(next);
                    }}>
                    <X size={11} />
                  </button>
                </div>
              ))}
              <div style={{ position: "relative" }}>
                <button className="sp-add-btn" type="button" onClick={() => setShowTeamPicker(!showTeamPicker)}>
                  <Plus size={11} /> Add team
                </button>
                {showTeamPicker && availableTeams.length > 0 && (
                  <div className="sp-dropdown">
                    {availableTeams.map((t) => (
                      <button key={t.id} className="sp-dropdown-item" type="button" onClick={() => {
                        const next = [...cardTeams, { team_id: t.id, team_name: t.name, team_color: t.color, effort: 0 }];
                        persistTeams(next);
                        setShowTeamPicker(false);
                      }}>
                        <span className="sp-team-color" style={{ background: t.color || "var(--teal)" }} />
                        {t.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Sprint (read-only) */}
        {visibleDefaultFields.includes("sprint") && (
          <div className="sp-field">
            <span className="sp-field-label">Sprint</span>
            <div className="sp-field-value">
              <span className="sp-readonly">{card.sprintLabel || "—"}</span>
            </div>
          </div>
        )}

        {/* Duration (read-only) */}
        {visibleDefaultFields.includes("duration") && (
          <div className="sp-field">
            <span className="sp-field-label">Duration</span>
            <div className="sp-field-value">
              <span className="sp-readonly">
                {card.computedSpan || card.duration || 1} sprint{(card.computedSpan || card.duration || 1) !== 1 ? "s" : ""}
              </span>
            </div>
          </div>
        )}

        {/* Tags */}
        {visibleDefaultFields.includes("tags") && (
          <div className="sp-field sp-field-block">
            <div className="sp-field-header">
              <Tag size={12} style={{ color: "var(--text-muted)" }} />
              <span className="sp-field-label" style={{ marginBottom: 0 }}>Tags</span>
            </div>
            <div className="sp-tags">
              {tags.map((t) => (
                <span key={t} className="sp-tag" onClick={() => handleRemoveTag(t)} title="Click to remove">{t} <X size={9} /></span>
              ))}
              {addingTag ? (
                <input
                  ref={tagInputRef}
                  className="sp-input sp-input-sm sp-tag-input"
                  value={newTagValue}
                  onChange={(e) => setNewTagValue(e.target.value)}
                  onBlur={handleAddTag}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleAddTag();
                    if (e.key === "Escape") { setAddingTag(false); setNewTagValue(""); }
                  }}
                  placeholder="Tag name"
                />
              ) : (
                <button className="sp-add-btn sp-add-btn-inline" type="button" onClick={handleAddTag}>
                  <Plus size={10} />
                </button>
              )}
            </div>
          </div>
        )}

        {/* Divider before custom fields */}
        {customFieldDefs.length > 0 && <div className="sp-divider" />}

        {/* Custom fields */}
        {customFieldDefs.map((field) => {
          const val = customFieldValues[field.id] ?? "";
          const opts = field.options ? (typeof field.options === "string" ? JSON.parse(field.options) : field.options) : [];
          const Icon = FIELD_TYPE_ICONS[field.field_type] || Type;

          return (
            <div key={field.id} className="sp-field">
              <span className="sp-field-label"><Icon size={10} style={{ marginRight: 4, opacity: 0.5 }} />{field.name}</span>
              <div className="sp-field-value">
                {field.field_type === "text" && (
                  <input className="sp-input" value={val} onChange={(e) => setCustomFieldValues((p) => ({ ...p, [field.id]: e.target.value }))}
                    onBlur={() => saveCustomFields({ ...customFieldValues, [field.id]: val })} />
                )}
                {field.field_type === "number" && (
                  <input className="sp-input" type="number" value={val} onChange={(e) => setCustomFieldValues((p) => ({ ...p, [field.id]: e.target.value }))}
                    onBlur={() => saveCustomFields({ ...customFieldValues, [field.id]: val })} />
                )}
                {field.field_type === "date" && (
                  <input className="sp-input" type="date" value={val} onChange={(e) => {
                    const v = e.target.value;
                    setCustomFieldValues((p) => ({ ...p, [field.id]: v }));
                    saveCustomFields({ ...customFieldValues, [field.id]: v });
                  }} />
                )}
                {field.field_type === "date_range" && (() => {
                  const parts = (val || "").split(",");
                  const startVal = parts[0] || "";
                  const endVal = parts[1] || "";
                  return (
                    <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                      <input className="sp-input" type="date" value={startVal} style={{ flex: 1 }}
                        onChange={(e) => {
                          const v = `${e.target.value},${endVal}`;
                          setCustomFieldValues((p) => ({ ...p, [field.id]: v }));
                          saveCustomFields({ ...customFieldValues, [field.id]: v });
                        }} />
                      <span style={{ fontSize: 10, color: "var(--text-muted)" }}>to</span>
                      <input className="sp-input" type="date" value={endVal} style={{ flex: 1 }}
                        onChange={(e) => {
                          const v = `${startVal},${e.target.value}`;
                          setCustomFieldValues((p) => ({ ...p, [field.id]: v }));
                          saveCustomFields({ ...customFieldValues, [field.id]: v });
                        }} />
                    </div>
                  );
                })()}
                {field.field_type === "select" && (
                  <select className="sp-select" value={val} onChange={(e) => {
                    const v = e.target.value;
                    setCustomFieldValues((p) => ({ ...p, [field.id]: v }));
                    saveCustomFields({ ...customFieldValues, [field.id]: v });
                  }}>
                    <option value="">—</option>
                    {opts.map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                )}
                {field.field_type === "checkbox" && (
                  <input type="checkbox" checked={val === "true"} onChange={(e) => {
                    const v = String(e.target.checked);
                    setCustomFieldValues((p) => ({ ...p, [field.id]: v }));
                    saveCustomFields({ ...customFieldValues, [field.id]: v });
                  }} />
                )}
                {field.field_type === "url" && (
                  <input className="sp-input" type="url" placeholder="https://..." value={val}
                    onChange={(e) => setCustomFieldValues((p) => ({ ...p, [field.id]: e.target.value }))}
                    onBlur={() => saveCustomFields({ ...customFieldValues, [field.id]: val })} />
                )}
                {field.field_type === "multi_select" && (
                  <div className="sp-multi-select">
                    {opts.map((o) => {
                      const selected = (val || "").split(",").filter(Boolean);
                      const isSelected = selected.includes(o);
                      return (
                        <button key={o} type="button" className={`sp-chip${isSelected ? " active" : ""}`}
                          onClick={() => {
                            const next = isSelected ? selected.filter((x) => x !== o) : [...selected, o];
                            const v = next.join(",");
                            setCustomFieldValues((p) => ({ ...p, [field.id]: v }));
                            saveCustomFields({ ...customFieldValues, [field.id]: v });
                          }}>
                          {o}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  function saveCustomFields(vals) {
    if (!card.id) return;
    const fields = Object.entries(vals).filter(([_, v]) => v !== "" && v !== undefined).map(([id, value]) => ({ custom_field_id: id, value: String(value) }));
    setCardCustomFields(card.id, fields).catch(console.error);
  }
}
