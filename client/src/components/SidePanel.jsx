import React, { useState, useCallback, useRef, useEffect, useMemo } from "react";
import {
  X, Plus, Trash2, Settings,
  Link, Calendar, Hash, Type, CheckSquare,
  List, Users, Tag, RefreshCw, Loader2, Search, ExternalLink,
  GitBranch, Circle, CheckCircle2, Clock, ChevronLeft, ChevronRight, Zap, FileText,
} from "lucide-react";
import {
  getWorkspaceSettings,
  getCustomFields,
  setCardTeams as apiSetCardTeams, setCardCustomFields,
  getAllTeams, createTeamDirect,
  getCard, getCardHubSpotData, getIntegrations, enrichSingleCard,
  listHubSpotRecords, addHubSpotCardLink, removeHubSpotCardLink,
  getCardLinearIssues, getLinearTeams, pushCardToLinear,
  searchNotionPages, getCardNotionData, addNotionCardLink, removeNotionCardLink,
  fetchNotionContext,
} from "../services/api";
import WorkspaceEditor from "./WorkspaceEditor";
import DrawerPreview from "./DrawerPreview";

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

// Workspace-level caches — settings/teams/fields rarely change
let _wsSettingsCache = null;
let _wsTeamsCache = null;
let _wsFieldsCache = null;
let _wsCacheWorkspaceId = null;
let _wsCacheTime = 0;

const FIELD_TYPE_ICONS = {
  text: Type, number: Hash, date: Calendar, date_range: Calendar, select: List,
  multi_select: List, checkbox: CheckSquare, url: Link,
};


const BUILTIN_FIELDS = [
  { id: "teams", label: "Teams" },
  { id: "sprint", label: "End on" },
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
  const [effortUnit, setEffortUnit] = useState("Story Points");

  /* --- Config popup --- */
  const [showConfig, setShowConfig] = useState(!!initialShowConfig);
  const [hiddenFields, setHiddenFields] = useState([]);
  const [fieldOrder, setFieldOrder] = useState(null);
  const [popupStatuses, setPopupStatuses] = useState([]);
  const [popupCustomFields, setPopupCustomFields] = useState([]);
  const [popupBuiltinFields, setPopupBuiltinFields] = useState([]);
  const [popupIntegrations, setPopupIntegrations] = useState(new Set());
  const [popupHubspotIntegrationId, setPopupHubspotIntegrationId] = useState(null);
  const [popupLinearIntegrationId, setPopupLinearIntegrationId] = useState(null);
  const [popupNotionIntegrationId, setPopupNotionIntegrationId] = useState(null);

  // Sync initialShowConfig prop changes (e.g. tutorial triggering config popup while panel is already open)
  useEffect(() => {
    if (initialShowConfig) setShowConfig(true);
  }, [initialShowConfig]);

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
  const teamPickerRef = useRef(null);
  const hubspotSearchRef = useRef(null);

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

  /* --- Notion --- */
  const [notionIntegration, setNotionIntegration] = useState(null);
  const [notionLinks, setNotionLinks] = useState([]);
  const [notionSearchQuery, setNotionSearchQuery] = useState("");
  const [notionSearchResults, setNotionSearchResults] = useState([]);
  const [notionSearching, setNotionSearching] = useState(false);
  const [showNotionSearch, setShowNotionSearch] = useState(false);
  const [notionContext, setNotionContext] = useState(null);
  const [notionContextLoading, setNotionContextLoading] = useState(false);
  const [expandedNotionPage, setExpandedNotionPage] = useState(null);
  const notionSearchRef = useRef(null);

  /* --- Drawer tab --- */
  const [activeTab, setActiveTab] = useState("details");

  /* --- Loading state for instant render --- */
  const [drawerReady, setDrawerReady] = useState(false);

  const workspaceId = useMemo(() => {
    const user = JSON.parse(localStorage.getItem("user") || "{}");
    return user.workspace_id;
  }, []);

  /* ================================================================
     LOAD DATA — single batched effect for instant render
     ================================================================ */

  useEffect(() => {
    if (!workspaceId || !card.id) return;
    let cancelled = false;

    // Restore integration caches synchronously (no API call)
    const hsCacheValid = _hubspotCacheTime && (Date.now() - _hubspotCacheTime < CACHE_TTL);
    const linCacheValid = _linearCacheTime && (Date.now() - _linearCacheTime < CACHE_TTL);
    if (_hubspotIntegrationCache && hsCacheValid) {
      setHubspotIntegration(_hubspotIntegrationCache);
      if (_hubspotRecordsCache) setHubspotAllRecords(_hubspotRecordsCache);
    }
    if (_linearIntegrationCache && linCacheValid) {
      setLinearIntegration(_linearIntegrationCache);
      if (_linearTeamsCache) setLinearTeams(_linearTeamsCache);
    }

    // Check if workspace-level data is cached
    const wsCacheValid = _wsCacheWorkspaceId === workspaceId && _wsCacheTime && (Date.now() - _wsCacheTime < CACHE_TTL);

    // Apply workspace cache synchronously if valid
    if (wsCacheValid) {
      if (_wsSettingsCache) {
        setSettings(_wsSettingsCache);
        try { setHiddenFields(JSON.parse(_wsSettingsCache.drawer_hidden_fields) || []); } catch { setHiddenFields([]); }
        try { setFieldOrder(_wsSettingsCache.drawer_field_order ? JSON.parse(_wsSettingsCache.drawer_field_order) : null); } catch { setFieldOrder(null); }
        if (_wsSettingsCache.effort_unit) setEffortUnit(_wsSettingsCache.effort_unit);
      }
      setAllTeams(_wsTeamsCache || []);
      setCustomFieldDefs(_wsFieldsCache || []);
    }

    // Only fetch card-specific data if workspace cache is valid; otherwise fetch everything
    const wsPromise = wsCacheValid
      ? Promise.resolve([_wsSettingsCache, _wsTeamsCache || [], _wsFieldsCache || []])
      : Promise.all([
          getWorkspaceSettings(workspaceId).catch(() => null),
          getAllTeams(workspaceId).catch(() => []),
          getCustomFields(workspaceId).catch(() => []),
        ]);

    // Single card fetch — getCard returns card_teams + custom_fields
    const cardPromise = getCard(card.id).catch(() => null);

    Promise.all([wsPromise, cardPromise]).then(([[ws, teams, fields], fullCard]) => {
      if (cancelled) return;

      // Populate workspace cache if we fetched fresh data
      if (!wsCacheValid) {
        _wsSettingsCache = ws;
        _wsTeamsCache = teams;
        _wsFieldsCache = fields;
        _wsCacheWorkspaceId = workspaceId;
        _wsCacheTime = Date.now();

        if (ws) {
          setSettings(ws);
          try { setHiddenFields(JSON.parse(ws.drawer_hidden_fields) || []); } catch { setHiddenFields([]); }
          try { setFieldOrder(ws.drawer_field_order ? JSON.parse(ws.drawer_field_order) : null); } catch { setFieldOrder(null); }
          if (ws.effort_unit) setEffortUnit(ws.effort_unit);
        }
        setAllTeams(teams);
        setCustomFieldDefs(fields);
      }

      if (fullCard) {
        // Card teams from the same response
        const ct = fullCard.cardTeams || fullCard.card_teams || [];
        setCardTeams(ct);

        // Custom field values
        const cfList = fullCard.customFields || fullCard.custom_fields || [];
        if (cfList.length > 0) {
          const vals = {};
          cfList.forEach((cf) => { vals[cf.custom_field_id] = cf.value; });
          setCustomFieldValues((prev) => ({ ...prev, ...vals }));
        }
      }

      // Mark drawer as ready — renders all fields at once
      setDrawerReady(true);
    });

    // Non-critical data: load in background after drawer is shown
    getCardHubSpotData(card.id).then((data) => { if (!cancelled) setHubspotLinks(data.links || []); }).catch(() => { if (!cancelled) setHubspotLinks([]); });
    getCardLinearIssues(card.id).then((data) => {
      if (!cancelled) { setLinearIssues(data.issues || []); setLinearLinks(data.links || []); }
    }).catch(() => { if (!cancelled) { setLinearIssues([]); setLinearLinks([]); } });
    getCardNotionData(card.id).then((data) => {
      if (!cancelled) setNotionLinks(data?.links || data?.notion_links || []);
    }).catch(() => { if (!cancelled) setNotionLinks([]); });

    // Integration discovery (skip if caches are valid)
    if (!(hsCacheValid && _hubspotRecordsCache && linCacheValid && _linearTeamsCache)) {
      getIntegrations().then((data) => {
        if (cancelled) return;
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

        // Notion
        const not = all.find((i) => i.type === "notion" && i.status === "active");
        setNotionIntegration(not || null);

        // Linear
        const lin = all.find((i) => i.type === "linear" && i.status === "active");
        setLinearIntegration(lin || null);
        _linearIntegrationCache = lin || null;
        if (lin && (!_linearTeamsCache || !linCacheValid)) {
          getLinearTeams(lin.id).then((lData) => {
            const t = lData?.linear_teams || [];
            setLinearTeams(t);
            _linearTeamsCache = t;
            _linearCacheTime = Date.now();
          }).catch(() => setLinearTeams([]));
        }
      }).catch(() => { setHubspotIntegration(null); setLinearIntegration(null); setNotionIntegration(null); });
    }

    return () => { cancelled = true; };
  }, [workspaceId, card.id]);

  // Enrich card and reload custom field values
  /* --- Click-outside to close dropdowns --- */
  useEffect(() => {
    function handleMouseDown(e) {
      if (showTeamPicker && teamPickerRef.current && !teamPickerRef.current.contains(e.target)) {
        setShowTeamPicker(false);
        setCreatingTeam(false);
      }
      if (showHubspotSearch && hubspotSearchRef.current && !hubspotSearchRef.current.contains(e.target)) {
        setShowHubspotSearch(false);
      }
      if (showNotionSearch && notionSearchRef.current && !notionSearchRef.current.contains(e.target)) {
        setShowNotionSearch(false);
      }
    }
    if (showTeamPicker || showHubspotSearch || showNotionSearch) {
      document.addEventListener("mousedown", handleMouseDown);
      return () => document.removeEventListener("mousedown", handleMouseDown);
    }
  }, [showTeamPicker, showHubspotSearch, showNotionSearch]);

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
    setTags(card.tags || []);
    setActiveTab("details");
    setDrawerReady(false);
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
        if (showConfig) { closeCustomizePopup(); return; }
        if (showDeleteConfirm) { setShowDeleteConfirm(false); return; }
        onClose();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose, showDeleteConfirm, showConfig]);

  /* ================================================================
     CUSTOMIZE POPUP HELPERS
     ================================================================ */

  const openCustomizePopup = useCallback(async () => {
    // Load workspace data into popup state
    const defaultColors = { Placeholder: "#9CA3AF", Planned: "#3B82F6", "In Progress": "#ECC94B", Done: "#22C55E" };
    try {
      const [ws, fields, integrations] = await Promise.all([
        workspaceId ? getWorkspaceSettings(workspaceId) : Promise.resolve(null),
        workspaceId ? getCustomFields(workspaceId) : Promise.resolve([]),
        getIntegrations().catch(() => []),
      ]);

      // Statuses
      if (ws) {
        const names = ws.custom_statuses ? JSON.parse(ws.custom_statuses) : ["Placeholder", "Planned", "In Progress", "Done"];
        const colors = ws.status_colors ? JSON.parse(ws.status_colors) : {};
        setPopupStatuses(names.map((n) => ({ name: n, color: colors[n] || defaultColors[n] || "#A0AEC0" })));

        // Builtin fields
        const hidden = ws.drawer_hidden_fields ? JSON.parse(ws.drawer_hidden_fields) : [];
        const hiddenSet = new Set(hidden);
        setPopupBuiltinFields(BUILTIN_FIELDS.map((f) => ({ name: f.label, builtin: true, visible: !hiddenSet.has(f.label) })));

        // Custom fields
        const mappedFields = (fields || []).map((f) => ({
          id: f.id,
          name: f.name,
          field_type: f.field_type,
          options: f.options ? (typeof f.options === "string" ? JSON.parse(f.options) : f.options) : [],
          description: "",
          visible: !hiddenSet.has(f.name),
          source: f.source || "manual",
          source_property: f.source_property || null,
        }));
        setPopupCustomFields(mappedFields);
      } else {
        setPopupStatuses([{ name: "Placeholder", color: "#9CA3AF" }, { name: "Planned", color: "#3B82F6" }, { name: "In Progress", color: "#ECC94B" }, { name: "Done", color: "#22C55E" }]);
        setPopupBuiltinFields(BUILTIN_FIELDS.map((f) => ({ name: f.label, builtin: true, visible: true })));
        setPopupCustomFields([]);
      }

      // Connected integrations
      const active = new Set();
      const all = Array.isArray(integrations) ? integrations : [];
      const hsInt = all.find((i) => i.type === "hubspot" && i.status === "active");
      if (hsInt) { active.add("HubSpot"); setPopupHubspotIntegrationId(hsInt.id); }
      const lnInt = all.find((i) => i.type === "linear" && i.status === "active");
      if (lnInt) { active.add("Linear"); setPopupLinearIntegrationId(lnInt.id); }
      const ntInt = all.find((i) => i.type === "notion" && i.status === "active");
      if (ntInt) { active.add("Notion"); setPopupNotionIntegrationId(ntInt.id); }
      setPopupIntegrations(active);
    } catch (err) {
      console.error("Failed to load popup data:", err);
    }
    setShowConfig(true);
  }, [workspaceId]);

  const closeCustomizePopup = useCallback(() => {
    setShowConfig(false);
    // Invalidate workspace cache since autoSave may have changed settings/fields
    _wsCacheTime = 0;
  }, []);

  /* ================================================================
     RESIZE HANDLER
     ================================================================ */

  const handleResizeStart = useCallback((e) => {
    e.preventDefault();
    resizing.current = true;
    const startX = e.clientX;
    const startWidth = panelWidth;
    let latestWidth = startWidth;

    const handleMouseMove = (e) => {
      const delta = startX - e.clientX;
      latestWidth = Math.max(320, Math.min(window.innerWidth * 0.8, startWidth + delta));
      setPanelWidth(latestWidth);
    };
    const handleMouseUp = () => {
      resizing.current = false;
      sessionStorage.setItem("drawerWidth", String(latestWidth));
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

  const defaultFields = ["teams", "sprint", "duration", "tags"];
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

      {/* ---- Customize popup (WorkspaceEditor + DrawerPreview) ---- */}
      {showConfig && (
        <div className="we-popup-overlay" onClick={closeCustomizePopup}>
          <div className="we-popup-container" onClick={(e) => e.stopPropagation()}>
            <div className="we-popup-header">
              <h3>Customize Drawer</h3>
              <button className="btn-icon" type="button" onClick={closeCustomizePopup}><X size={16} /></button>
            </div>
            <div className="ob-configure-layout" style={{ minHeight: 400 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <WorkspaceEditor
                  mode="popup"
                  autoSave={true}
                  workspaceId={workspaceId}
                  statuses={popupStatuses}
                  onStatusesChange={setPopupStatuses}
                  customFields={popupCustomFields}
                  onCustomFieldsChange={setPopupCustomFields}
                  builtinFields={popupBuiltinFields}
                  onBuiltinFieldsChange={setPopupBuiltinFields}
                  connectedIntegrations={popupIntegrations}
                  onIntegrationsChange={setPopupIntegrations}
                  hubspotIntegrationId={popupHubspotIntegrationId}
                  linearIntegrationId={popupLinearIntegrationId}
                  notionIntegrationId={popupNotionIntegrationId}
                />
              </div>
              <DrawerPreview
                statuses={popupStatuses}
                customFields={popupCustomFields}
                builtinFields={popupBuiltinFields}
                connectedIntegrations={popupIntegrations}
              />
            </div>
          </div>
        </div>
      )}

      {/* ---- Header ---- */}
      <div className="sp-header">
        <div className="sp-header-row">
          <button className="btn-icon" type="button" onClick={onClose}><X size={16} /></button>
          <div style={{ flex: 1 }} />
          <button className="btn-icon" type="button" onClick={openCustomizePopup} title="Drawer setup">
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
      {(hubspotIntegration || linearIntegration || notionIntegration) && (() => {
        const tabs = [
          { key: "details", label: "Details" },
          ...(hubspotIntegration ? [{ key: "hubspot", label: "HubSpot", icon: <Zap size={12} /> }] : []),
          ...(linearIntegration ? [{ key: "linear", label: "Linear", icon: <GitBranch size={12} /> }] : []),
          ...(notionIntegration ? [{ key: "notion", label: "Notion", icon: <FileText size={12} /> }] : []),
        ];
        const showArrows = tabs.length > 4;
        return (
          <div className="sp-tabs">
            {showArrows && (
              <button type="button" className="sp-tabs-arrow" onClick={() => {
                const el = document.querySelector(".sp-tabs-inner");
                if (el) el.scrollBy({ left: -100, behavior: "smooth" });
              }}><ChevronLeft size={14} /></button>
            )}
            <div className="sp-tabs-inner">
              {tabs.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  className={`sp-tab${activeTab === tab.key ? " active" : ""}`}
                  onClick={() => setActiveTab(tab.key)}
                >
                  {tab.icon}{tab.label}
                </button>
              ))}
            </div>
            {showArrows && (
              <button type="button" className="sp-tabs-arrow" onClick={() => {
                const el = document.querySelector(".sp-tabs-inner");
                if (el) el.scrollBy({ left: 100, behavior: "smooth" });
              }}><ChevronRight size={14} /></button>
            )}
          </div>
        );
      })()}

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

      {/* ---- HubSpot Tab ---- */}
      {activeTab === "hubspot" && hubspotIntegration && (
        <div className="sp-fields">
          <div className="sp-field sp-field-block">
            <div className="sp-field-header">
              <ExternalLink size={12} style={{ color: "var(--text-muted)" }} />
              <span className="sp-field-label" style={{ marginBottom: 0 }}>HubSpot Records</span>
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
            <div ref={hubspotSearchRef} style={{ position: "relative" }}>
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
        </div>
      )}

      {/* ---- Notion Tab ---- */}
      {activeTab === "notion" && notionIntegration && (
        <div className="sp-fields">
          {/* Linked pages */}
          <div className="sp-field sp-field-block">
            <div className="sp-field-header" style={{ marginBottom: 4 }}>
              <FileText size={12} style={{ color: "#000" }} />
              <span className="sp-field-label" style={{ marginBottom: 0 }}>Linked Documents</span>
              <button
                className="btn-icon"
                type="button"
                title="Link a Notion page"
                onClick={() => { setShowNotionSearch(true); setNotionSearchQuery(""); setNotionSearchResults([]); }}
                style={{ marginLeft: "auto" }}
              >
                <Plus size={12} />
              </button>
            </div>

            {notionLinks.length > 0 ? (
              <div className="sp-notion-links">
                {notionLinks.map((link) => (
                  <div key={link.id} className="sp-notion-link-item">
                    <div className="sp-notion-link-row">
                      <FileText size={12} style={{ flexShrink: 0, color: "var(--text-muted)" }} />
                      <a
                        href={link.notion_page_url || link.external_entity_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="sp-notion-link-title"
                        title={link.notion_page_title || link.external_entity_name}
                      >
                        {link.notion_page_title || link.external_entity_name || "Untitled"}
                      </a>
                      <button
                        className="btn-icon"
                        type="button"
                        title="Fetch AI context"
                        disabled={notionContextLoading}
                        onClick={async () => {
                          const pageId = link.notion_page_id || link.external_entity_id;
                          if (expandedNotionPage === pageId) { setExpandedNotionPage(null); return; }
                          setNotionContextLoading(true);
                          setExpandedNotionPage(pageId);
                          try {
                            const data = await fetchNotionContext(notionIntegration.id, [pageId]);
                            const ctx = data?.contexts?.[0];
                            setNotionContext(ctx?.content || "No content found");
                          } catch { setNotionContext("Failed to load page content"); }
                          setNotionContextLoading(false);
                        }}
                      >
                        {notionContextLoading && expandedNotionPage === (link.notion_page_id || link.external_entity_id)
                          ? <Loader2 size={11} className="hs-spin" />
                          : <Search size={11} />}
                      </button>
                      <button
                        className="btn-icon"
                        type="button"
                        title="Open in Notion"
                        onClick={() => window.open(link.notion_page_url || link.external_entity_url, "_blank")}
                      >
                        <ExternalLink size={11} />
                      </button>
                      <button
                        className="btn-icon"
                        type="button"
                        title="Unlink"
                        onClick={async () => {
                          try {
                            await removeNotionCardLink(card.id, link.id);
                            setNotionLinks((prev) => prev.filter((l) => l.id !== link.id));
                          } catch { /* ignore */ }
                        }}
                      >
                        <X size={11} />
                      </button>
                    </div>
                    {/* Expanded content preview */}
                    {expandedNotionPage === (link.notion_page_id || link.external_entity_id) && (
                      <div className="sp-notion-content-preview">
                        {notionContextLoading ? (
                          <span className="text-muted" style={{ fontSize: 11 }}>Loading content...</span>
                        ) : (
                          <pre className="sp-notion-content-text">{notionContext}</pre>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-muted" style={{ fontSize: 11, margin: "8px 0" }}>
                No documents linked. Click + to search and link Notion pages.
              </p>
            )}
          </div>

          {/* Search & link panel */}
          {showNotionSearch && (
            <div className="sp-field sp-field-block" ref={notionSearchRef}>
              <div className="sp-field-header" style={{ marginBottom: 4 }}>
                <Search size={12} style={{ color: "var(--text-muted)" }} />
                <span className="sp-field-label" style={{ marginBottom: 0 }}>Search Notion</span>
              </div>
              <div style={{ display: "flex", gap: 4 }}>
                <input
                  className="sp-input"
                  type="text"
                  placeholder="Search pages..."
                  value={notionSearchQuery}
                  autoFocus
                  onChange={(e) => setNotionSearchQuery(e.target.value)}
                  onKeyDown={async (e) => {
                    if (e.key === "Enter" && notionSearchQuery.trim()) {
                      setNotionSearching(true);
                      try {
                        const data = await searchNotionPages(notionIntegration.id, notionSearchQuery.trim());
                        setNotionSearchResults(data?.pages || []);
                      } catch { setNotionSearchResults([]); }
                      setNotionSearching(false);
                    }
                    if (e.key === "Escape") setShowNotionSearch(false);
                  }}
                />
                <button
                  className="btn btn-sm btn-primary"
                  type="button"
                  disabled={notionSearching || !notionSearchQuery.trim()}
                  onClick={async () => {
                    setNotionSearching(true);
                    try {
                      const data = await searchNotionPages(notionIntegration.id, notionSearchQuery.trim());
                      setNotionSearchResults(data?.pages || []);
                    } catch { setNotionSearchResults([]); }
                    setNotionSearching(false);
                  }}
                  style={{ fontSize: 10, whiteSpace: "nowrap" }}
                >
                  {notionSearching ? <Loader2 size={10} className="hs-spin" /> : "Search"}
                </button>
              </div>
              {notionSearchResults.length > 0 && (
                <div className="sp-notion-search-results">
                  {notionSearchResults.map((page) => {
                    const alreadyLinked = notionLinks.some((l) => (l.notion_page_id || l.external_entity_id) === page.id);
                    return (
                      <div
                        key={page.id}
                        className={`sp-notion-search-item${alreadyLinked ? " linked" : ""}`}
                        onClick={async () => {
                          if (alreadyLinked) return;
                          try {
                            const newLink = await addNotionCardLink(card.id, {
                              integration_id: notionIntegration.id,
                              notion_page_id: page.id,
                              notion_page_title: page.title,
                              notion_page_url: page.url,
                            });
                            setNotionLinks((prev) => [...prev, newLink]);
                            setShowNotionSearch(false);
                          } catch { /* ignore */ }
                        }}
                      >
                        <FileText size={11} style={{ flexShrink: 0, color: "var(--text-muted)" }} />
                        <span className="sp-notion-search-title">{page.title || "Untitled"}</span>
                        {alreadyLinked && <span className="sp-notion-linked-badge">Linked</span>}
                      </div>
                    );
                  })}
                </div>
              )}
              {notionSearchResults.length === 0 && notionSearchQuery && !notionSearching && (
                <p className="text-muted" style={{ fontSize: 11, margin: "8px 0" }}>
                  No results found. Try a different search term.
                </p>
              )}
            </div>
          )}

          {/* AI Context hint */}
          <div className="sp-field" style={{ opacity: 0.7 }}>
            <span className="text-muted" style={{ fontSize: 10 }}>
              Linked documents are available to the AI assistant for context when discussing this card.
            </span>
          </div>
        </div>
      )}

      {/* ---- Fields (Details tab) ---- */}
      {activeTab === "details" && !drawerReady && (
        <div className="sp-fields sp-skeleton">
          {[1,2,3,4,5].map((i) => (
            <div key={i} className="sp-skeleton-field">
              <div className="sp-skeleton-label" />
              <div className="sp-skeleton-value" />
            </div>
          ))}
        </div>
      )}
      {activeTab === "details" && drawerReady && <div className="sp-fields">
        {/* Teams with per-team effort */}
        {visibleDefaultFields.includes("teams") && (
          <div className={`sp-field${cardTeams.length > 0 ? " sp-field-block" : ""}`}>
            {cardTeams.length > 0 ? (
              <>
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
                  <div ref={teamPickerRef} style={{ position: "relative" }}>
                    <button className="sp-add-btn" type="button" onClick={() => { setShowTeamPicker(!showTeamPicker); setCreatingTeam(false); }}>
                      <Plus size={11} /> Add team
                    </button>
                {showTeamPicker && (
                  <div className="sp-dropdown" style={{ right: 0, left: "auto" }}>
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
                                  _wsCacheTime = 0; // invalidate workspace cache
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
              </>
            ) : (
              <>
                <span className="sp-field-label"><Users size={12} style={{ color: "var(--text-muted)", marginRight: 4 }} />Teams</span>
                <div className="sp-field-value" ref={teamPickerRef} style={{ position: "relative" }}>
                  <button className="sp-add-btn" type="button" onClick={() => { setShowTeamPicker(!showTeamPicker); setCreatingTeam(false); }}>
                    <Plus size={11} /> Add team
                  </button>
                  {showTeamPicker && (
                    <div className="sp-dropdown" style={{ right: 0, left: "auto" }}>
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
                                  cursor: "pointer"
                                }}
                                onClick={() => setNewTeamColor(c)}
                              />
                            ))}
                          </div>
                          <div style={{ display: "flex", gap: 4 }}>
                            <button className="btn btn-sm btn-primary" type="button" style={{ fontSize: 10 }}
                              onClick={() => {
                                if (!newTeamName.trim()) return;
                                createTeamDirect(workspaceId, newTeamName.trim(), newTeamColor)
                                  .then((created) => {
                                    setAllTeams((prev) => [...prev, created]);
                                    _wsCacheTime = 0; // invalidate workspace cache
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
              </>
            )}
          </div>
        )}

        {/* End on (read-only — shows end date of last sprint) */}
        {visibleDefaultFields.includes("sprint") && (
          <div className="sp-field">
            <span className="sp-field-label"><Calendar size={10} style={{ marginRight: 4, color: "var(--text-muted)" }} />End on</span>
            <div className="sp-field-value">
              <span className="sp-readonly">{card.sprintLabel || "\u2014"}</span>
            </div>
          </div>
        )}

        {/* Duration (read-only) */}
        {visibleDefaultFields.includes("duration") && (
          <div className="sp-field">
            <span className="sp-field-label"><Clock size={10} style={{ marginRight: 4, color: "var(--text-muted)" }} />Duration</span>
            <div className="sp-field-value">
              <span className="sp-readonly">
                {card.computedSpan || card.duration || 1} sprint{(card.computedSpan || card.duration || 1) !== 1 ? "s" : ""}
              </span>
            </div>
          </div>
        )}

        {/* Tags */}
        {visibleDefaultFields.includes("tags") && (
          <div className={`sp-field${tags.length > 0 ? " sp-field-block" : ""}`}>
            {tags.length > 0 ? (
              <>
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
              </>
            ) : (
              <>
                <span className="sp-field-label"><Tag size={12} style={{ color: "var(--text-muted)", marginRight: 4 }} />Tags</span>
                <div className="sp-field-value">
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
                      autoFocus
                    />
                  ) : (
                    <button className="sp-add-btn" type="button" onClick={handleAddTag}>
                      <Plus size={10} />
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {/* Custom fields */}
        {customFieldDefs.filter((f) => !hiddenFields.includes(f.id)).map((field) => {
          const val = customFieldValues[field.id] ?? "";
          const opts = field.options ? (typeof field.options === "string" ? JSON.parse(field.options) : field.options) : [];
          const Icon = FIELD_TYPE_ICONS[field.field_type] || Type;

          return (
            <div key={field.id} className="sp-field">
              <span className="sp-field-label"><Icon size={10} style={{ marginRight: 4, color: "var(--text-muted)" }} />{field.name}</span>
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
