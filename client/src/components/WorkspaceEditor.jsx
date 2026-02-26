import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  ChevronDown,
  ChevronRight,
  GripVertical,
  Eye,
  EyeOff,
  Trash2,
  Plus,
  Info,
  Pencil,
  X,
  Database,
  MoreVertical,
  Users,
  Calendar,
  Clock,
  Tag,
  Hash,
  Type,
  List,
  Link,
  CheckSquare,
  Search,
} from "lucide-react";
import {
  getIntegrations,
  getHubSpotAuthUrl,
  getLinearAuthUrl,
  getNotionAuthUrl,
  disconnectIntegration,
  updateWorkspaceSettings,
  createCustomField,
  updateCustomField,
  deleteCustomField,
  getHubSpotSchema,
} from "../services/api";

/* ---------- Constants ---------- */
const HUBSPOT_OBJECT_TYPES = [
  { key: "deals", label: "Deals" },
  { key: "tickets", label: "Tickets" },
  { key: "companies", label: "Companies" },
  { key: "contacts", label: "Contacts" },
];

const BUILTIN_FIELD_ICONS = { Teams: Users, Sprint: Calendar, Duration: Clock, Tags: Tag };
const FIELD_TYPE_ICONS = { text: Type, number: Hash, select: List, multi_select: List, date: Calendar, date_range: Calendar, url: Link, checkbox: CheckSquare };
const FIELD_TYPE_TOOLTIPS = {
  text: "Free-form text value",
  number: "Numeric value (e.g. revenue, score)",
  select: "Single choice from a list of options",
  multi_select: "Multiple choices from a list of options",
  date: "A date value",
  url: "A link / URL",
  checkbox: "True or false toggle",
};

const DEFAULT_BUILTIN_FIELDS = [
  { name: "Teams", builtin: true, visible: true },
  { name: "Sprint", builtin: true, visible: true },
  { name: "Duration", builtin: true, visible: true },
  { name: "Tags", builtin: true, visible: true },
];

/* ---------- BroadcastChannel for OAuth ---------- */
const OAUTH_CHANNEL = "roadway-onboarding-oauth";

/**
 * WorkspaceEditor — shared editor for statuses, fields, and integrations.
 * Used in both the Onboarding Phase 2 and the Settings Workspace tab.
 *
 * Props:
 *   statuses, onStatusesChange
 *   customFields, onCustomFieldsChange
 *   builtinFields, onBuiltinFieldsChange
 *   connectedIntegrations (Set), onIntegrationsChange
 *   hubspotSchema, hubspotIntegrationId
 *   mode: "onboarding" | "settings" | "popup"
 *   autoSave: boolean — when true, persist changes to API on edit
 *   workspaceId: string — needed for auto-save
 */
export default function WorkspaceEditor({
  statuses = DEFAULT_STATUSES,
  onStatusesChange,
  customFields = [],
  onCustomFieldsChange,
  builtinFields = DEFAULT_BUILTIN_FIELDS,
  onBuiltinFieldsChange,
  connectedIntegrations = new Set(),
  onIntegrationsChange,
  hubspotSchema = null,
  hubspotIntegrationId = null,
  linearIntegrationId = null,
  notionIntegrationId = null,
  mode = "onboarding",
  autoSave = false,
  workspaceId = null,
}) {
  const [collapsedSections, setCollapsedSections] = useState(new Set());
  const [expandedIntegrationCards, setExpandedIntegrationCards] = useState(new Set());
  const [showIntegrationPicker, setShowIntegrationPicker] = useState(false);
  const [editingEnrichmentField, setEditingEnrichmentField] = useState(null);
  const [hubspotRecordTypes, setHubspotRecordTypes] = useState(new Set(["companies", "deals"]));
  const [connectingIntegration, setConnectingIntegration] = useState(null);
  const [integrationMenu, setIntegrationMenu] = useState(null); // "HubSpot" | "Linear" | "Notion" | null
  const integrationMenuRef = useRef(null);
  const oauthHandledProviders = useRef(new Set());

  // Internal schema state — used when hubspotSchema prop is not provided
  const [internalSchema, setInternalSchema] = useState(null);
  const resolvedSchema = hubspotSchema || internalSchema;

  // Custom dropdown state for enrichment edit form
  const [openDropdown, setOpenDropdown] = useState(null); // "object-{idx}" | "property-{idx}" | "aggregation-{idx}" | null
  const [propertyFilter, setPropertyFilter] = useState("");
  const dropdownRef = useRef(null);

  // Options editor state for select/multi_select fields
  const [editingOptionsIdx, setEditingOptionsIdx] = useState(null); // index of field whose options are being edited
  const [optionInput, setOptionInput] = useState("");

  // Auto-save debounce refs
  const autoSaveTimer = useRef(null);
  const fieldSaveTimers = useRef({});

  /* ---------- Auto-save helpers ---------- */
  const scheduleAutoSave = useCallback((settingsUpdate) => {
    if (!autoSave || !workspaceId) return;
    clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(async () => {
      try {
        await updateWorkspaceSettings(workspaceId, settingsUpdate);
      } catch (err) {
        console.error("Auto-save error:", err);
      }
    }, 800);
  }, [autoSave, workspaceId]);

  // Save a custom field (create if new, update if existing)
  const scheduleFieldSave = useCallback((field, index) => {
    if (!autoSave || !workspaceId) return;
    const key = field.id || `new-${index}`;
    clearTimeout(fieldSaveTimers.current[key]);
    fieldSaveTimers.current[key] = setTimeout(async () => {
      try {
        if (field.id) {
          // Existing field — patch it
          await updateCustomField(field.id, {
            name: field.name,
            field_type: field.field_type,
            options: field.options || [],
          });
        } else if (field.name?.trim()) {
          // New field with a name — create it
          const created = await createCustomField({
            workspace_id: workspaceId,
            name: field.name.trim(),
            field_type: field.field_type || "text",
            options: field.options || [],
          });
          // Patch the id back into the field list so future edits update instead of recreating
          if (created?.id) {
            onCustomFieldsChange((prev) =>
              prev.map((f, i) => (i === index ? { ...f, id: created.id } : f))
            );
          }
        }
      } catch (err) {
        console.error("Field auto-save error:", err);
      }
    }, 800);
  }, [autoSave, workspaceId, onCustomFieldsChange]);

  /* ---------- Click-outside to close integration menu ---------- */
  useEffect(() => {
    if (!integrationMenu) return;
    function handleMouseDown(e) {
      if (integrationMenuRef.current && !integrationMenuRef.current.contains(e.target)) {
        setIntegrationMenu(null);
      }
    }
    document.addEventListener("mousedown", handleMouseDown);
    return () => document.removeEventListener("mousedown", handleMouseDown);
  }, [integrationMenu]);

  /* ---------- OAuth BroadcastChannel listener (for Settings/popup mode) ---------- */
  useEffect(() => {
    if (mode === "onboarding") return; // onboarding has its own handler
    let bc;
    try {
      bc = new BroadcastChannel(OAUTH_CHANNEL);
      bc.onmessage = (e) => {
        if (e.data?.type === "connected" && e.data.provider) {
          const provider = e.data.provider;
          if (oauthHandledProviders.current.has(provider)) return;
          oauthHandledProviders.current.add(provider);
          if (onIntegrationsChange) {
            onIntegrationsChange((prev) => new Set([...prev, provider]));
          }
        }
      };
    } catch { /* BroadcastChannel not supported */ }
    return () => { if (bc) bc.close(); };
  }, [mode, onIntegrationsChange]);

  /* ---------- Fetch HubSpot schema when prop not provided ---------- */
  useEffect(() => {
    if (hubspotSchema || !hubspotIntegrationId) return;
    let cancelled = false;
    getHubSpotSchema(hubspotIntegrationId)
      .then((data) => {
        if (cancelled) return;
        const rawObjects = data?.objects || {};
        const objectsArray = Array.isArray(rawObjects)
          ? rawObjects
          : Object.entries(rawObjects).map(([key, val]) => ({
              key,
              name: key,
              ...(typeof val === "object" ? val : {}),
            }));
        const priorityOrder = ["deals", "tickets", "companies", "contacts"];
        const available = objectsArray
          .filter((obj) => obj.properties && obj.properties.length > 0)
          .map((obj) => ({
            key: obj.key || obj.name,
            label: (obj.label || obj.key || obj.name || "").replace(/^./, (c) => c.toUpperCase()),
            propertyCount: obj.properties.length,
            properties: obj.properties,
          }))
          .sort((a, b) => {
            const ai = priorityOrder.indexOf(a.key.toLowerCase());
            const bi = priorityOrder.indexOf(b.key.toLowerCase());
            return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
          });
        setInternalSchema({ availableObjects: available });
      })
      .catch((err) => {
        console.error("Failed to fetch HubSpot schema:", err);
      });
    return () => { cancelled = true; };
  }, [hubspotSchema, hubspotIntegrationId]);

  /* ---------- Click-outside to close custom dropdowns ---------- */
  useEffect(() => {
    if (!openDropdown) return;
    function handleMouseDown(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setOpenDropdown(null);
        setPropertyFilter("");
      }
    }
    document.addEventListener("mousedown", handleMouseDown);
    return () => document.removeEventListener("mousedown", handleMouseDown);
  }, [openDropdown]);

  /* ---------- Collapsible sections ---------- */
  function toggleCollapse(key) {
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  /* ---------- Built-in field visibility ---------- */
  function toggleBuiltinFieldVisible(index) {
    const updated = builtinFields.map((f, i) => (i === index ? { ...f, visible: !f.visible } : f));
    onBuiltinFieldsChange(updated);
    if (autoSave) {
      const hidden = updated.filter((f) => !f.visible).map((f) => f.name);
      scheduleAutoSave({ drawer_hidden_fields: JSON.stringify(hidden) });
    }
  }

  /* ---------- Custom field handlers ---------- */
  function toggleFieldVisible(index) {
    const updated = customFields.map((f, i) => (i === index ? { ...f, visible: !f.visible } : f));
    onCustomFieldsChange(updated);
    if (autoSave) {
      const allHidden = [
        ...builtinFields.filter((f) => !f.visible).map((f) => f.name),
        ...updated.filter((f) => !f.visible && f.name?.trim()).map((f) => f.name.trim()),
      ];
      scheduleAutoSave({ drawer_hidden_fields: JSON.stringify(allHidden) });
    }
  }

  function removeField(index) {
    const field = customFields[index];
    const updated = customFields.filter((_, i) => i !== index);
    onCustomFieldsChange(updated);
    if (autoSave && field?.id) {
      deleteCustomField(field.id).catch((err) => console.error("Delete field error:", err));
    }
  }

  function addField() {
    const newField = { name: "", field_type: "text", options: [], description: "", visible: true };
    onCustomFieldsChange([...customFields, newField]);
  }

  function updateField(index, field, value) {
    const updatedField = { ...customFields[index], [field]: value };
    const updated = customFields.map((f, i) => (i === index ? updatedField : f));
    onCustomFieldsChange(updated);
    // Auto-save the field change
    scheduleFieldSave(updatedField, index);
    // Auto-open options editor when switching to select/multi_select
    if (field === "field_type" && (value === "select" || value === "multi_select")) {
      setEditingOptionsIdx(index);
      setOptionInput("");
    } else if (field === "field_type") {
      // Close options editor if switching away from select types
      if (editingOptionsIdx === index) setEditingOptionsIdx(null);
    }
  }

  function addOption(fieldIndex) {
    const trimmed = optionInput.trim();
    if (!trimmed) return;
    const field = customFields[fieldIndex];
    if (!field) return;
    const existing = field.options || [];
    if (existing.includes(trimmed)) return; // no duplicates
    updateField(fieldIndex, "options", [...existing, trimmed]);
    setOptionInput("");
  }

  function removeOption(fieldIndex, optionIndex) {
    const field = customFields[fieldIndex];
    if (!field) return;
    const updated = (field.options || []).filter((_, i) => i !== optionIndex);
    updateField(fieldIndex, "options", updated);
  }

  /* ---------- Integration card handlers ---------- */
  function toggleIntegrationCard(provider) {
    setExpandedIntegrationCards((prev) => {
      const next = new Set(prev);
      if (next.has(provider)) next.delete(provider);
      else next.add(provider);
      return next;
    });
  }

  function toggleHubSpotRecordType(key) {
    setHubspotRecordTypes((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  /* ---------- Enrichment field handlers ---------- */
  function addEnrichmentField() {
    const newField = { name: "", field_type: "number", options: [], description: "", visible: true, source: "hubspot", source_property: "", hubspot_object: "", aggregation: "sum" };
    onCustomFieldsChange([...customFields, newField]);
    const hsCount = customFields.filter((f) => f.source === "hubspot").length;
    setEditingEnrichmentField(hsCount);
  }

  function removeEnrichmentField(globalIndex) {
    const field = customFields[globalIndex];
    onCustomFieldsChange(customFields.filter((_, i) => i !== globalIndex));
    setEditingEnrichmentField(null);
    if (autoSave && field?.id) {
      deleteCustomField(field.id).catch((err) => console.error("Delete field error:", err));
    }
  }

  function updateEnrichmentField(globalIndex, updates) {
    const updated = customFields.map((f, i) => (i === globalIndex ? { ...f, ...updates } : f));
    onCustomFieldsChange(updated);
  }

  function startEditEnrichmentField(hsIndex) {
    setEditingEnrichmentField(editingEnrichmentField === hsIndex ? null : hsIndex);
  }

  async function handleDisconnectHubSpot() {
    if (!hubspotIntegrationId) return;
    try {
      await disconnectIntegration(hubspotIntegrationId);
      if (onIntegrationsChange) {
        onIntegrationsChange((prev) => {
          const next = new Set(prev);
          next.delete("HubSpot");
          return next;
        });
      }
      onCustomFieldsChange(customFields.filter((f) => f.source !== "hubspot"));
      setExpandedIntegrationCards((prev) => {
        const next = new Set(prev);
        next.delete("HubSpot");
        return next;
      });
      setEditingEnrichmentField(null);
    } catch (err) {
      console.error("Disconnect HubSpot error:", err);
    }
  }

  async function handleDisconnectLinear() {
    if (!linearIntegrationId) return;
    try {
      await disconnectIntegration(linearIntegrationId);
      if (onIntegrationsChange) {
        onIntegrationsChange((prev) => {
          const next = new Set(prev);
          next.delete("Linear");
          return next;
        });
      }
    } catch (err) {
      console.error("Disconnect Linear error:", err);
    }
  }

  async function handleDisconnectNotion() {
    if (!notionIntegrationId) return;
    try {
      await disconnectIntegration(notionIntegrationId);
      if (onIntegrationsChange) {
        onIntegrationsChange((prev) => {
          const next = new Set(prev);
          next.delete("Notion");
          return next;
        });
      }
    } catch (err) {
      console.error("Disconnect Notion error:", err);
    }
  }

  /* ---------- Connect integration ---------- */
  async function handleConnectIntegration(tool) {
    oauthHandledProviders.current.delete(tool);
    setConnectingIntegration(tool);
    try {
      const integrations = await getIntegrations();
      const typeMap = { HubSpot: "hubspot", Linear: "linear", Notion: "notion" };
      const existing = integrations.find((i) => i.type === typeMap[tool] && i.status === "active");
      if (existing) {
        if (onIntegrationsChange) {
          onIntegrationsChange((prev) => new Set([...prev, tool]));
        }
      } else {
        const from = mode === "onboarding" ? "onboarding" : "settings";
        let data;
        if (tool === "HubSpot") data = await getHubSpotAuthUrl({ from });
        else if (tool === "Linear") data = await getLinearAuthUrl({ from });
        else if (tool === "Notion") data = await getNotionAuthUrl({ from });
        if (data?.url) window.open(data.url, "_blank");
      }
    } catch (err) {
      console.error("Connect integration error:", err);
    } finally {
      setConnectingIntegration(null);
    }
  }

  /* ============================================================
     Render
     ============================================================ */
  return (
    <div className={`workspace-editor${mode === "popup" ? " we-popup-mode" : ""}`}>
      {/* Integration Summary Cards */}
      {connectedIntegrations.size > 0 && (
        <div className="ob-editor-section">
          <button className="ob-editor-heading-btn" onClick={() => toggleCollapse("integrations")}>
            <ChevronDown size={14} className={`ob-collapse-icon${collapsedSections.has("integrations") ? " collapsed" : ""}`} />
            <h3 className="ob-editor-heading">Integrations</h3>
            <span className="ob-editor-count">{connectedIntegrations.size}</span>
          </button>
          {!collapsedSections.has("integrations") && (
            <div className="ob-integration-cards">
              {/* HubSpot card */}
              {connectedIntegrations.has("HubSpot") && (() => {
                const isExpanded = expandedIntegrationCards.has("HubSpot");
                const hsFields = customFields.filter((f) => f.source === "hubspot");
                const fieldNames = hsFields.map((f) => f.name).filter(Boolean).join(" \u00b7 ");
                return (
                  <div className={`ob-integration-card${isExpanded ? " expanded" : ""}`}>
                    <div className="ob-integration-card-header-row">
                      <button className="ob-integration-card-header" onClick={() => toggleIntegrationCard("HubSpot")} style={{ flex: 1 }}>
                        <span className="ob-tab-provider-badge hubspot">HS</span>
                        <div className="ob-integration-card-info">
                          <span className="ob-integration-card-name">HubSpot</span>
                          <span className="ob-integration-card-status">
                            <span className="ob-status-dot connected" />
                            Connected
                          </span>
                        </div>
                        <div className="ob-integration-card-summary">
                          {hsFields.length > 0 && (
                            <span className="ob-integration-card-count">{hsFields.length} enrichment field{hsFields.length !== 1 ? "s" : ""}</span>
                          )}
                          {fieldNames && <span className="ob-integration-card-fields">{fieldNames}</span>}
                        </div>
                        <ChevronDown size={14} className={`ob-integration-card-arrow${isExpanded ? " expanded" : ""}`} />
                      </button>
                      <div className="ob-integration-menu-wrap" ref={integrationMenu === "HubSpot" ? integrationMenuRef : null}>
                        <button className="ob-integration-menu-btn" type="button" onClick={(e) => { e.stopPropagation(); setIntegrationMenu(integrationMenu === "HubSpot" ? null : "HubSpot"); }}>
                          <MoreVertical size={14} />
                        </button>
                        {integrationMenu === "HubSpot" && (
                          <div className="ob-integration-menu-dropdown">
                            <button className="ob-integration-menu-item danger" onClick={() => { setIntegrationMenu(null); handleDisconnectHubSpot(); }}>Disconnect</button>
                          </div>
                        )}
                      </div>
                    </div>
                    {isExpanded && (
                      <div className="ob-integration-card-body">
                        {/* Enrichment Fields */}
                        <div className="ob-integration-card-section">
                          <div className="ob-integration-card-section-title">Enrichment Fields</div>
                          <p className="ob-integration-card-hint">Fields automatically populated from your HubSpot data when you link a record to a feature.</p>
                          <div className="ob-enrichment-field-list">
                            {hsFields.map((f, hsIdx) => {
                              const globalIdx = customFields.indexOf(f);
                              const isEditing = editingEnrichmentField === hsIdx;
                              const objectLabel = f.hubspot_object ? f.hubspot_object.charAt(0).toUpperCase() + f.hubspot_object.slice(1) : "";
                              return (
                                <div key={globalIdx} className={`ob-enrichment-field-row${isEditing ? " editing" : ""}`}>
                                  {!isEditing ? (
                                    <>
                                      <span className="ob-enrichment-field-name">{f.name || "Untitled"}</span>
                                      <span className="ob-enrichment-field-mapping">
                                        {objectLabel}{f.source_property ? ` \u203a ${f.source_property}` : ""}{f.aggregation ? ` \u203a ${f.aggregation}` : ""}
                                      </span>
                                      <button className="ob-enrichment-edit-btn" onClick={() => startEditEnrichmentField(hsIdx)} title="Edit">
                                        <Pencil size={12} />
                                      </button>
                                      <button className="ob-enrichment-remove-btn" onClick={() => removeEnrichmentField(globalIdx)} title="Remove">
                                        <X size={12} />
                                      </button>
                                    </>
                                  ) : (
                                    <div className="ob-enrichment-edit-form">
                                      <div className="ob-enrichment-edit-row">
                                        <label>Field name</label>
                                        <input
                                          type="text"
                                          value={f.name}
                                          onChange={(e) => updateEnrichmentField(globalIdx, { name: e.target.value })}
                                          placeholder="e.g. ARR"
                                        />
                                      </div>
                                      {/* Object — custom dropdown */}
                                      <div className="ob-enrichment-edit-row">
                                        <label>Object</label>
                                        <div className="ob-enrichment-dropdown-wrap" ref={openDropdown === `object-${hsIdx}` ? dropdownRef : null}>
                                          <button
                                            type="button"
                                            className="ob-enrichment-dropdown-trigger"
                                            onClick={() => { setOpenDropdown(openDropdown === `object-${hsIdx}` ? null : `object-${hsIdx}`); setPropertyFilter(""); }}
                                          >
                                            <span className={f.hubspot_object ? "" : "ob-enrichment-dropdown-placeholder"}>
                                              {f.hubspot_object ? HUBSPOT_OBJECT_TYPES.find((o) => o.key === f.hubspot_object)?.label || f.hubspot_object : "Select..."}
                                            </span>
                                            <ChevronDown size={12} className="ob-enrichment-dropdown-chevron" />
                                          </button>
                                          {openDropdown === `object-${hsIdx}` && (
                                            <div className="ob-enrichment-dropdown-list">
                                              {HUBSPOT_OBJECT_TYPES.map((o) => (
                                                <button
                                                  key={o.key}
                                                  type="button"
                                                  className={`ob-enrichment-dropdown-item${f.hubspot_object === o.key ? " selected" : ""}`}
                                                  onClick={() => { updateEnrichmentField(globalIdx, { hubspot_object: o.key, source_property: "" }); setOpenDropdown(null); }}
                                                >
                                                  {o.label}
                                                </button>
                                              ))}
                                            </div>
                                          )}
                                        </div>
                                      </div>
                                      {/* Property — custom dropdown with search */}
                                      <div className="ob-enrichment-edit-row">
                                        <label>Property</label>
                                        {(() => {
                                          const allProperties = (resolvedSchema?.availableObjects || []).find((o) => o.key === f.hubspot_object)?.properties || [];
                                          const filteredProperties = propertyFilter
                                            ? allProperties.filter((p) => (p.label || p.name).toLowerCase().includes(propertyFilter.toLowerCase()))
                                            : allProperties;
                                          const selectedPropLabel = allProperties.find((p) => p.name === f.source_property);
                                          return (
                                            <div className="ob-enrichment-dropdown-wrap" ref={openDropdown === `property-${hsIdx}` ? dropdownRef : null}>
                                              <button
                                                type="button"
                                                className="ob-enrichment-dropdown-trigger"
                                                onClick={() => { setOpenDropdown(openDropdown === `property-${hsIdx}` ? null : `property-${hsIdx}`); setPropertyFilter(""); }}
                                              >
                                                <span className={f.source_property ? "" : "ob-enrichment-dropdown-placeholder"}>
                                                  {selectedPropLabel ? (selectedPropLabel.label || selectedPropLabel.name) : "Select..."}
                                                </span>
                                                <ChevronDown size={12} className="ob-enrichment-dropdown-chevron" />
                                              </button>
                                              {openDropdown === `property-${hsIdx}` && (
                                                <div className="ob-enrichment-dropdown-list ob-enrichment-dropdown-list-searchable">
                                                  <div className="ob-enrichment-dropdown-search">
                                                    <Search size={12} className="ob-enrichment-dropdown-search-icon" />
                                                    <input
                                                      type="text"
                                                      placeholder="Filter properties..."
                                                      value={propertyFilter}
                                                      onChange={(e) => setPropertyFilter(e.target.value)}
                                                      autoFocus
                                                    />
                                                  </div>
                                                  <div className="ob-enrichment-dropdown-items">
                                                    {filteredProperties.length === 0 && (
                                                      <div className="ob-enrichment-dropdown-empty">
                                                        {!f.hubspot_object ? "Select an object first" : allProperties.length === 0 ? "No properties available" : "No matching properties"}
                                                      </div>
                                                    )}
                                                    {filteredProperties.map((p) => (
                                                      <button
                                                        key={p.name}
                                                        type="button"
                                                        className={`ob-enrichment-dropdown-item${f.source_property === p.name ? " selected" : ""}`}
                                                        onClick={() => { updateEnrichmentField(globalIdx, { source_property: p.name }); setOpenDropdown(null); setPropertyFilter(""); }}
                                                      >
                                                        {p.label || p.name}
                                                      </button>
                                                    ))}
                                                  </div>
                                                </div>
                                              )}
                                            </div>
                                          );
                                        })()}
                                      </div>
                                      {/* Aggregation — custom dropdown */}
                                      <div className="ob-enrichment-edit-row">
                                        <label>Aggregation</label>
                                        <div className="ob-enrichment-dropdown-wrap" ref={openDropdown === `aggregation-${hsIdx}` ? dropdownRef : null}>
                                          <button
                                            type="button"
                                            className="ob-enrichment-dropdown-trigger"
                                            onClick={() => { setOpenDropdown(openDropdown === `aggregation-${hsIdx}` ? null : `aggregation-${hsIdx}`); setPropertyFilter(""); }}
                                          >
                                            <span>
                                              {({ sum: "Sum", avg: "Average", count: "Count", min: "Min", max: "Max", latest: "Latest" })[f.aggregation || "sum"] || f.aggregation || "Sum"}
                                            </span>
                                            <ChevronDown size={12} className="ob-enrichment-dropdown-chevron" />
                                          </button>
                                          {openDropdown === `aggregation-${hsIdx}` && (
                                            <div className="ob-enrichment-dropdown-list">
                                              {[
                                                { value: "sum", label: "Sum" },
                                                { value: "avg", label: "Average" },
                                                { value: "count", label: "Count" },
                                                { value: "min", label: "Min" },
                                                { value: "max", label: "Max" },
                                                { value: "latest", label: "Latest" },
                                              ].map((agg) => (
                                                <button
                                                  key={agg.value}
                                                  type="button"
                                                  className={`ob-enrichment-dropdown-item${(f.aggregation || "sum") === agg.value ? " selected" : ""}`}
                                                  onClick={() => { updateEnrichmentField(globalIdx, { aggregation: agg.value }); setOpenDropdown(null); }}
                                                >
                                                  {agg.label}
                                                </button>
                                              ))}
                                            </div>
                                          )}
                                        </div>
                                      </div>
                                      <button className="ob-enrichment-edit-done" onClick={() => { setEditingEnrichmentField(null); setOpenDropdown(null); setPropertyFilter(""); }}>
                                        Done
                                      </button>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                          <button className="ob-add-btn" onClick={addEnrichmentField}>
                            <Plus size={14} />
                            Add enrichment field
                          </button>
                        </div>

                        {/* Record Matching */}
                        <div className="ob-integration-card-section">
                          <div className="ob-integration-card-section-title">Record Linking</div>
                          <p className="ob-integration-card-hint">How HubSpot records (companies, contacts) get connected to your features for data enrichment.</p>
                          <div className="ob-radio-option selected">
                            <input type="radio" checked readOnly />
                            <div>
                              <span className="ob-radio-option-label">Manually</span>
                              <span className="ob-radio-option-desc">Link records yourself from the feature drawer</span>
                            </div>
                          </div>
                          <div className="ob-radio-option disabled">
                            <input type="radio" checked={false} readOnly disabled />
                            <div>
                              <span className="ob-radio-option-label">Auto-link <span className="ob-coming-soon-badge">Coming Soon</span></span>
                              <span className="ob-radio-option-desc">Auto linking disabled</span>
                            </div>
                          </div>
                        </div>

                        {/* Record Types */}
                        <div className="ob-integration-card-section">
                          <div className="ob-integration-card-section-title">Record Types</div>
                          <div className="ob-record-types-row">
                            {HUBSPOT_OBJECT_TYPES.map((o) => (
                              <label key={o.key} className="ob-checkbox-option">
                                <input
                                  type="checkbox"
                                  checked={hubspotRecordTypes.has(o.key)}
                                  onChange={() => toggleHubSpotRecordType(o.key)}
                                />
                                {o.label}
                              </label>
                            ))}
                          </div>
                        </div>

                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Linear card */}
              {connectedIntegrations.has("Linear") && (
                <div className="ob-integration-card">
                  <div className="ob-integration-card-header-row">
                    <div className="ob-integration-card-header ob-integration-card-header-static" style={{ flex: 1 }}>
                      <span className="ob-tab-provider-badge linear">LN</span>
                      <div className="ob-integration-card-info">
                        <span className="ob-integration-card-name">Linear</span>
                        <span className="ob-integration-card-status">
                          <span className="ob-status-dot connected" />
                          Connected
                        </span>
                      </div>
                      <div className="ob-integration-card-summary">
                        <span className="ob-integration-card-count">Issues synced from Linear</span>
                      </div>
                    </div>
                    <div className="ob-integration-menu-wrap" ref={integrationMenu === "Linear" ? integrationMenuRef : null}>
                      <button className="ob-integration-menu-btn" type="button" onClick={(e) => { e.stopPropagation(); setIntegrationMenu(integrationMenu === "Linear" ? null : "Linear"); }}>
                        <MoreVertical size={14} />
                      </button>
                      {integrationMenu === "Linear" && (
                        <div className="ob-integration-menu-dropdown">
                          <button className="ob-integration-menu-item danger" onClick={() => { setIntegrationMenu(null); handleDisconnectLinear(); }}>Disconnect</button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Notion card */}
              {connectedIntegrations.has("Notion") && (
                <div className="ob-integration-card">
                  <div className="ob-integration-card-header-row">
                    <div className="ob-integration-card-header ob-integration-card-header-static" style={{ flex: 1 }}>
                      <span className="ob-tab-provider-badge notion">NT</span>
                      <div className="ob-integration-card-info">
                        <span className="ob-integration-card-name">Notion</span>
                        <span className="ob-integration-card-status">
                          <span className="ob-status-dot connected" />
                          Connected
                        </span>
                      </div>
                      <div className="ob-integration-card-summary">
                        <span className="ob-integration-card-count">Linked Notion databases</span>
                      </div>
                    </div>
                    <div className="ob-integration-menu-wrap" ref={integrationMenu === "Notion" ? integrationMenuRef : null}>
                      <button className="ob-integration-menu-btn" type="button" onClick={(e) => { e.stopPropagation(); setIntegrationMenu(integrationMenu === "Notion" ? null : "Notion"); }}>
                        <MoreVertical size={14} />
                      </button>
                      {integrationMenu === "Notion" && (
                        <div className="ob-integration-menu-dropdown">
                          <button className="ob-integration-menu-item danger" onClick={() => { setIntegrationMenu(null); handleDisconnectNotion(); }}>Disconnect</button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Connect another integration */}
              {!showIntegrationPicker ? (
                <button className="ob-connect-another-btn" onClick={() => setShowIntegrationPicker(true)}>
                  <Plus size={14} />
                  Connect another integration
                </button>
              ) : (
                <div className="ob-integration-picker">
                  {[
                    { name: "HubSpot", badge: "hubspot", label: "HS" },
                    { name: "Linear", badge: "linear", label: "LN" },
                    { name: "Notion", badge: "notion", label: "NT" },
                  ].filter((t) => !connectedIntegrations.has(t.name)).map((t) => (
                    <button
                      key={t.name}
                      className="ob-integration-picker-item"
                      onClick={() => { setShowIntegrationPicker(false); handleConnectIntegration(t.name); }}
                    >
                      <span className={`ob-tab-provider-badge ${t.badge}`}>{t.label}</span>
                      <span>{t.name}</span>
                      <ChevronRight size={14} className="ob-integration-picker-arrow" />
                    </button>
                  ))}
                  {connectedIntegrations.size >= 3 && (
                    <p className="ob-integration-card-hint">All integrations connected.</p>
                  )}
                  <button className="ob-integration-picker-cancel" onClick={() => setShowIntegrationPicker(false)}>
                    Cancel
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Connect integration button when none connected */}
      {connectedIntegrations.size === 0 && (
        <div className="ob-editor-section">
          <button className="ob-editor-heading-btn" onClick={() => toggleCollapse("integrations")}>
            <ChevronDown size={14} className={`ob-collapse-icon${collapsedSections.has("integrations") ? " collapsed" : ""}`} />
            <h3 className="ob-editor-heading">Integrations</h3>
            <span className="ob-editor-count">0</span>
          </button>
          {!collapsedSections.has("integrations") && (
            <div className="ob-integration-cards">
              {!showIntegrationPicker ? (
                <button className="ob-connect-another-btn" onClick={() => setShowIntegrationPicker(true)}>
                  <Plus size={14} />
                  Connect an integration
                </button>
              ) : (
                <div className="ob-integration-picker">
                  {[
                    { name: "HubSpot", badge: "hubspot", label: "HS" },
                    { name: "Linear", badge: "linear", label: "LN" },
                    { name: "Notion", badge: "notion", label: "NT" },
                  ].map((t) => (
                    <button
                      key={t.name}
                      className="ob-integration-picker-item"
                      onClick={() => { setShowIntegrationPicker(false); handleConnectIntegration(t.name); }}
                    >
                      <span className={`ob-tab-provider-badge ${t.badge}`}>{t.label}</span>
                      <span>{t.name}</span>
                      <ChevronRight size={14} className="ob-integration-picker-arrow" />
                    </button>
                  ))}
                  <button className="ob-integration-picker-cancel" onClick={() => setShowIntegrationPicker(false)}>
                    Cancel
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Fields — collapsible */}
      <div className="ob-editor-section">
        <button className="ob-editor-heading-btn" onClick={() => toggleCollapse("fields")}>
          <ChevronDown size={14} className={`ob-collapse-icon${collapsedSections.has("fields") ? " collapsed" : ""}`} />
          <h3 className="ob-editor-heading">Fields</h3>
          <span className="ob-editor-count">{builtinFields.length + customFields.length}</span>
        </button>
        {!collapsedSections.has("fields") && (
          <>
            <div className="ob-field-list">
              {builtinFields.map((f, i) => (
                <div key={`builtin-${i}`} className="ob-field-row ob-field-row-builtin">
                  <button
                    className={`ob-field-visible ${f.visible ? "on" : ""}`}
                    onClick={() => toggleBuiltinFieldVisible(i)}
                    title={f.visible ? "Visible in drawer" : "Hidden from drawer"}
                  >
                    {f.visible ? <Eye size={13} /> : <EyeOff size={13} />}
                  </button>
                  <span className="ob-field-name ob-field-name-locked">
                    {BUILTIN_FIELD_ICONS[f.name] && React.createElement(BUILTIN_FIELD_ICONS[f.name], { size: 12, style: { marginRight: 6, color: "var(--text-muted)", flexShrink: 0 } })}
                    {f.name === "Sprint" ? "Ends on" : f.name}
                  </span>
                </div>
              ))}
              {customFields.map((f, i) => (
                <div key={i} className="ob-field-row-wrap">
                  <div className="ob-field-row">
                    <GripVertical size={14} className="ob-grip" />
                    <button
                      className={`ob-field-visible ${f.visible ? "on" : ""}`}
                      onClick={() => toggleFieldVisible(i)}
                      title={f.visible ? "Visible in drawer" : "Hidden from drawer"}
                    >
                      {f.visible ? <Eye size={13} /> : <EyeOff size={13} />}
                    </button>
                    {React.createElement(FIELD_TYPE_ICONS[f.field_type] || Type, { size: 12, style: { color: "var(--text-muted)", flexShrink: 0 } })}
                    <input
                      type="text"
                      className="ob-field-name"
                      value={f.name}
                      onChange={(e) => updateField(i, "name", e.target.value)}
                      placeholder="Field name"
                    />
                    {f.source === "hubspot" && (
                      <span className="ob-field-source" title={`From HubSpot: ${f.hubspot_object || ""}${f.source_property ? ` \u203a ${f.source_property}` : ""}`}>
                        HubSpot
                      </span>
                    )}
                    <select
                      className="ob-field-type"
                      value={f.field_type}
                      onChange={(e) => updateField(i, "field_type", e.target.value)}
                      title={FIELD_TYPE_TOOLTIPS[f.field_type] || ""}
                    >
                      <option value="text">Text</option>
                      <option value="number">Number</option>
                      <option value="select">Select</option>
                      <option value="multi_select">Multi-select</option>
                      <option value="date">Date</option>
                      <option value="url">URL</option>
                      <option value="checkbox">Checkbox</option>
                    </select>
                    <span className="ob-field-hint" title={f.description || FIELD_TYPE_TOOLTIPS[f.field_type] || ""}>
                      <Info size={13} />
                    </span>
                    {(f.field_type === "select" || f.field_type === "multi_select") && (
                      <button
                        className={`ob-options-toggle${editingOptionsIdx === i ? " active" : ""}`}
                        onClick={() => setEditingOptionsIdx(editingOptionsIdx === i ? null : i)}
                        title="Edit options"
                      >
                        <List size={13} />
                      </button>
                    )}
                    <button className="ob-remove-btn" onClick={() => removeField(i)} title="Remove">
                      <Trash2 size={13} />
                    </button>
                  </div>
                  {/* Inline options editor for select / multi_select */}
                  {editingOptionsIdx === i && (f.field_type === "select" || f.field_type === "multi_select") && (
                    <div className="ob-options-editor">
                      <div className="ob-options-list">
                        {(f.options || []).length === 0 && (
                          <span className="ob-options-empty">No options yet</span>
                        )}
                        {(f.options || []).map((opt, oi) => (
                          <span key={oi} className="ob-option-tag">
                            {opt}
                            <button type="button" onClick={() => removeOption(i, oi)} className="ob-option-remove">
                              <X size={10} />
                            </button>
                          </span>
                        ))}
                      </div>
                      <div className="ob-options-input-row">
                        <input
                          type="text"
                          className="ob-options-input"
                          placeholder="Type option and press Enter"
                          value={editingOptionsIdx === i ? optionInput : ""}
                          onChange={(e) => setOptionInput(e.target.value)}
                          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addOption(i); } }}
                        />
                        <button type="button" className="ob-options-add-btn" onClick={() => addOption(i)} disabled={!optionInput.trim()}>
                          <Plus size={12} /> Add
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
            <button className="ob-add-btn" onClick={addField}>
              <Plus size={14} />
              Add field
            </button>
          </>
        )}
      </div>
    </div>
  );
}
