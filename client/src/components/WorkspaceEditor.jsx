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
} from "lucide-react";
import {
  getIntegrations,
  getHubSpotAuthUrl,
  getLinearAuthUrl,
  getNotionAuthUrl,
  disconnectIntegration,
  updateWorkspaceSettings,
  createCustomField,
  deleteCustomField,
} from "../services/api";

/* ---------- Constants ---------- */
const HUBSPOT_OBJECT_TYPES = [
  { key: "deals", label: "Deals" },
  { key: "tickets", label: "Tickets" },
  { key: "companies", label: "Companies" },
  { key: "contacts", label: "Contacts" },
];

const DEFAULT_STATUSES = [
  { name: "Backlog", color: "#A0AEC0" },
  { name: "Planned", color: "#4299E1" },
  { name: "In Progress", color: "#ECC94B" },
  { name: "Done", color: "#48BB78" },
];

const DEFAULT_BUILTIN_FIELDS = [
  { name: "Status", builtin: true, visible: true },
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
  const oauthHandledProviders = useRef(new Set());

  // Auto-save debounce ref
  const autoSaveTimer = useRef(null);

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

  /* ---------- Collapsible sections ---------- */
  function toggleCollapse(key) {
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  /* ---------- Status handlers ---------- */
  function updateStatus(index, field, value) {
    const updated = statuses.map((s, i) => (i === index ? { ...s, [field]: value } : s));
    onStatusesChange(updated);
    if (autoSave) {
      const names = updated.filter((s) => s.name.trim()).map((s) => s.name.trim());
      const colors = {};
      updated.forEach((s) => { if (s.name.trim()) colors[s.name.trim()] = s.color; });
      scheduleAutoSave({ custom_statuses: JSON.stringify(names), status_colors: JSON.stringify(colors) });
    }
  }

  function removeStatus(index) {
    const updated = statuses.filter((_, i) => i !== index);
    onStatusesChange(updated);
    if (autoSave) {
      const names = updated.filter((s) => s.name.trim()).map((s) => s.name.trim());
      const colors = {};
      updated.forEach((s) => { if (s.name.trim()) colors[s.name.trim()] = s.color; });
      scheduleAutoSave({ custom_statuses: JSON.stringify(names), status_colors: JSON.stringify(colors) });
    }
  }

  function addStatus() {
    onStatusesChange([...statuses, { name: "", color: "#A0AEC0" }]);
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
    const updated = customFields.map((f, i) => (i === index ? { ...f, [field]: value } : f));
    onCustomFieldsChange(updated);
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
                    <button className="ob-integration-card-header" onClick={() => toggleIntegrationCard("HubSpot")}>
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
                                      <div className="ob-enrichment-edit-row">
                                        <label>Object</label>
                                        <select
                                          value={f.hubspot_object || ""}
                                          onChange={(e) => updateEnrichmentField(globalIdx, { hubspot_object: e.target.value })}
                                        >
                                          <option value="">Select...</option>
                                          {HUBSPOT_OBJECT_TYPES.map((o) => (
                                            <option key={o.key} value={o.key}>{o.label}</option>
                                          ))}
                                        </select>
                                      </div>
                                      <div className="ob-enrichment-edit-row">
                                        <label>Property</label>
                                        <select
                                          value={f.source_property || ""}
                                          onChange={(e) => updateEnrichmentField(globalIdx, { source_property: e.target.value })}
                                        >
                                          <option value="">Select...</option>
                                          {(hubspotSchema?.availableObjects || [])
                                            .find((o) => o.key === f.hubspot_object)
                                            ?.properties?.map((p) => (
                                              <option key={p.name} value={p.name}>{p.label || p.name}</option>
                                            ))}
                                        </select>
                                      </div>
                                      <div className="ob-enrichment-edit-row">
                                        <label>Aggregation</label>
                                        <select
                                          value={f.aggregation || "sum"}
                                          onChange={(e) => updateEnrichmentField(globalIdx, { aggregation: e.target.value })}
                                        >
                                          <option value="sum">Sum</option>
                                          <option value="avg">Average</option>
                                          <option value="count">Count</option>
                                          <option value="min">Min</option>
                                          <option value="max">Max</option>
                                          <option value="latest">Latest</option>
                                        </select>
                                      </div>
                                      <button className="ob-enrichment-edit-done" onClick={() => setEditingEnrichmentField(null)}>
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

                        {/* Disconnect */}
                        <div className="ob-integration-card-section">
                          <button className="ob-disconnect-btn" onClick={handleDisconnectHubSpot}>
                            Disconnect HubSpot
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Linear card — simple */}
              {connectedIntegrations.has("Linear") && (
                <div className="ob-integration-card">
                  <div className="ob-integration-card-header ob-integration-card-header-static">
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
                </div>
              )}

              {/* Notion card — simple */}
              {connectedIntegrations.has("Notion") && (
                <div className="ob-integration-card">
                  <div className="ob-integration-card-header ob-integration-card-header-static">
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

      {/* Statuses — collapsible */}
      <div className="ob-editor-section">
        <button className="ob-editor-heading-btn" onClick={() => toggleCollapse("statuses")}>
          <ChevronDown size={14} className={`ob-collapse-icon${collapsedSections.has("statuses") ? " collapsed" : ""}`} />
          <h3 className="ob-editor-heading">Statuses</h3>
          <span className="ob-editor-count">{statuses.length}</span>
        </button>
        {!collapsedSections.has("statuses") && (
          <>
            <div className="ob-status-list">
              {statuses.map((s, i) => (
                <div key={i} className="ob-status-row">
                  <GripVertical size={14} className="ob-grip" />
                  <input
                    type="color"
                    className="ob-status-color"
                    value={s.color}
                    onChange={(e) => updateStatus(i, "color", e.target.value)}
                  />
                  <input
                    type="text"
                    className="ob-status-name"
                    value={s.name}
                    onChange={(e) => updateStatus(i, "name", e.target.value)}
                    placeholder="Status name"
                  />
                  <button className="ob-remove-btn" onClick={() => removeStatus(i)} title="Remove">
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>
            <button className="ob-add-btn" onClick={addStatus}>
              <Plus size={14} />
              Add status
            </button>
          </>
        )}
      </div>

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
                  <span className="ob-field-name ob-field-name-locked">{f.name}</span>
                </div>
              ))}
              {customFields.map((f, i) => (
                <div key={i} className="ob-field-row">
                  <GripVertical size={14} className="ob-grip" />
                  <button
                    className={`ob-field-visible ${f.visible ? "on" : ""}`}
                    onClick={() => toggleFieldVisible(i)}
                    title={f.visible ? "Visible in drawer" : "Hidden from drawer"}
                  >
                    {f.visible ? <Eye size={13} /> : <EyeOff size={13} />}
                  </button>
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
                  >
                    <option value="text">Text</option>
                    <option value="number">Number</option>
                    <option value="select">Select</option>
                    <option value="multi_select">Multi-select</option>
                    <option value="date">Date</option>
                    <option value="url">URL</option>
                    <option value="checkbox">Checkbox</option>
                  </select>
                  {f.description && (
                    <span className="ob-field-hint" title={f.description}>
                      <Info size={13} />
                    </span>
                  )}
                  <button className="ob-remove-btn" onClick={() => removeField(i)} title="Remove">
                    <Trash2 size={13} />
                  </button>
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
