import React, { useState, useEffect } from "react";
import {
  X, Loader2, Check, ChevronRight, Database, Sparkles, Settings2,
  Trash2, Plus, AlertCircle, RefreshCw,
} from "lucide-react";
import {
  discoverHubSpotSchema,
  suggestHubSpotMappings,
  saveHubSpotMappings,
  getHubSpotMappings,
} from "../services/api";

const STEPS = ["Discover Schema", "AI Suggestions", "Review & Confirm"];
const AGGREGATION_OPTIONS = ["sum", "count", "avg", "max", "min", "count_unique"];
const FIELD_TYPES = ["number", "text"];

export default function HubSpotMappingModal({ integrationId, onClose, onSaved }) {
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Step 1: Schema
  const [schema, setSchema] = useState(null);

  // Step 2: AI suggestions
  const [suggestions, setSuggestions] = useState(null);

  // Step 3: Editable mappings
  const [matchingStrategy, setMatchingStrategy] = useState("property_search");
  const [searchProperties, setSearchProperties] = useState(["dealname"]);
  const [fieldMappings, setFieldMappings] = useState([]);

  const [saving, setSaving] = useState(false);

  // Load existing mappings on mount
  useEffect(() => {
    getHubSpotMappings(integrationId).then((data) => {
      if (data?.field_mappings?.length > 0) {
        setFieldMappings(data.field_mappings);
        setMatchingStrategy(data.matching_strategy || "property_search");
        setSearchProperties(data.matching_config?.search_properties || ["dealname"]);
        // Skip to review step if mappings exist
        setStep(2);
      }
    }).catch(() => {});
  }, [integrationId]);

  /* ---- Step 1: Discover Schema ---- */
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

  /* ---- Step 2: AI Suggestions ---- */
  async function handleGetSuggestions() {
    setLoading(true);
    setError("");
    try {
      const data = await suggestHubSpotMappings(integrationId);
      setSuggestions(data);

      // Pre-populate editable mappings from suggestions
      if (data.matching_strategy) setMatchingStrategy(data.matching_strategy);
      if (data.matching_config?.search_properties) setSearchProperties(data.matching_config.search_properties);
      if (data.field_mappings) {
        setFieldMappings(data.field_mappings.map((m) => ({
          hubspot_property: m.hubspot_property,
          hubspot_object: m.hubspot_object || "deal",
          aggregation: m.aggregation || "count",
          roadway_field_name: m.roadway_field_name || "",
          roadway_field_type: m.roadway_field_type || "number",
          roadway_custom_field_id: m.roadway_custom_field_id || null,
          reasoning: m.reasoning || "",
        })));
      }

      setStep(2);
    } catch (err) {
      setError(err.message || "Failed to get AI suggestions");
    } finally {
      setLoading(false);
    }
  }

  /* ---- Step 3: Save ---- */
  async function handleSave() {
    setSaving(true);
    setError("");
    try {
      await saveHubSpotMappings(integrationId, {
        matching_strategy: matchingStrategy,
        matching_config: {
          search_properties: searchProperties,
          min_confidence: 0.7,
        },
        field_mappings: fieldMappings,
      });
      onSaved?.();
      onClose();
    } catch (err) {
      setError(err.message || "Failed to save mappings");
    } finally {
      setSaving(false);
    }
  }

  function updateMapping(index, field, value) {
    setFieldMappings((prev) =>
      prev.map((m, i) => (i === index ? { ...m, [field]: value } : m))
    );
  }

  function removeMapping(index) {
    setFieldMappings((prev) => prev.filter((_, i) => i !== index));
  }

  function addMapping() {
    setFieldMappings((prev) => [
      ...prev,
      {
        hubspot_property: "",
        hubspot_object: "deal",
        aggregation: "count",
        roadway_field_name: "",
        roadway_field_type: "number",
        roadway_custom_field_id: null,
        reasoning: "",
      },
    ]);
  }

  return (
    <div className="hs-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="hs-modal">
        {/* Header */}
        <div className="hs-modal-header">
          <h3>Configure HubSpot Mapping</h3>
          <button className="btn-icon" onClick={onClose}><X size={16} /></button>
        </div>

        {/* Steps indicator */}
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

        {/* Body */}
        <div className="hs-modal-body">
          {error && (
            <div className="hs-error">
              <AlertCircle size={14} />
              {error}
            </div>
          )}

          {/* Step 0: Discover */}
          {step === 0 && (
            <div className="hs-step-content">
              <div className="hs-step-icon"><Database size={32} /></div>
              <h4>Discover your HubSpot schema</h4>
              <p className="hs-step-desc">
                We'll connect to your HubSpot account and discover your deal properties,
                pipelines, and company data to understand your CRM structure.
              </p>
              <button className="btn btn-primary" onClick={handleDiscoverSchema} disabled={loading}>
                {loading ? <><Loader2 size={14} className="hs-spin" /> Discovering...</> : <><Database size={14} /> Discover Schema</>}
              </button>
            </div>
          )}

          {/* Step 1: AI Suggestions */}
          {step === 1 && (
            <div className="hs-step-content">
              <div className="hs-step-icon"><Sparkles size={32} /></div>
              <h4>Get AI-powered mapping suggestions</h4>
              <p className="hs-step-desc">
                AI will analyze your HubSpot schema and suggest how to map deal properties
                to your roadmap fields for automatic enrichment.
              </p>

              {schema && (
                <div className="hs-schema-summary">
                  <span>{schema.deal_properties?.length || 0} deal properties</span>
                  <span>{schema.company_properties?.length || 0} company properties</span>
                  <span>{schema.pipelines?.length || 0} pipelines</span>
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

          {/* Step 2: Review & Confirm */}
          {step === 2 && (
            <div className="hs-step-content hs-review">
              {/* Matching Strategy */}
              <div className="hs-section">
                <h4><Settings2 size={14} /> Matching Strategy</h4>
                <p className="hs-step-desc">How should we find HubSpot deals for each card?</p>
                <div className="hs-matching-config">
                  <label className="form-label">Search in these deal properties:</label>
                  <div className="hs-search-props">
                    {searchProperties.map((prop, i) => (
                      <div key={i} className="hs-search-prop">
                        <input
                          className="input"
                          value={prop}
                          onChange={(e) => {
                            const next = [...searchProperties];
                            next[i] = e.target.value;
                            setSearchProperties(next);
                          }}
                          placeholder="e.g. dealname"
                        />
                        {searchProperties.length > 1 && (
                          <button className="btn-icon" onClick={() => setSearchProperties((p) => p.filter((_, j) => j !== i))}>
                            <X size={12} />
                          </button>
                        )}
                      </div>
                    ))}
                    <button className="hs-add-btn" onClick={() => setSearchProperties((p) => [...p, ""])}>
                      <Plus size={11} /> Add property
                    </button>
                  </div>
                </div>
              </div>

              {/* Field Mappings */}
              <div className="hs-section">
                <h4><Database size={14} /> Field Mappings</h4>
                <p className="hs-step-desc">Map HubSpot properties to Roadway custom fields.</p>

                {fieldMappings.length === 0 ? (
                  <p className="text-muted" style={{ fontSize: 13 }}>No mappings yet. Add one below.</p>
                ) : (
                  <div className="hs-mappings-table">
                    <div className="hs-mapping-header">
                      <span>HubSpot Property</span>
                      <span>Aggregation</span>
                      <span>Roadway Field Name</span>
                      <span>Type</span>
                      <span></span>
                    </div>
                    {fieldMappings.map((m, i) => (
                      <div key={i} className="hs-mapping-row">
                        <input
                          className="input"
                          value={m.hubspot_property}
                          onChange={(e) => updateMapping(i, "hubspot_property", e.target.value)}
                          placeholder="e.g. amount"
                        />
                        <select
                          className="input"
                          value={m.aggregation}
                          onChange={(e) => updateMapping(i, "aggregation", e.target.value)}
                        >
                          {AGGREGATION_OPTIONS.map((a) => (
                            <option key={a} value={a}>{a}</option>
                          ))}
                        </select>
                        <input
                          className="input"
                          value={m.roadway_field_name}
                          onChange={(e) => updateMapping(i, "roadway_field_name", e.target.value)}
                          placeholder="e.g. Revenue Impact"
                        />
                        <select
                          className="input"
                          value={m.roadway_field_type}
                          onChange={(e) => updateMapping(i, "roadway_field_type", e.target.value)}
                        >
                          {FIELD_TYPES.map((t) => (
                            <option key={t} value={t}>{t}</option>
                          ))}
                        </select>
                        <button className="btn-icon" onClick={() => removeMapping(i)}>
                          <Trash2 size={14} />
                        </button>
                        {m.reasoning && (
                          <div className="hs-mapping-reason">{m.reasoning}</div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                <button className="hs-add-btn" onClick={addMapping}>
                  <Plus size={11} /> Add mapping
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
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
                disabled={saving || fieldMappings.length === 0}
              >
                {saving ? <><Loader2 size={14} className="hs-spin" /> Saving...</> : <><Check size={14} /> Save Mappings</>}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
