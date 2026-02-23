import React, { useState, useCallback, useRef, useEffect, useMemo } from "react";
import {
  X, Plus, Trash2, Settings,
  GripVertical, Link, Calendar, Hash, Type, CheckSquare,
  List, Users, Tag, RefreshCw, Loader2, Search, ExternalLink, Eye, EyeOff,
  GitBranch, Circle, CheckCircle2, Clock,
} from "lucide-react";
import {
  getWorkspaceSettings, updateWorkspaceSettings,
  getCustomFields, createCustomField, deleteCustomField,
  getCardTeams, setCardTeams as apiSetCardTeams, setCardCustomFields,
  getAllTeams, createTeamDirect,
  getCard, getCardHubSpotData, getIntegrations, enrichSingleCard,
  listHubSpotRecords, addHubSpotCardLink, removeHubSpotCardLink,
  getCardLinearIssues, getLinearTeams, pushCardToLinear,
} from "../services/api";

/* ------------------------------------------------------------------ */
/*  SidePanel — Card detail drawer                                      */
/* ------------------------------------------------------------------ */

// Module-level caches — survive drawer close/reopen (5 min TTL)
let _hubspotRecordsCache = null;
let _hubspotIntegrationCache = null;
let _hubspotCacheTime = 0;
let _linearIntegrationCache = null;
let _linearTeamsCache = null;
let _linearCacheTime = 0;
const CACHE_TTL = 5 * 60 * 1000;

const FIELD_TYPE_ICONS = {
  text: Type, number: Hash, date: Calendar, date_range: Calendar, select: List,
  multi_select: List, checkbox: CheckSquare, url: Link,
};

const FIELD_TYPES = [
  { value: "text", label: "Text", icon: Type },
  { value: "number", label: "Number", icon: Hash },
  { value: "date", label: "Date", icon: Calendar },
  { value: "date_range", label: "Date Range", icon: Calendar },
  { value: "select", label: "Dropdown", icon: List },
  { value: "multi_select", label: "Multi-select", icon: CheckSquare },
  { value: "checkbox", label: "Checkbox", icon: CheckSquare },
  { value: "url", label: "URL", icon: Link },
];

const STATUS_PRESET_COLORS = [
  "#9CA3AF", "#3B82F6", "#F59E0B", "#22C55E", "#EF4444",
  "#8B5CF6", "#EC4899", "#14B8A6", "#F97316", "#6366F1",
];

const DEFAULT_STATUSES = ["Placeholder", "Planned", "In Progress", "Done"];
const DEFAULT_STATUS_COLORS = {
  Placeholder: "#9CA3AF", Planned: "#3B82F6", "In Progress": "#F59E0B", Done: "#22C55E",
};

const SOURCE_LABELS = { hubspot: "HubSpot", notion: "Notion", linear: "Linear" };
const SOURCE_COLORS = { hubspot: "#FF7A59", notion: "#000000", linear: "#5E6AD2" };

const BUILTIN_FIELDS = [
  { id: "status", label: "Status" },
  { id: "teams", label: "Teams" },
  { id: "sprint", label: "Sprint" },
  { id: "duration", label: "Duration" },
  { id: "tags", label: "Tags" },
];

function NumberFieldInput({ value, onChange, onBlur }) {
  const [focused, setFocused] = useState(false);
  const display = !focused && value !== "" && !isNaN(Number(value))
    ? Number(value).toLocaleString()
    : value;
  return (
    <input className="sp-input" type="text" inputMode="decimal" value={display}
      onFocus={() => setFocused(true)}
      onChange={(e) => onChange(e.target.value.replace(/,/g, ""))}
      onBlur={(e) => { setFocused(false); onBlur(e.target.value.replace(/,/g, "")); }} />
  );
}

export default function SidePanel({ card, onClose, onUpdate, onDelete, initialShowConfig }) {
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
  const [cardTeams, setCardTeams] = useState([]);
  const [allTeams, setAllTeams] = useState([]);
  const [showTeamPicker, setShowTeamPicker] = useState(false);
  const [creatingTeam, setCreatingTeam] = useState(false);
  const [newTeamName, setNewTeamName] = useState("");
  const [newTeamColor, setNewTeamColor] = useState("#2D6A5E");

  /* --- Custom fields --- */
  const [customFieldDefs, setCustomFieldDefs] = useState([]);
  const [customFieldValues, setCustomFieldValues] = useState({});

  /* --- Workspace settings --- */
  const [settings, setSettings] = useState(null);
  const [statuses, setStatuses] = useState(DEFAULT_STATUSES);
  const [statusColors, setStatusColors] = useState(DEFAULT_STATUS_COLORS);
  const effortUnit = "Story Points";

  /* --- Config panel --- */
  const [showConfig, setShowConfig] = useState(!!initialShowConfig);
  const [hiddenFields, setHiddenFields] = useState([]);
  const [fieldOrder, setFieldOrder] = useState(null);
  const [colorPickerStatus, setColorPickerStatus] = useState(null);
  const [dragIdx, setDragIdx] = useState(null);
  const [dragOverIdx, setDragOverIdx] = useState(null);

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

  /* --- HubSpot --- */
  const [hubspotLinks, setHubspotLinks] = useState([]);
  const [hubspotIntegration, setHubspotIntegration] = useState(null);
  const [hubspotEnriching, setHubspotEnriching] = useState(false);
  const [hubspotSearchQuery, setHubspotSearchQuery] = useState("");
  const [showHubspotSearch, setShowHubspotSearch] = useState(false);
  const [hubspotSearchObjectType, setHubspotSearchObjectType] = useState("companies");
  const [hubspotAllRecords, setHubspotAllRecords] = useState([]);
  const [hubspotRecordsLoading, setHubspotRecordsLoading] = useState(false);

  /* --- Linear --- */
  const [linearIssues, setLinearIssues] = useState([]);
  const [linearLinks, setLinearLinks] = useState([]);
  const [linearLoading, setLinearLoading] = useState(false);
  const [linearIntegration, setLinearIntegration] = useState(null);
  const [linearTeams, setLinearTeams] = useState([]);
  const [linearPushTeamId, setLinearPushTeamId] = useState("");
  const [linearPushing, setLinearPushing] = useState(false);

  /* --- Drawer tab --- */
  const [activeTab, setActiveTab] = useState("details");

  const workspaceId = useMemo(() => {
    const user = JSON.parse(localStorage.getItem("user") || "{}");
    return user.workspace_id;
  }, []);

  /* ================================================================
     LOAD DATA
     ================================================================ */

  useEffect(() => {
    if (!workspaceId) return;
    getWorkspaceSettings(workspaceId).then((s) => {
      setSettings(s);
      try { setStatuses(JSON.parse(s.custom_statuses)); } catch { setStatuses(DEFAULT_STATUSES); }
      try { setStatusColors(JSON.parse(s.status_colors)); } catch { setStatusColors(DEFAULT_STATUS_COLORS); }
      try { setHiddenFields(JSON.parse(s.drawer_hidden_fields) || []); } catch { setHiddenFields([]); }
      try { setFieldOrder(s.drawer_field_order ? JSON.parse(s.drawer_field_order) : null); } catch { setFieldOrder(null); }
    }).catch(console.error);
    getAllTeams(workspaceId).then(setAllTeams).catch(console.error);
    getCustomFields(workspaceId).then(setCustomFieldDefs).catch(console.error);
  }, [workspaceId]);

  // Load card-specific data
  useEffect(() => {
    if (!card.id) return;
    getCardTeams(card.id).then(setCardTeams).catch(() => setCardTeams([]));
    getCardHubSpotData(card.id).then((data) => setHubspotLinks(data.links || [])).catch(() => setHubspotLinks([]));
    getCardLinearIssues(card.id).then((data) => {
      setLinearIssues(data.issues || []);
      setLinearLinks(data.links || []);
    }).catch(() => { setLinearIssues([]); setLinearLinks([]); });
    getCard(card.id).then((fullCard) => {
      const cfList = fullCard?.customFields || fullCard?.custom_fields || [];
      if (cfList.length > 0) {
        const vals = {};
        cfList.forEach((cf) => { vals[cf.custom_field_id] = cf.value; });
        setCustomFieldValues((prev) => ({ ...prev, ...vals }));
      }
    }).catch(() => {});
  }, [card.id]);

  // Load integrations + preload records/teams (cached across drawer opens, 5 min TTL)
  useEffect(() => {
    const hsCacheValid = _hubspotCacheTime && (Date.now() - _hubspotCacheTime < CACHE_TTL);
    const linCacheValid = _linearCacheTime && (Date.now() - _linearCacheTime < CACHE_TTL);

    // Restore Linear from cache immediately
    if (_linearIntegrationCache && linCacheValid) {
      setLinearIntegration(_linearIntegrationCache);
      if (_linearTeamsCache) setLinearTeams(_linearTeamsCache);
    }

    // Restore HubSpot from cache immediately
    if (_hubspotIntegrationCache && hsCacheValid) {
      setHubspotIntegration(_hubspotIntegrationCache);
      if (_hubspotRecordsCache) setHubspotAllRecords(_hubspotRecordsCache);
    }

    // If both caches are fully valid, skip the API call
    if (hsCacheValid && _hubspotRecordsCache && linCacheValid && _linearTeamsCache) return;

    getIntegrations().then((data) => {
      const all = Array.isArray(data) ? data : [];

      // HubSpot
      const hs = all.find((i) => i.type === "hubspot" && i.status === "active");
      setHubspotIntegration(hs || null);
      _hubspotIntegrationCache = hs || null;
      if (hs && (!_hubspotRecordsCache || !hsCacheValid)) {
        setHubspotRecordsLoading(true);
        const types = ["companies", "deals", "contacts", "tickets"];
        Promise.all(
          types.map((ot) =>
            listHubSpotRecords(hs.id, ot, 200)
              .then((d) => (d?.records || []).map((r) => ({ ...r, _objectType: ot })))
              .catch(() => [])
          )
        ).then((arrays) => {
          const recs = arrays.flat();
          setHubspotAllRecords(recs);
          _hubspotRecordsCache = recs;
          _hubspotCacheTime = Date.now();
        }).finally(() => setHubspotRecordsLoading(false));
      }

      // Linear
      const lin = all.find((i) => i.type === "linear" && i.status === "active");
      setLinearIntegration(lin || null);
      _linearIntegrationCache = lin || null;
      if (lin && (!_linearTeamsCache || !linCacheValid)) {
        getLinearTeams(lin.id).then((data) => {
          const teams = data?.linear_teams || [];
          setLinearTeams(teams);
          _linearTeamsCache = teams;
          _linearCacheTime = Date.now();
        }).catch(() => setLinearTeams([]));
      }
    }).catch(() => { setHubspotIntegration(null); setLinearIntegration(null); });
  }, []);

  // Enrich card and reload custom field values
  async function reloadCardFields(integrationId) {
    if (!integrationId || !card.id) return;
    setHubspotEnriching(true);
    try { await enrichSingleCard(integrationId, card.id); } catch (e) { console.warn("[HS] enrich err:", e); }
    try {
      const c = await getCard(card.id);
      const cfList = c?.customFields || c?.custom_fields || [];
      const vals = {};
      cfList.forEach((cf) => { vals[cf.custom_field_id] = cf.value; });
      setCustomFieldValues((prev) => ({ ...prev, ...vals }));
    } catch (e) { console.warn("[HS] reload err:", e); }
    setHubspotEnriching(false);
  }

  /* Keep local state in sync when card prop changes */
  useEffect(() => {
    setNameValue(card.name);
    setDescription(card.description || "");
    setStatus(card.status || "Placeholder");
    setTags(card.tags || []);
    setActiveTab("details");
    const cfList = card.customFields || card.custom_fields || [];
    if (cfList.length > 0) {
      const vals = {};
      cfList.forEach((cf) => { vals[cf.custom_field_id] = cf.value; });
      setCustomFieldValues((prev) => ({ ...prev, ...vals }));
    }
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
     CONFIG PANEL HELPERS
     ================================================================ */

  const allFieldsForConfig = useMemo(() => {
    const builtins = BUILTIN_FIELDS.map((f) => ({ ...f, type: "builtin" }));
    const customs = customFieldDefs.map((f) => ({ id: f.id, label: f.name, type: "custom", def: f }));
    const all = [...builtins, ...customs];
    if (fieldOrder && fieldOrder.length > 0) {
      const sorted = [];
      fieldOrder.forEach((id) => { const f = all.find((v) => v.id === id); if (f) sorted.push(f); });
      all.forEach((f) => { if (!sorted.find((s) => s.id === f.id)) sorted.push(f); });
      return sorted;
    }
    return all;
  }, [customFieldDefs, fieldOrder]);

  const handleDragDrop = useCallback((fromIdx, toIdx) => {
    if (fromIdx === null || toIdx === null || fromIdx === toIdx) return;
    const order = allFieldsForConfig.map((f) => f.id);
    const [moved] = order.splice(fromIdx, 1);
    order.splice(toIdx, 0, moved);
    setFieldOrder(order);
    if (workspaceId) updateWorkspaceSettings(workspaceId, { drawer_field_order: JSON.stringify(order) }).catch(console.error);
  }, [allFieldsForConfig, workspaceId]);

  const toggleFieldVisibility = useCallback((fieldId) => {
    const next = hiddenFields.includes(fieldId)
      ? hiddenFields.filter((h) => h !== fieldId)
      : [...hiddenFields, fieldId];
    setHiddenFields(next);
    if (workspaceId) updateWorkspaceSettings(workspaceId, { drawer_hidden_fields: JSON.stringify(next) }).catch(console.error);
  }, [hiddenFields, workspaceId]);

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
      apiSetCardTeams(card.id, teams.map((t) => ({ team_id: t.team_id, effort: t.effort || 0 })))
        .then(() => { window.dispatchEvent(new CustomEvent("roadway-capacity-changed")); })
        .catch(console.error);
    }
  }, [card.id]);

  /* ================================================================
     RENDER
     ================================================================ */

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

      {/* ---- Customize panel (new UI) ---- */}
      {showConfig && (
        <div className="side-panel-config">
          <div className="side-panel-config-header">
            <span style={{ fontWeight: 600, fontSize: 14 }}>Customize</span>
            <button className="btn-icon" type="button" onClick={() => { setShowConfig(false); setColorPickerStatus(null); }}>
              <X size={14} />
            </button>
          </div>
          <div className="side-panel-config-body">

            {/* Unified field order + visibility */}
            <div className="config-section">
              <span className="config-label">Fields</span>
              <p className="config-hint">Reorder and toggle visibility. Changes apply to all cards.</p>
              {allFieldsForConfig.map((field, i) => {
                const isHidden = hiddenFields.includes(field.id);
                const isCustom = field.type === "custom";
                const fieldDef = field.def;
                const isEnriched = isCustom && fieldDef?.source && fieldDef.source !== "manual";
                const isDragging = dragIdx === i;
                const isDragOver = dragOverIdx === i;
                return (
                  <div key={field.id}
                    className={`config-reorder-row${isHidden ? " config-row-hidden" : ""}${isDragging ? " config-row-dragging" : ""}${isDragOver ? " config-row-dragover" : ""}`}
                    draggable
                    onDragStart={() => setDragIdx(i)}
                    onDragOver={(e) => { e.preventDefault(); setDragOverIdx(i); }}
                    onDragLeave={() => { if (dragOverIdx === i) setDragOverIdx(null); }}
                    onDrop={(e) => { e.preventDefault(); handleDragDrop(dragIdx, i); setDragIdx(null); setDragOverIdx(null); }}
                    onDragEnd={() => { setDragIdx(null); setDragOverIdx(null); }}
                  >
                    <div className="config-drag-handle" title="Drag to reorder">
                      <GripVertical size={14} />
                    </div>
                    <span className="config-reorder-name">
                      {field.label}
                      {isEnriched && (
                        <span className="config-field-source" style={{ color: SOURCE_COLORS[fieldDef.source] }}>
                          {SOURCE_LABELS[fieldDef.source]}
                        </span>
                      )}
                    </span>
                    {isCustom && (
                      <span className="config-field-type-badge">
                        {FIELD_TYPES.find((ft) => ft.value === fieldDef?.field_type)?.label || fieldDef?.field_type}
                      </span>
                    )}
                    <button type="button" className="config-vis-btn" onClick={() => toggleFieldVisibility(field.id)}
                      title={isHidden ? "Show field" : "Hide field"}>
                      {isHidden ? <EyeOff size={13} /> : <Eye size={13} />}
                    </button>
                    {isCustom && (
                      <button className="btn-icon" type="button" style={{ color: "var(--text-muted)", padding: 2 }}
                        onClick={() => deleteCustomField(field.id).then(() => setCustomFieldDefs((prev) => prev.filter((x) => x.id !== field.id))).catch(console.error)}>
                        <Trash2 size={11} />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Add custom field */}
            <div className="config-section">
              {addingField ? (
                <div className="config-add-field-form-v2">
                  <input className="sp-input" placeholder="Field name" value={newFieldName}
                    onChange={(e) => setNewFieldName(e.target.value)} autoFocus />
                  <div className="config-field-type-grid">
                    {FIELD_TYPES.map((ft) => {
                      const FtIcon = ft.icon;
                      return (
                        <button key={ft.value} type="button"
                          className={`config-type-tile${newFieldType === ft.value ? " active" : ""}`}
                          onClick={() => setNewFieldType(ft.value)}>
                          <FtIcon size={14} />
                          <span>{ft.label}</span>
                        </button>
                      );
                    })}
                  </div>
                  <div style={{ display: "flex", gap: 6, marginTop: 2 }}>
                    <button className="config-btn-create" type="button"
                      onClick={() => {
                        if (!newFieldName.trim() || !workspaceId) return;
                        createCustomField({ workspace_id: workspaceId, name: newFieldName.trim(), field_type: newFieldType })
                          .then((f) => { setCustomFieldDefs((prev) => [...prev, f]); setAddingField(false); setNewFieldName(""); setNewFieldType("text"); })
                          .catch(console.error);
                      }}>Create field</button>
                    <button className="config-btn-cancel" type="button"
                      onClick={() => { setAddingField(false); setNewFieldName(""); setNewFieldType("text"); }}>Cancel</button>
                  </div>
                </div>
              ) : (
                <button className="config-add-field-btn" type="button" onClick={() => setAddingField(true)}>
                  <Plus size={12} /> Add custom field
                </button>
              )}
            </div>

            {/* Statuses */}
            <div className="config-section">
              <span className="config-label">Statuses</span>
              {statuses.map((s, i) => (
                <div key={i} className="config-status-row-v2">
                  <div className="config-swatch-wrap">
                    <button className="config-swatch" type="button"
                      style={{ background: statusColors[s] || "#9CA3AF" }}
                      onClick={() => setColorPickerStatus(colorPickerStatus === s ? null : s)} />
                    {colorPickerStatus === s && (
                      <div className="config-color-palette">
                        {STATUS_PRESET_COLORS.map((c) => (
                          <button key={c} type="button"
                            className={`config-color-dot${statusColors[s] === c ? " active" : ""}`}
                            style={{ background: c }}
                            onClick={() => {
                              const next = { ...statusColors, [s]: c };
                              setStatusColors(next);
                              setColorPickerStatus(null);
                              if (workspaceId) updateWorkspaceSettings(workspaceId, { status_colors: JSON.stringify(next) }).catch(console.error);
                            }} />
                        ))}
                      </div>
                    )}
                  </div>
                  <span className="config-status-name">{s}</span>
                  {statuses.length > 1 && (
                    <button className="btn-icon" type="button" style={{ marginLeft: "auto", color: "var(--text-muted)", padding: 2 }}
                      onClick={() => {
                        const next = statuses.filter((_, j) => j !== i);
                        setStatuses(next);
                        if (workspaceId) updateWorkspaceSettings(workspaceId, { custom_statuses: JSON.stringify(next) }).catch(console.error);
                      }}><X size={10} /></button>
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
          </div>
        </div>
      )}

      {/* ---- Header ---- */}
      <div className="sp-header">
        <div className="sp-header-row">
          <button className="btn-icon" type="button" onClick={onClose}><X size={16} /></button>
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

      {/* ---- Tabs ---- */}
      {linearIntegration && (
        <div className="sp-tabs">
          <button
            type="button"
            className={`sp-tab${activeTab === "details" ? " active" : ""}`}
            onClick={() => setActiveTab("details")}
          >
            Details
          </button>
          <button
            type="button"
            className={`sp-tab${activeTab === "linear" ? " active" : ""}`}
            onClick={() => setActiveTab("linear")}
          >
            <GitBranch size={12} /> Linear
          </button>
        </div>
      )}

      {/* ---- Linear Tab ---- */}
      {activeTab === "linear" && linearIntegration && (
        <div className="sp-fields">
          {/* Card HAS Linear data — show progress + issues */}
          {(linearLinks.length > 0 || linearIssues.length > 0) ? (
            <>
              <div className="sp-field sp-field-block">
                <div className="sp-field-header" style={{ marginBottom: 4 }}>
                  <GitBranch size={12} style={{ color: "#5E6AD2" }} />
                  <span className="sp-field-label" style={{ marginBottom: 0 }}>Project Progress</span>
                  <div style={{ marginLeft: "auto", display: "flex", gap: 4 }}>
                    <button
                      className="btn-icon"
                      type="button"
                      title="Refresh Linear data"
                      disabled={linearLoading}
                      onClick={async () => {
                        setLinearLoading(true);
                        try {
                          const data = await getCardLinearIssues(card.id);
                          setLinearIssues(data.issues || []);
                          setLinearLinks(data.links || []);
                        } catch { /* ignore */ }
                        setLinearLoading(false);
                      }}
                    >
                      {linearLoading ? <Loader2 size={11} className="hs-spin" /> : <RefreshCw size={11} />}
                    </button>
                  </div>
                </div>

                {/* Progress per project */}
                {linearLinks.map((link) => {
                  let meta = {};
                  try { meta = typeof link.metadata === "string" ? JSON.parse(link.metadata) : (link.metadata || {}); } catch { meta = {}; }
                  const issues = meta.issues || {};
                  const total = (issues.todo || 0) + (issues.in_progress || 0) + (issues.done || 0);
                  const pct = meta.progress_pct || 0;

                  return (
                    <div key={link.id} className="sp-linear-progress">
                      <div className="sp-linear-project-name">
                        {link.external_entity_name || "Project"}
                        {link.external_entity_url && (
                          <a href={link.external_entity_url} target="_blank" rel="noopener noreferrer" className="btn-icon" style={{ padding: 2 }}>
                            <ExternalLink size={10} />
                          </a>
                        )}
                      </div>
                      <div className="sp-linear-bar-wrapper">
                        <div className="sp-linear-bar">
                          <div className="sp-linear-bar-fill" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="sp-linear-bar-pct">{pct}%</span>
                      </div>
                      {total > 0 && (
                        <div className="sp-linear-counts">
                          <span className="sp-linear-count done"><CheckCircle2 size={10} /> {issues.done || 0} done</span>
                          <span className="sp-linear-count in-progress"><Clock size={10} /> {issues.in_progress || 0} active</span>
                          <span className="sp-linear-count todo"><Circle size={10} /> {issues.todo || 0} todo</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Issue list */}
              {linearIssues.length > 0 && (
                <div className="sp-field sp-field-block">
                  <div className="sp-field-header" style={{ marginBottom: 4 }}>
                    <span className="sp-field-label" style={{ marginBottom: 0 }}>Issues ({linearIssues.length})</span>
                  </div>
                  <div className="sp-linear-issues">
                    {linearIssues.map((issue) => {
                      const catColor = issue.status_category === "done" ? "var(--green)"
                        : issue.status_category === "in_progress" ? "var(--blue)"
                        : issue.status_category === "cancelled" ? "var(--text-muted)"
                        : "var(--text-secondary)";
                      const CatIcon = issue.status_category === "done" ? CheckCircle2
                        : issue.status_category === "in_progress" ? Clock
                        : Circle;
                      return (
                        <div key={issue.id} className="sp-linear-issue-row">
                          <CatIcon size={12} style={{ color: catColor, flexShrink: 0, marginTop: 1 }} />
                          <div className="sp-linear-issue-info">
                            <span className="sp-linear-issue-title">{issue.title}</span>
                            <span className="sp-linear-issue-meta">
                              {issue.external_issue_identifier}
                              {issue.assignee_name && <> &middot; {issue.assignee_name}</>}
                              {issue.priority_label && <> &middot; {issue.priority_label}</>}
                            </span>
                          </div>
                          {issue.external_url && (
                            <a href={issue.external_url} target="_blank" rel="noopener noreferrer" className="btn-icon" style={{ padding: 2, flexShrink: 0 }}>
                              <ExternalLink size={10} />
                            </a>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          ) : (
            /* Card has NO Linear data — show Push to Linear */
            <div className="sp-linear-push">
              <div className="sp-linear-push-icon">
                <GitBranch size={24} />
              </div>
              <p className="sp-linear-push-title">Push to Linear</p>
              <p className="sp-linear-push-desc">Create a Linear issue from this card to track it in your engineering workflow.</p>
              {linearTeams.length > 1 && (
                <select
                  className="sp-select"
                  value={linearPushTeamId || linearTeams[0]?.id || ""}
                  onChange={(e) => setLinearPushTeamId(e.target.value)}
                  style={{ width: "100%", marginBottom: 8 }}
                >
                  {linearTeams.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              )}
              {linearTeams.length === 1 && (
                <p className="text-muted" style={{ fontSize: 11, marginBottom: 8 }}>
                  Team: {linearTeams[0].name}
                </p>
              )}
              <button
                className="btn btn-primary"
                type="button"
                disabled={linearTeams.length === 0 || linearPushing}
                style={{ width: "100%" }}
                onClick={async () => {
                  const teamId = linearPushTeamId || linearTeams[0]?.id;
                  if (!teamId) return;
                  setLinearPushing(true);
                  try {
                    const result = await pushCardToLinear(linearIntegration.id, card.id, teamId);
                    if (result?.success) {
                      const data = await getCardLinearIssues(card.id);
                      setLinearIssues(data.issues || []);
                      setLinearLinks(data.links || []);
                    }
                  } catch (err) {
                    console.error("Push to Linear failed:", err);
                  }
                  setLinearPushing(false);
                }}
              >
                {linearPushing ? <><Loader2 size={12} className="hs-spin" /> Pushing...</> : <><GitBranch size={12} /> Push to Linear</>}
              </button>
            </div>
          )}
        </div>
      )}

      {/* ---- Fields (Details tab) ---- */}
      {activeTab === "details" && <div className="sp-fields">
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
                <button className="sp-add-btn" type="button" onClick={() => { setShowTeamPicker(!showTeamPicker); setCreatingTeam(false); }}>
                  <Plus size={11} /> Add team
                </button>
                {showTeamPicker && (
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
                    {availableTeams.length > 0 && <div className="sp-divider" style={{ margin: "4px 0" }} />}
                    {!creatingTeam ? (
                      <button className="sp-dropdown-item" type="button" style={{ color: "var(--teal)", fontWeight: 600 }} onClick={() => setCreatingTeam(true)}>
                        <Plus size={11} /> Create new team
                      </button>
                    ) : (
                      <div style={{ padding: "8px 12px", display: "flex", flexDirection: "column", gap: 6 }}>
                        <input
                          className="sp-input"
                          placeholder="Team name"
                          value={newTeamName}
                          onChange={(e) => setNewTeamName(e.target.value)}
                          autoFocus
                          onKeyDown={(e) => { if (e.key === "Escape") { setCreatingTeam(false); setNewTeamName(""); } }}
                        />
                        <div style={{ display: "flex", gap: 4 }}>
                          {["#2D6A5E", "#4A7EBF", "#9B59B6", "#E67E22", "#E74C3C", "#1ABC9C"].map((c) => (
                            <button
                              key={c} type="button"
                              style={{
                                width: 18, height: 18, borderRadius: "50%", background: c, border: newTeamColor === c ? "2px solid var(--text-primary)" : "2px solid transparent",
                                cursor: "pointer", padding: 0, flexShrink: 0,
                              }}
                              onClick={() => setNewTeamColor(c)}
                            />
                          ))}
                        </div>
                        <div style={{ display: "flex", gap: 4 }}>
                          <button className="btn btn-sm" type="button" style={{ fontSize: 10, background: "var(--teal)", color: "#fff", border: "none" }}
                            onClick={() => {
                              const trimmed = newTeamName.trim();
                              if (!trimmed || !workspaceId) return;
                              createTeamDirect({ name: trimmed, color: newTeamColor, workspace_id: workspaceId })
                                .then((created) => {
                                  setAllTeams((prev) => [...prev, created]);
                                  const next = [...cardTeams, { team_id: created.id, team_name: created.name, team_color: created.color, effort: 0 }];
                                  persistTeams(next);
                                  setCreatingTeam(false);
                                  setNewTeamName("");
                                  setNewTeamColor("#2D6A5E");
                                  setShowTeamPicker(false);
                                })
                                .catch(console.error);
                            }}>Save</button>
                          <button className="btn btn-sm" type="button" style={{ fontSize: 10 }}
                            onClick={() => { setCreatingTeam(false); setNewTeamName(""); }}>Cancel</button>
                        </div>
                      </div>
                    )}
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
              <span className="sp-readonly">{card.sprintLabel || "\u2014"}</span>
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

        {/* HubSpot Data Section */}
        {hubspotIntegration && (
          <>
            <div className="sp-divider" />
            <div className="sp-field sp-field-block">
              <div className="sp-field-header">
                <ExternalLink size={12} style={{ color: "var(--text-muted)" }} />
                <span className="sp-field-label" style={{ marginBottom: 0 }}>HubSpot</span>
                <div style={{ marginLeft: "auto", display: "flex", gap: 4 }}>
                  <button
                    className="btn-icon"
                    type="button"
                    title="Refresh HubSpot data"
                    disabled={hubspotEnriching}
                    onClick={async () => {
                      setHubspotEnriching(true);
                      try {
                        await reloadCardFields(hubspotIntegration.id);
                        const data = await getCardHubSpotData(card.id);
                        setHubspotLinks(data.links || []);
                      } catch { /* ignore */ }
                      setHubspotEnriching(false);
                    }}
                  >
                    {hubspotEnriching ? <Loader2 size={11} className="hs-spin" /> : <RefreshCw size={11} />}
                  </button>
                </div>
              </div>

              {/* Linked records */}
              <div className="sp-hubspot-links">
                {hubspotLinks.length === 0 ? (
                  <p className="text-muted" style={{ fontSize: 11, margin: "4px 0" }}>
                    No HubSpot data found — try linking records manually.
                  </p>
                ) : (
                  hubspotLinks.map((link) => (
                    <div key={link.id} className="sp-hubspot-link-row">
                      <span className="sp-hubspot-link-type">{link.hubspot_object_type}</span>
                      <span className="sp-hubspot-link-name">{link.hubspot_object_name || link.hubspot_object_id}</span>
                      <span className="sp-hubspot-link-match">{link.matched_by}</span>
                      <button
                        className="btn-icon"
                        type="button"
                        style={{ padding: 2, color: "var(--text-muted)" }}
                        onClick={async () => {
                          try {
                            await removeHubSpotCardLink(card.id, link.id);
                            setHubspotLinks((prev) => prev.filter((l) => l.id !== link.id));
                            reloadCardFields(hubspotIntegration.id);
                          } catch { /* ignore */ }
                        }}
                      >
                        <X size={10} />
                      </button>
                    </div>
                  ))
                )}
              </div>

              {/* Manual link records */}
              <div style={{ position: "relative" }}>
                <button
                  className="sp-add-btn"
                  type="button"
                  onClick={() => { setShowHubspotSearch(!showHubspotSearch); setHubspotSearchQuery(""); }}
                >
                  <Plus size={11} /> Link record
                </button>
                {showHubspotSearch && (
                  <div className="sp-dropdown" style={{ minWidth: 300, maxWidth: 340 }}>
                    {/* Object type tabs */}
                    <div style={{ display: "flex", borderBottom: "1px solid var(--border)", fontSize: 11 }}>
                      {["companies", "deals", "contacts", "tickets"].map((ot) => {
                        const count = hubspotAllRecords.filter((r) => r._objectType === ot).length;
                        return (
                          <button
                            key={ot}
                            type="button"
                            style={{
                              flex: 1, padding: "6px 4px", border: "none", cursor: "pointer",
                              background: hubspotSearchObjectType === ot ? "var(--bg-hover)" : "transparent",
                              borderBottom: hubspotSearchObjectType === ot ? "2px solid var(--accent)" : "2px solid transparent",
                              color: hubspotSearchObjectType === ot ? "var(--text-primary)" : "var(--text-muted)",
                              fontWeight: hubspotSearchObjectType === ot ? 600 : 400,
                              textTransform: "capitalize",
                            }}
                            onClick={() => { setHubspotSearchObjectType(ot); setHubspotSearchQuery(""); }}
                          >
                            {ot}{count > 0 ? ` (${count})` : ""}
                          </button>
                        );
                      })}
                    </div>
                    {/* Filter input */}
                    <div style={{ padding: "8px 10px", borderBottom: "1px solid var(--border)" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, background: "var(--bg-tertiary)", borderRadius: 6, padding: "4px 8px" }}>
                        <Search size={12} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
                        <input
                          className="sp-input"
                          style={{ border: "none", background: "transparent", padding: 0, fontSize: 12 }}
                          placeholder={`Filter ${hubspotSearchObjectType}...`}
                          value={hubspotSearchQuery}
                          onChange={(e) => setHubspotSearchQuery(e.target.value)}
                          onKeyDown={(e) => { if (e.key === "Escape") setShowHubspotSearch(false); }}
                          autoFocus
                        />
                      </div>
                    </div>
                    {/* Record list */}
                    {hubspotRecordsLoading ? (
                      <div style={{ padding: 16, textAlign: "center" }}>
                        <Loader2 size={16} className="hs-spin" />
                        <p className="text-muted" style={{ fontSize: 11, marginTop: 4 }}>Loading from HubSpot...</p>
                      </div>
                    ) : (
                      <div style={{ maxHeight: 240, overflowY: "auto" }}>
                        {(() => {
                          const q = hubspotSearchQuery.toLowerCase().trim();
                          const linkedIds = new Set(hubspotLinks.map((l) => l.hubspot_object_id));
                          const filtered = hubspotAllRecords
                            .filter((r) => r._objectType === hubspotSearchObjectType)
                            .filter((r) => {
                              if (!q) return true;
                              const name = (r.properties?.dealname || r.properties?.name || r.properties?.subject || r.properties?.firstname || "").toLowerCase();
                              return name.includes(q);
                            });
                          if (filtered.length === 0) {
                            return (
                              <p className="text-muted" style={{ fontSize: 11, padding: "12px", textAlign: "center" }}>
                                {hubspotAllRecords.filter((r) => r._objectType === hubspotSearchObjectType).length === 0
                                  ? `No ${hubspotSearchObjectType} found in HubSpot.`
                                  : "No matches."}
                              </p>
                            );
                          }
                          return filtered.map((rec) => {
                            const recName = rec.properties?.dealname || rec.properties?.name || rec.properties?.subject || rec.properties?.firstname || rec.id;
                            const isLinked = linkedIds.has(rec.id);
                            return (
                              <label
                                key={rec.id}
                                style={{
                                  display: "flex", alignItems: "center", gap: 8,
                                  padding: "7px 10px", fontSize: 12, cursor: "pointer",
                                  background: isLinked ? "rgba(34, 197, 94, 0.06)" : "transparent",
                                  borderBottom: "1px solid var(--border-light, rgba(0,0,0,0.04))",
                                }}
                                onMouseEnter={(e) => { if (!isLinked) e.currentTarget.style.background = "var(--bg-hover)"; }}
                                onMouseLeave={(e) => { if (!isLinked) e.currentTarget.style.background = "transparent"; }}
                              >
                                <input
                                  type="checkbox"
                                  style={{ margin: 0, flexShrink: 0 }}
                                  checked={isLinked}
                                  onChange={async () => {
                                    if (isLinked) {
                                      const existingLink = hubspotLinks.find((l) => l.hubspot_object_id === rec.id);
                                      if (existingLink) {
                                        try {
                                          await removeHubSpotCardLink(card.id, existingLink.id);
                                          setHubspotLinks((prev) => prev.filter((l) => l.id !== existingLink.id));
                                        } catch { /* ignore */ }
                                      }
                                    } else {
                                      try {
                                        const link = await addHubSpotCardLink(card.id, {
                                          integration_id: hubspotIntegration.id,
                                          hubspot_object_type: hubspotSearchObjectType,
                                          hubspot_object_id: rec.id,
                                          hubspot_object_name: recName,
                                        });
                                        setHubspotLinks((prev) => [...prev, link]);
                                      } catch { /* ignore */ }
                                    }
                                    reloadCardFields(hubspotIntegration.id);
                                  }}
                                />
                                <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                  {recName}
                                </span>
                                <span className="sp-hubspot-link-type" style={{ fontSize: 9, flexShrink: 0 }}>
                                  {hubspotSearchObjectType.replace(/s$/, "")}
                                </span>
                              </label>
                            );
                          });
                        })()}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        {/* Divider before custom fields */}
        {customFieldDefs.filter((f) => !hiddenFields.includes(f.id)).length > 0 && <div className="sp-divider" />}

        {/* Custom fields */}
        {customFieldDefs.filter((f) => !hiddenFields.includes(f.id)).map((field) => {
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
                  <NumberFieldInput value={val} onChange={(v) => setCustomFieldValues((p) => ({ ...p, [field.id]: v }))}
                    onBlur={(v) => saveCustomFields({ ...customFieldValues, [field.id]: v })} />
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
                    <option value="">&mdash;</option>
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
      </div>}
    </div>
  );

  function saveCustomFields(vals) {
    if (!card.id) return;
    const fields = Object.entries(vals).filter(([_, v]) => v !== "" && v !== undefined).map(([id, value]) => ({ custom_field_id: id, value: String(value) }));
    setCardCustomFields(card.id, fields).catch(console.error);
  }
}
