import React, { useState, useEffect, useMemo } from "react";
import {
  X, Loader2, Check, ChevronRight, Database, Sparkles,
  Trash2, Plus, AlertCircle, RefreshCw, Search, ArrowRight,
} from "lucide-react";
import {
  discoverNotionSchema,
  getNotionSchema,
  suggestNotionMappings,
  saveNotionMappings,
  getNotionMappings,
} from "../services/api";

const STEPS = ["Discover Schema", "AI Suggestions", "Review & Confirm"];
const AGGREGATION_OPTIONS = ["sum", "count", "avg", "max", "min", "count_unique"];
const FIELD_TYPES = ["number", "text"];

export default function NotionMappingModal({ integrationId, onClose, onSaved }) {
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [databases, setDatabases] = useState(null);
  const [selectedDbId, setSelectedDbId] = useState(null);
  const [mappings, setMappings] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getNotionMappings(integrationId).then((data) => {
      if (data?.field_mappings?.length > 0) {
        setMappings(data.field_mappings);
        setSelectedDbId(data.field_mappings[0]?.notion_database_id || null);
        setStep(2);
      }
    }).catch(() => {});
    getNotionSchema(integrationId).then((data) => {
      if (data?.databases) setDatabases(data.databases);
    }).catch(() => {});
  }, [integrationId]);

  async function handleDiscoverSchema() {
    setLoading(true);
    setError("");
    try {
      const data = await discoverNotionSchema(integrationId);
      setDatabases(data.databases);
      setStep(1);
    } catch (err) {
      setError(err.message || "Failed to discover schema");
    } finally {
      setLoading(false);
    }
  }

  async function handleGetSuggestions() {
    if (!selectedDbId) {
      setError("Select a database first");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const data = await suggestNotionMappings(integrationId, selectedDbId);
      if (data.field_mappings) {
        setMappings(data.field_mappings.map((m) => ({
          ...m,
          notion_database_id: m.notion_database_id || selectedDbId,
        })));
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
      await saveNotionMappings(integrationId, { field_mappings: mappings });
      onSaved?.();
      onClose();
    } catch (err) {
      setError(err.message || "Failed to save mappings");
    } finally {
      setSaving(false);
    }
  }

  function addMapping() {
    const db = selectedDbId && databases?.[selectedDbId];
    const properties = db ? Object.keys(db.properties || {}) : [];
    setMappings((prev) => [
      ...prev,
      {
        notion_property: properties[0] || "",
        notion_database_id: selectedDbId || "",
        aggregation: "count",
        roadway_field_name: "",
        roadway_field_type: "number",
      },
    ]);
  }

  function removeMapping(index) {
    setMappings((prev) => prev.filter((_, i) => i !== index));
  }

  function updateMapping(index, field, value) {
    setMappings((prev) => prev.map((m, i) => (i === index ? { ...m, [field]: value } : m)));
  }

  const selectedDb = selectedDbId && databases?.[selectedDbId];
  const dbProperties = selectedDb ? Object.entries(selectedDb.properties || {}) : [];
  const dbList = databases ? Object.values(databases) : [];

  return (
    <div className="hs-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="hs-modal">
        <div className="hs-modal-header">
          <h3>Configure Notion Mapping</h3>
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

          {/* Step 0: Discover */}
          {step === 0 && (
            <div className="hs-step-content">
              <div className="hs-step-icon"><Database size={32} /></div>
              <h4>Discover your Notion databases</h4>
              <p className="hs-step-desc">
                We'll connect to your Notion workspace and discover all shared
                databases and their properties.
              </p>
              <button className="btn btn-primary" onClick={handleDiscoverSchema} disabled={loading}>
                {loading ? <><Loader2 size={14} className="hs-spin" /> Discovering...</> : <><Database size={14} /> Discover Databases</>}
              </button>
            </div>
          )}

          {/* Step 1: Select DB + AI suggestions */}
          {step === 1 && (
            <div className="hs-step-content">
              <div className="hs-step-icon"><Sparkles size={32} /></div>
              <h4>Select a database and get AI suggestions</h4>
              <p className="hs-step-desc">
                Choose which Notion database to map, then AI will suggest field mappings.
              </p>

              {dbList.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <label className="form-label" style={{ marginBottom: 6, display: "block" }}>Notion Database</label>
                  <select
                    className="input"
                    value={selectedDbId || ""}
                    onChange={(e) => setSelectedDbId(e.target.value)}
                    style={{ width: "100%" }}
                  >
                    <option value="">-- Select a database --</option>
                    {dbList.map((db) => (
                      <option key={db.id} value={db.id}>
                        {db.icon ? `${db.icon} ` : ""}{db.title} ({Object.keys(db.properties || {}).length} properties)
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {selectedDb && (
                <div className="hs-schema-summary">
                  {dbProperties.slice(0, 5).map(([name, prop]) => (
                    <span key={name}>{name} ({prop.type})</span>
                  ))}
                  {dbProperties.length > 5 && (
                    <span className="text-muted">+{dbProperties.length - 5} more</span>
                  )}
                </div>
              )}

              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <button className="btn btn-primary" onClick={handleGetSuggestions} disabled={loading || !selectedDbId}>
                  {loading ? <><Loader2 size={14} className="hs-spin" /> Analyzing...</> : <><Sparkles size={14} /> Get AI Suggestions</>}
                </button>
                <button className="btn btn-secondary" onClick={() => setStep(2)} disabled={!selectedDbId}>
                  Skip — set up manually
                </button>
              </div>
            </div>
          )}

          {/* Step 2: Review mappings */}
          {step === 2 && (
            <div className="hs-step-content hs-review">
              {selectedDb && (
                <p className="text-muted" style={{ fontSize: 12, marginBottom: 12 }}>
                  Database: <strong>{selectedDb.icon ? `${selectedDb.icon} ` : ""}{selectedDb.title}</strong>
                </p>
              )}

              {mappings.length === 0 ? (
                <p className="text-muted" style={{ fontSize: 13, textAlign: "center", padding: "20px 0" }}>
                  No mappings yet. Click below to add your first one.
                </p>
              ) : (
                <div className="hs-config-list">
                  {mappings.map((m, i) => (
                    <div key={i} className="hs-config-row">
                      <select
                        className="input"
                        value={m.notion_property}
                        onChange={(e) => updateMapping(i, "notion_property", e.target.value)}
                      >
                        <option value="">-- Property --</option>
                        {dbProperties.map(([name, prop]) => (
                          <option key={name} value={name}>{name} ({prop.type})</option>
                        ))}
                      </select>
                      <ArrowRight size={12} className="hs-config-arrow" />
                      <input
                        className="input"
                        value={m.roadway_field_name}
                        onChange={(e) => updateMapping(i, "roadway_field_name", e.target.value)}
                        placeholder="Field name in Roadway"
                      />
                      <select
                        className="input"
                        value={m.aggregation}
                        onChange={(e) => updateMapping(i, "aggregation", e.target.value)}
                      >
                        {AGGREGATION_OPTIONS.map((a) => <option key={a} value={a}>{a}</option>)}
                      </select>
                      <select
                        className="input"
                        value={m.roadway_field_type}
                        onChange={(e) => updateMapping(i, "roadway_field_type", e.target.value)}
                      >
                        {FIELD_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                      </select>
                      <button className="btn-icon" onClick={() => removeMapping(i)}>
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <button className="hs-add-btn" onClick={addMapping}>
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
                disabled={saving || mappings.length === 0}
              >
                {saving
                  ? <><Loader2 size={14} className="hs-spin" /> Saving...</>
                  : <><Check size={14} /> Save Mappings</>}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
