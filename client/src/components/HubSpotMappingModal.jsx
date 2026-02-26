import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  X, Loader2, Check, ChevronRight, Database, Sparkles,
  Trash2, Plus, AlertCircle, RefreshCw, Search, Link2, ArrowRight,
} from "lucide-react";
import {
  discoverHubSpotSchema,
  getHubSpotSchema,
  suggestHubSpotMappings,
  saveHubSpotMappings,
  getHubSpotMappings,
  getCards,
  listHubSpotRecords,
  addHubSpotCardLink,
  removeHubSpotCardLink,
  getCardHubSpotData,
} from "../services/api";

const STEPS = ["Discover Schema", "AI Suggestions", "Review & Confirm"];
const AGGREGATION_OPTIONS = ["sum", "count", "avg", "max", "min", "count_unique"];
const DEFAULT_HUBSPOT_OBJECTS = ["deals", "companies", "contacts", "tickets", "products", "line_items", "quotes"];
const FIELD_TYPES = ["number", "text"];

function singularize(label) {
  if (!label) return "";
  const lower = label.toLowerCase();
  if (lower.endsWith("ies")) return label.slice(0, -3) + "y";
  if (lower.endsWith("s") && !lower.endsWith("ss")) return label.slice(0, -1);
  return label;
}

/** Group flat field_mappings into mapping groups (by object + match_property) */
function groupMappings(fieldMappings) {
  const groups = {};
  for (const m of fieldMappings) {
    const matchKey = m.match_property || "__manual__";
    const key = `${m.hubspot_object || "deals"}::${matchKey}`;
    if (!groups[key]) {
      groups[key] = {
        id: `g-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        hubspot_object: m.hubspot_object || "deals",
        selectedProperties: [],
        propertyConfigs: [],
        match_property: m.match_property || "__manual__",
        wizardStep: "done",
        propFilter: "",
      };
    }
    groups[key].selectedProperties.push(m.hubspot_property);
    groups[key].propertyConfigs.push({
      hubspot_property: m.hubspot_property,
      roadway_field_name: m.roadway_field_name || "",
      aggregation: m.aggregation || "count",
      roadway_field_type: m.roadway_field_type || "number",
    });
  }
  return Object.values(groups);
}

/** Flatten groups back to individual field_mappings for save */
function flattenGroups(groups) {
  return groups
    .filter((g) => g.wizardStep === "done")
    .flatMap((g) =>
      g.propertyConfigs.map((pc) => ({
        hubspot_object: g.hubspot_object,
        hubspot_property: pc.hubspot_property,
        match_property: g.match_property === "__manual__" ? null : g.match_property,
        aggregation: pc.aggregation,
        roadway_field_name: pc.roadway_field_name,
        roadway_field_type: pc.roadway_field_type || "number",
      }))
    );
}

export default function HubSpotMappingModal({ integrationId, onClose, onSaved }) {
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [schema, setSchema] = useState(null);
  const [mappingGroups, setMappingGroups] = useState([]);
  const [saving, setSaving] = useState(false);

  // Step 3: Manual linking
  const [showLinkingTable, setShowLinkingTable] = useState(false);

  const availableObjects = schema?.objects ? Object.keys(schema.objects) : DEFAULT_HUBSPOT_OBJECTS;
  const objectLabel = (key) => schema?.objects?.[key]?.label || key.replace(/_/g, " ");
  const getObjectProperties = (objectKey) => schema?.objects?.[objectKey]?.properties || [];

  const hasManualGroups = mappingGroups.some(
    (g) => g.wizardStep === "done" && (g.match_property === "__manual__" || !g.match_property)
  );

  useEffect(() => {
    getHubSpotMappings(integrationId).then((data) => {
      if (data?.field_mappings?.length > 0) {
        setMappingGroups(groupMappings(data.field_mappings));
        setStep(2);
      }
    }).catch(() => {});
    getHubSpotSchema(integrationId).then((data) => {
      if (data?.objects) setSchema(data);
    }).catch(() => {});
  }, [integrationId]);

  async function handleDiscoverSchema() {
    setLoading(true);
    setError("");
    try {
      const data = await discoverHubSpotSchema(integrationId);
      setSchema(data);
      setStep(1);
    } catch (err) {
      setError(err.message || "Failed to discover schema");
    } finally {
      setLoading(false);
    }
  }

  async function handleGetSuggestions() {
    setLoading(true);
    setError("");
    try {
      const data = await suggestHubSpotMappings(integrationId);
      if (data.field_mappings) {
        setMappingGroups(groupMappings(data.field_mappings));
      }
      setStep(2);
    } catch (err) {
      setError(err.message || "Failed to get AI suggestions");
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    setError("");
    try {
      const fieldMappings = flattenGroups(mappingGroups);
      await saveHubSpotMappings(integrationId, { field_mappings: fieldMappings });
      onSaved?.();

      // If there are manual groups, show the linking table
      if (hasManualGroups) {
        setShowLinkingTable(true);
      } else {
        onClose();
      }
    } catch (err) {
      setError(err.message || "Failed to save mappings");
    } finally {
      setSaving(false);
    }
  }

  function addGroup() {
    setMappingGroups((prev) => [
      ...prev,
      {
        id: `g-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        hubspot_object: availableObjects[0] || "deals",
        selectedProperties: [],
        propertyConfigs: [],
        match_property: null,
        wizardStep: 0,
        propFilter: "",
      },
    ]);
  }

  function removeGroup(id) {
    setMappingGroups((prev) => prev.filter((g) => g.id !== id));
  }

  function updateGroup(id, updates) {
    setMappingGroups((prev) => prev.map((g) => (g.id === id ? { ...g, ...updates } : g)));
  }

  const completedGroups = mappingGroups.filter((g) => g.wizardStep === "done");

  // Get manual group object types for the linking table
  const manualObjectTypes = mappingGroups
    .filter((g) => g.wizardStep === "done" && (g.match_property === "__manual__" || !g.match_property))
    .map((g) => g.hubspot_object);

  /* ---- Linking table view ---- */
  if (showLinkingTable) {
    return (
      <div className="hs-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
        <div className="hs-modal hs-modal-wide">
          <div className="hs-modal-header">
            <h3>Link HubSpot Records to Cards</h3>
            <button className="btn-icon" onClick={onClose}><X size={16} /></button>
          </div>
          <div className="hs-modal-body">
            <BulkLinkingTable
              integrationId={integrationId}
              objectTypes={manualObjectTypes}
              objectLabel={objectLabel}
            />
          </div>
          <div className="hs-modal-footer">
            <div style={{ flex: 1 }} />
            <button className="btn btn-secondary" onClick={() => setShowLinkingTable(false)}>
              Back to mappings
            </button>
            <button className="btn btn-primary" onClick={onClose}>
              <Check size={14} /> Done
            </button>
          </div>
        </div>
      </div>
    );
  }

  /* ---- Main modal ---- */
  return (
    <div className="hs-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="hs-modal">
        <div className="hs-modal-header">
          <h3>Configure HubSpot Mapping</h3>
          <button className="btn-icon" onClick={onClose}><X size={16} /></button>
        </div>

        <div className="hs-steps">
          {STEPS.map((s, i) => (
            <div key={s} className={`hs-step ${i === step ? "active" : ""} ${i < step ? "done" : ""}`}>
              <span className="hs-step-number">
                {i < step ? <Check size={12} /> : i + 1}
              </span>
              <span className="hs-step-label">{s}</span>
              {i < STEPS.length - 1 && <ChevronRight size={14} className="hs-step-arrow" />}
            </div>
          ))}
        </div>

        <div className="hs-modal-body">
          {error && (
            <div className="hs-error">
              <AlertCircle size={14} />
              {error}
            </div>
          )}

          {step === 0 && (
            <div className="hs-step-content">
              <div className="hs-step-icon"><Database size={32} /></div>
              <h4>Discover your HubSpot schema</h4>
              <p className="hs-step-desc">
                We'll connect to your HubSpot account and discover all your
                object types, properties, and pipelines.
              </p>
              <button className="btn btn-primary" onClick={handleDiscoverSchema} disabled={loading}>
                {loading ? <><Loader2 size={14} className="hs-spin" /> Discovering...</> : <><Database size={14} /> Discover Schema</>}
              </button>
            </div>
          )}

          {step === 1 && (
            <div className="hs-step-content">
              <div className="hs-step-icon"><Sparkles size={32} /></div>
              <h4>Get AI-powered mapping suggestions</h4>
              <p className="hs-step-desc">
                AI will analyze your HubSpot schema and suggest how to map
                properties to your roadmap fields for automatic enrichment.
              </p>

              {schema?.objects && (
                <div className="hs-schema-summary">
                  {Object.entries(schema.objects)
                    .sort((a, b) => (b[1].properties?.length || 0) - (a[1].properties?.length || 0))
                    .slice(0, 3)
                    .map(([key, obj]) => (
                      <span key={key}>{obj.properties?.length || 0} {obj.label?.toLowerCase() || key}</span>
                    ))}
                  {Object.keys(schema.objects).length > 3 && (
                    <span className="text-muted">+{Object.keys(schema.objects).length - 3} more</span>
                  )}
                </div>
              )}

              <div style={{ display: "flex", gap: 8 }}>
                <button className="btn btn-primary" onClick={handleGetSuggestions} disabled={loading}>
                  {loading ? <><Loader2 size={14} className="hs-spin" /> Analyzing...</> : <><Sparkles size={14} /> Get AI Suggestions</>}
                </button>
                <button className="btn btn-secondary" onClick={() => { setStep(2); }}>
                  Skip — set up manually
                </button>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="hs-step-content hs-review">
              {mappingGroups.length === 0 ? (
                <p className="text-muted" style={{ fontSize: 13, textAlign: "center", padding: "20px 0" }}>
                  No mappings yet. Click below to add your first one.
                </p>
              ) : (
                <div className="hs-mapping-groups">
                  {mappingGroups.map((group) => (
                    <MappingGroupCard
                      key={group.id}
                      group={group}
                      schema={schema}
                      availableObjects={availableObjects}
                      objectLabel={objectLabel}
                      getObjectProperties={getObjectProperties}
                      onUpdate={(updates) => updateGroup(group.id, updates)}
                      onRemove={() => removeGroup(group.id)}
                    />
                  ))}
                </div>
              )}

              <button className="hs-add-btn" onClick={addGroup}>
                <Plus size={11} /> Add mapping
              </button>
            </div>
          )}
        </div>

        <div className="hs-modal-footer">
          {step > 0 && step < 2 && (
            <button className="btn btn-secondary" onClick={() => setStep(step - 1)}>
              Back
            </button>
          )}
          <div style={{ flex: 1 }} />
          {step === 2 && (
            <>
              <button className="btn btn-secondary" onClick={() => setStep(0)}>
                <RefreshCw size={14} /> Re-discover
              </button>
              <button
                className="btn btn-primary"
                onClick={handleSave}
                disabled={saving || completedGroups.length === 0}
              >
                {saving ? (
                  <><Loader2 size={14} className="hs-spin" /> Saving...</>
                ) : hasManualGroups ? (
                  <><ArrowRight size={14} /> Save & Link Records</>
                ) : (
                  <><Check size={14} /> Save Mappings</>
                )}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ================================================================== */
/*  Bulk linking table                                                  */
/* ================================================================== */

function getRecordName(record) {
  return record.properties?.dealname
    || record.properties?.name
    || record.properties?.subject
    || record.properties?.firstname
    || `Record ${record.id}`;
}

function fuzzyMatch(cardName, recordName) {
  if (!cardName || !recordName) return false;
  const cardWords = cardName.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
  const recordLower = recordName.toLowerCase();
  return cardWords.some((word) => recordLower.includes(word));
}

function BulkLinkingTable({ integrationId, objectTypes, objectLabel }) {
  const [cards, setCards] = useState([]);
  const [allRecords, setAllRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [cardLinks, setCardLinks] = useState({});
  const [expandedCardId, setExpandedCardId] = useState(null);
  const [recordFilter, setRecordFilter] = useState("");
  const [cardFilter, setCardFilter] = useState("");

  // Load cards + all HubSpot records once on mount
  useEffect(() => {
    const user = JSON.parse(localStorage.getItem("user") || "{}");
    const roadmapId = user.last_roadmap_id;
    if (!roadmapId) {
      setLoading(false);
      return;
    }

    Promise.all([
      getCards(roadmapId).then((data) => Array.isArray(data) ? data : data?.cards || []),
      // Load records for each manual object type
      ...objectTypes.map((ot) =>
        listHubSpotRecords(integrationId, ot, 200)
          .then((data) => (data?.records || []).map((r) => ({ ...r, _objectType: ot })))
          .catch(() => [])
      ),
    ])
      .then(([cardList, ...recordArrays]) => {
        setCards(cardList);
        setAllRecords(recordArrays.flat());
        // Load existing links for each card
        cardList.forEach((card) => {
          getCardHubSpotData(card.id)
            .then((linkData) => {
              if (linkData?.links?.length > 0) {
                setCardLinks((prev) => ({ ...prev, [card.id]: linkData.links }));
              }
            })
            .catch(() => {});
        });
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [integrationId, objectTypes]);

  // Reset record filter when switching cards
  useEffect(() => {
    setRecordFilter("");
  }, [expandedCardId]);

  const filteredCards = useMemo(() => {
    if (!cardFilter) return cards;
    const q = cardFilter.toLowerCase();
    return cards.filter((c) => (c.title || c.name || "").toLowerCase().includes(q));
  }, [cards, cardFilter]);

  // Sort records: fuzzy matches first, then alphabetical. Filter by search.
  function getSortedRecords(cardName, linkedIds) {
    let records = allRecords.filter((r) => !linkedIds.has(r.id));

    // Apply filter
    if (recordFilter) {
      const q = recordFilter.toLowerCase();
      records = records.filter((r) => getRecordName(r).toLowerCase().includes(q));
    }

    // Sort: fuzzy matches to top
    return records.sort((a, b) => {
      const aMatch = fuzzyMatch(cardName, getRecordName(a)) ? 0 : 1;
      const bMatch = fuzzyMatch(cardName, getRecordName(b)) ? 0 : 1;
      if (aMatch !== bMatch) return aMatch - bMatch;
      return getRecordName(a).localeCompare(getRecordName(b));
    });
  }

  function toggleExpand(cardId) {
    setExpandedCardId((prev) => (prev === cardId ? null : cardId));
  }

  async function handleToggleLink(cardId, record, isLinked, linkId) {
    if (isLinked) {
      // Unlink
      try {
        await removeHubSpotCardLink(cardId, linkId);
        setCardLinks((prev) => ({
          ...prev,
          [cardId]: (prev[cardId] || []).filter((l) => l.id !== linkId),
        }));
      } catch (e) { console.error("[HS] unlink error:", e); }
    } else {
      // Link
      try {
        const objectType = record._objectType || objectTypes[0] || "deals";
        const recordName = getRecordName(record);

        const result = await addHubSpotCardLink(cardId, {
          integration_id: integrationId,
          hubspot_object_type: objectType,
          hubspot_object_id: record.id,
          hubspot_object_name: recordName,
        });

        const newLink = {
          id: result?.id || `temp-${Date.now()}`,
          hubspot_object_type: objectType,
          hubspot_object_id: record.id,
          hubspot_object_name: recordName,
        };
        setCardLinks((prev) => ({
          ...prev,
          [cardId]: [...(prev[cardId] || []), newLink],
        }));
      } catch (e) { console.error("[HS] link error:", e); }
    }
  }

  if (loading) {
    return (
      <div className="hs-step-content" style={{ textAlign: "center", padding: 40 }}>
        <Loader2 size={24} className="hs-spin" />
        <p className="text-muted" style={{ marginTop: 8 }}>Loading records...</p>
      </div>
    );
  }

  if (cards.length === 0) {
    return (
      <div className="hs-step-content" style={{ textAlign: "center", padding: 40 }}>
        <p className="text-muted">No cards found. Open a roadmap and add some cards first.</p>
      </div>
    );
  }

  return (
    <div className="hs-bulk-link">
      <p className="hs-bulk-link-desc">
        Click a feature card to expand it, then check the HubSpot records that belong to it.
        Records that look like a match are shown first.
      </p>

      <div className="hs-prop-search" style={{ marginBottom: 12 }}>
        <Search size={13} />
        <input
          className="input"
          placeholder="Filter cards..."
          value={cardFilter}
          onChange={(e) => setCardFilter(e.target.value)}
        />
      </div>

      <div className="hs-bulk-link-list">
        {filteredCards.map((card) => {
          const links = cardLinks[card.id] || [];
          const isExpanded = expandedCardId === card.id;
          const cardName = card.title || card.name || "";
          const linkedIds = new Set(links.map((l) => l.hubspot_object_id));
          const sortedRecords = isExpanded ? getSortedRecords(cardName, linkedIds) : [];
          const hasSuggestions = isExpanded && sortedRecords.length > 0 && fuzzyMatch(cardName, getRecordName(sortedRecords[0]));

          return (
            <div key={card.id} className={`hs-bulk-link-row ${isExpanded ? "expanded" : ""}`}>
              <button
                className={`hs-bulk-link-card-header ${links.length === 0 ? "unlinked" : ""}`}
                onClick={() => toggleExpand(card.id)}
              >
                <ChevronRight size={14} className={`hs-bulk-link-chevron ${isExpanded ? "open" : ""}`} />
                <span className="hs-bulk-link-card-name">{cardName}</span>
                {links.length > 0 ? (
                  <span className="hs-bulk-link-count">{links.length} linked</span>
                ) : (
                  <span className="hs-bulk-link-count-zero">0 linked</span>
                )}
              </button>

              {isExpanded && (
                <div className="hs-bulk-link-expanded">
                  {/* Already-linked as chips */}
                  {links.length > 0 && (
                    <div className="hs-bulk-link-section">
                      <span className="hs-bulk-link-section-label">Linked</span>
                      <div className="hs-bulk-link-chips">
                        {links.map((link) => (
                          <span key={link.id} className="hs-bulk-link-chip linked">
                            {link.hubspot_object_name}
                            <button
                              className="hs-bulk-link-chip-x"
                              onClick={() => handleToggleLink(card.id, null, true, link.id)}
                            >
                              <X size={10} />
                            </button>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Multi-select record list */}
                  <div className="hs-bulk-link-section">
                    <div className="hs-bulk-link-search">
                      <Search size={13} />
                      <input
                        className="input"
                        placeholder="Filter records..."
                        value={recordFilter}
                        onChange={(e) => setRecordFilter(e.target.value)}
                      />
                    </div>

                    <div className="hs-bulk-link-checklist">
                      {hasSuggestions && (
                        <div className="hs-bulk-link-section-label" style={{ padding: "6px 10px 2px" }}>
                          Suggested matches
                        </div>
                      )}
                      {sortedRecords.map((r, idx) => {
                        const name = getRecordName(r);
                        const isSuggestion = fuzzyMatch(cardName, name);
                        // Insert divider between suggestions and other records
                        const showDivider = hasSuggestions && idx > 0
                          && fuzzyMatch(cardName, getRecordName(sortedRecords[idx - 1]))
                          && !isSuggestion;

                        return (
                          <React.Fragment key={r.id}>
                            {showDivider && (
                              <div className="hs-bulk-link-divider">
                                <span>All records</span>
                              </div>
                            )}
                            <label className={`hs-bulk-link-check-item ${isSuggestion ? "suggested" : ""} ${linkedIds.has(r.id) ? "is-linked" : ""}`}>
                              <input
                                type="checkbox"
                                checked={linkedIds.has(r.id)}
                                onChange={() => {
                                  const isLinked = linkedIds.has(r.id);
                                  const existingLink = isLinked
                                    ? links.find((l) => l.hubspot_object_id === r.id)
                                    : null;
                                  handleToggleLink(card.id, r, isLinked, existingLink?.id || null);
                                }}
                              />
                              <span>{name}</span>
                              <span className="hs-bulk-link-type-badge">{singularize(r._objectType || objectTypes[0])}</span>
                            </label>
                          </React.Fragment>
                        );
                      })}
                      {sortedRecords.length === 0 && (
                        <p className="text-muted" style={{ fontSize: 12, padding: 10 }}>
                          {recordFilter ? "No records match your filter." : "No records available."}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ================================================================== */
/*  Mini wizard card for each mapping group                            */
/* ================================================================== */

function MappingGroupCard({ group, schema, availableObjects, objectLabel, getObjectProperties, onUpdate, onRemove }) {
  const { wizardStep, hubspot_object, selectedProperties, propertyConfigs, match_property, propFilter } = group;

  const properties = getObjectProperties(hubspot_object);
  const objLabel = objectLabel(hubspot_object);
  const objSingular = singularize(objLabel).toLowerCase();

  const filteredProps = useMemo(() => {
    if (!propFilter) return properties;
    const q = propFilter.toLowerCase();
    return properties.filter((p) =>
      p.label.toLowerCase().includes(q) || p.name.toLowerCase().includes(q)
    );
  }, [properties, propFilter]);

  function toggleProperty(propName) {
    const next = selectedProperties.includes(propName)
      ? selectedProperties.filter((p) => p !== propName)
      : [...selectedProperties, propName];
    onUpdate({ selectedProperties: next });
  }

  function goToStep1() {
    const existingMap = {};
    propertyConfigs.forEach((pc) => { existingMap[pc.hubspot_property] = pc; });

    const newConfigs = selectedProperties.map((propName) => {
      if (existingMap[propName]) return existingMap[propName];
      const meta = properties.find((p) => p.name === propName);
      const isNumeric = meta?.type === "number" || meta?.fieldType === "number";
      return {
        hubspot_property: propName,
        roadway_field_name: meta?.label || propName,
        aggregation: isNumeric ? "sum" : "count",
        roadway_field_type: isNumeric ? "number" : "number",
      };
    });

    onUpdate({ propertyConfigs: newConfigs, wizardStep: 1 });
  }

  function updateConfig(index, field, value) {
    const next = [...propertyConfigs];
    next[index] = { ...next[index], [field]: value };
    onUpdate({ propertyConfigs: next });
  }

  // Sort properties so enum/multi-select types appear first (more likely to be feature tags)
  const linkableProperties = useMemo(() => {
    return [...properties].sort((a, b) => {
      const aEnum = a.type === "enumeration" || (a.options && a.options.length > 0) ? 0 : 1;
      const bEnum = b.type === "enumeration" || (b.options && b.options.length > 0) ? 0 : 1;
      return aEnum - bEnum;
    });
  }, [properties]);

  /* ---- Done / summary view ---- */
  if (wizardStep === "done") {
    return (
      <div className="hs-mapping-card hs-mapping-done">
        <div className="hs-mapping-done-header">
          <div>
            <strong>{objLabel}</strong>
            <span className="hs-mapping-done-count">
              {propertyConfigs.length} field{propertyConfigs.length !== 1 ? "s" : ""}
            </span>
          </div>
          <div className="hs-mapping-done-actions">
            <button className="btn-icon" onClick={() => onUpdate({ wizardStep: 0 })} title="Edit">
              <RefreshCw size={13} />
            </button>
            <button className="btn-icon" onClick={onRemove} title="Delete">
              <Trash2 size={13} />
            </button>
          </div>
        </div>
        <div className="hs-mapping-done-fields">
          {propertyConfigs.map((pc) => (
            <span key={pc.hubspot_property} className="hs-mapping-done-chip">
              {pc.roadway_field_name} <span className="text-muted">({pc.aggregation})</span>
            </span>
          ))}
        </div>
        <div className="hs-mapping-done-link">
          <Link2 size={12} />
          {match_property && match_property !== "__manual__" ? (
            <>Linked by: <strong>{properties.find((p) => p.name === match_property)?.label || match_property}</strong></>
          ) : (
            <>Manual linking</>
          )}
        </div>
      </div>
    );
  }

  /* ---- Active wizard ---- */
  return (
    <div className="hs-mapping-card hs-wizard-card">
      <button className="hs-mapping-card-delete btn-icon" onClick={onRemove}>
        <Trash2 size={14} />
      </button>

      {/* Mini step indicator */}
      <div className="hs-wizard-steps">
        {["What to pull", "How to display", "Connect to features"].map((label, i) => (
          <div key={i} className={`hs-wizard-dot ${wizardStep === i ? "active" : ""} ${typeof wizardStep === "number" && wizardStep > i ? "done" : ""}`}>
            <span className="hs-wizard-dot-num">
              {typeof wizardStep === "number" && wizardStep > i ? <Check size={10} /> : i + 1}
            </span>
            <span className="hs-wizard-dot-label">{label}</span>
          </div>
        ))}
      </div>

      {/* Step 0: What to pull */}
      {wizardStep === 0 && (
        <div className="hs-wizard-body">
          <div className="hs-mapping-field">
            <label className="hs-mapping-label">HubSpot Object</label>
            <select
              className="input"
              value={hubspot_object}
              onChange={(e) => onUpdate({
                hubspot_object: e.target.value,
                selectedProperties: [],
                propertyConfigs: [],
                propFilter: "",
              })}
            >
              {availableObjects.map((o) => (
                <option key={o} value={o}>{objectLabel(o)}</option>
              ))}
            </select>
          </div>

          {properties.length > 0 && (
            <div className="hs-mapping-field" style={{ marginTop: 12 }}>
              <label className="hs-mapping-label">
                Select properties to pull
                {selectedProperties.length > 0 && (
                  <span className="hs-selected-count">{selectedProperties.length} selected</span>
                )}
              </label>
              <div className="hs-prop-search">
                <Search size={13} />
                <input
                  className="input"
                  placeholder="Search properties..."
                  value={propFilter || ""}
                  onChange={(e) => onUpdate({ propFilter: e.target.value })}
                />
              </div>
              <div className="hs-prop-list">
                {filteredProps.map((p) => (
                  <label key={p.name} className="hs-prop-item">
                    <input
                      type="checkbox"
                      checked={selectedProperties.includes(p.name)}
                      onChange={() => toggleProperty(p.name)}
                    />
                    <span className="hs-prop-label">{p.label}</span>
                    <span className="hs-prop-name">{p.name}</span>
                  </label>
                ))}
                {filteredProps.length === 0 && (
                  <p className="text-muted" style={{ fontSize: 12, padding: 8 }}>No properties match your search.</p>
                )}
              </div>
            </div>
          )}

          <div className="hs-wizard-nav">
            <div />
            <button
              className="btn btn-primary btn-sm"
              disabled={selectedProperties.length === 0}
              onClick={goToStep1}
            >
              Next <ArrowRight size={13} />
            </button>
          </div>
        </div>
      )}

      {/* Step 1: How to display in Roadway */}
      {wizardStep === 1 && (
        <div className="hs-wizard-body">
          <p className="hs-wizard-desc">
            For each property, choose a name and how to calculate the value across all matching records.
          </p>
          <div className="hs-config-list">
            {propertyConfigs.map((pc, i) => {
              const meta = properties.find((p) => p.name === pc.hubspot_property);
              return (
                <div key={pc.hubspot_property} className="hs-config-row">
                  <span className="hs-config-source">{meta?.label || pc.hubspot_property}</span>
                  <ArrowRight size={12} className="hs-config-arrow" />
                  <input
                    className="input"
                    value={pc.roadway_field_name}
                    onChange={(e) => updateConfig(i, "roadway_field_name", e.target.value)}
                    placeholder="Field name in Roadway"
                  />
                  <select
                    className="input"
                    value={pc.aggregation}
                    onChange={(e) => updateConfig(i, "aggregation", e.target.value)}
                  >
                    {AGGREGATION_OPTIONS.map((a) => <option key={a} value={a}>{a}</option>)}
                  </select>
                  <select
                    className="input"
                    value={pc.roadway_field_type}
                    onChange={(e) => updateConfig(i, "roadway_field_type", e.target.value)}
                  >
                    {FIELD_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
              );
            })}
          </div>

          <div className="hs-wizard-nav">
            <button className="btn btn-secondary btn-sm" onClick={() => onUpdate({ wizardStep: 0 })}>
              Back
            </button>
            <button className="btn btn-primary btn-sm" onClick={() => onUpdate({ wizardStep: 2 })}>
              Next <ArrowRight size={13} />
            </button>
          </div>
        </div>
      )}

      {/* Step 2: Connect to features */}
      {wizardStep === 2 && (
        <div className="hs-wizard-body">
          <div className="hs-link-explanation">
            <p>
              To show this data on the right feature cards, Roadway needs to know
              which <strong>{objSingular}</strong> belongs to which feature.
            </p>
            <p>
              Is there a property in your {objLabel.toLowerCase()} where the value
              is a feature name? For example, a field like <em>"Product Area"</em>,{" "}
              <em>"Feature Interest"</em>, or <em>"Category"</em> with values
              like <em>"SSO"</em> or <em>"Dark Mode"</em> that match your card
              names in Roadway.
            </p>
          </div>

          <div className="hs-link-options">
            <label className={`hs-link-option ${match_property && match_property !== "__manual__" ? "selected" : ""}`}>
              <input
                type="radio"
                name={`link-${group.id}`}
                checked={match_property != null && match_property !== "__manual__"}
                onChange={() => onUpdate({ match_property: "_pending_" })}
              />
              <div className="hs-link-option-body">
                <strong>Yes — select the property that contains feature names</strong>
                {match_property != null && match_property !== "__manual__" && (
                  <select
                    className="input"
                    value={match_property === "_pending_" ? "" : match_property}
                    onChange={(e) => onUpdate({ match_property: e.target.value || "_pending_" })}
                    style={{ marginTop: 8 }}
                  >
                    <option value="">-- Select property --</option>
                    {linkableProperties.map((p) => (
                      <option key={p.name} value={p.name}>
                        {p.label} ({p.name}){p.type === "enumeration" ? " *" : ""}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </label>

            <label className={`hs-link-option ${match_property === "__manual__" ? "selected" : ""}`}>
              <input
                type="radio"
                name={`link-${group.id}`}
                checked={match_property === "__manual__"}
                onChange={() => onUpdate({ match_property: "__manual__" })}
              />
              <div className="hs-link-option-body">
                <strong>No — I'll link records to cards manually</strong>
                <p className="text-muted" style={{ fontSize: 12, marginTop: 4 }}>
                  After saving, you'll see a mapping table where you can
                  search and connect HubSpot records to each feature card.
                </p>
              </div>
            </label>
          </div>

          <div className="hs-wizard-nav">
            <button className="btn btn-secondary btn-sm" onClick={() => onUpdate({ wizardStep: 1 })}>
              Back
            </button>
            <button
              className="btn btn-primary btn-sm"
              disabled={
                match_property == null ||
                match_property === "_pending_"
              }
              onClick={() => onUpdate({ wizardStep: "done" })}
            >
              <Check size={13} /> Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
