import React, { useState, useEffect } from "react";
import {
  X, ChevronRight, ChevronLeft, Check, Loader2,
  Database, ArrowRight, Download, Settings2, AlertCircle,
} from "lucide-react";
import {
  getNotionDatabases,
  previewNotionDatabase,
  importNotionDatabase,
  getRoadmaps,
  getWorkspaceSettings,
} from "../services/api";

const STEPS = [
  { key: "database", label: "Select Database", icon: Database },
  { key: "mapping", label: "Map Properties", icon: Settings2 },
  { key: "import", label: "Import", icon: Download },
];

export default function NotionImportWizard({ integrationId, onClose, onComplete }) {
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Step 0: Database selection
  const [databases, setDatabases] = useState([]);
  const [selectedDbId, setSelectedDbId] = useState(null);

  // Step 1: Property mapping + preview
  const [preview, setPreview] = useState(null);
  const [propertyMappings, setPropertyMappings] = useState({ name: "", description: "", status: "", team: "" });
  const [statusMappings, setStatusMappings] = useState({});
  const [roadwayStatuses, setRoadwayStatuses] = useState([]);
  const [availableRoadmaps, setAvailableRoadmaps] = useState([]);
  const [targetRoadmapId, setTargetRoadmapId] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("user") || "{}").last_roadmap_id || "";
    } catch { return ""; }
  });

  // Step 2: Import result
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);

  useEffect(() => {
    loadDatabases();
  }, []);

  async function loadDatabases() {
    setLoading(true);
    setError("");
    try {
      const data = await getNotionDatabases(integrationId);
      setDatabases(data.databases || []);
    } catch (err) {
      setError(err.message || "Failed to load databases");
    } finally {
      setLoading(false);
    }
  }

  async function handleSelectDatabase() {
    if (!selectedDbId) return;
    setLoading(true);
    setError("");
    try {
      const workspaceId = JSON.parse(localStorage.getItem("user") || "{}").workspace_id;
      const [previewData, rmData, settingsData] = await Promise.all([
        previewNotionDatabase(integrationId, selectedDbId),
        workspaceId ? getRoadmaps(workspaceId) : Promise.resolve([]),
        workspaceId ? getWorkspaceSettings(workspaceId) : Promise.resolve({}),
      ]);

      setPreview(previewData);

      const rmList = Array.isArray(rmData) ? rmData : [];
      setAvailableRoadmaps(rmList);
      if (!targetRoadmapId && rmList.length > 0) {
        setTargetRoadmapId(rmList[0].id);
      }

      const statuses = settingsData.custom_statuses
        ? JSON.parse(settingsData.custom_statuses)
        : ["Placeholder", "Planned", "In Progress", "Done"];
      setRoadwayStatuses(statuses);

      // Auto-detect title property for name mapping
      if (previewData?.schema?.properties) {
        const props = previewData.schema.properties;
        for (const [name, prop] of Object.entries(props)) {
          if (prop.type === "title") {
            setPropertyMappings((prev) => ({ ...prev, name: name }));
            break;
          }
        }
      }

      setStep(1);
    } catch (err) {
      setError(err.message || "Failed to load preview");
    } finally {
      setLoading(false);
    }
  }

  async function handleImport() {
    if (!targetRoadmapId) {
      setError("Select a target roadmap");
      return;
    }
    setImporting(true);
    setError("");
    setImportResult(null);
    try {
      const result = await importNotionDatabase(integrationId, {
        database_id: selectedDbId,
        property_mappings: propertyMappings,
        status_mappings: statusMappings,
        roadmap_id: targetRoadmapId,
      });
      setImportResult(result);
      setStep(2);
    } catch (err) {
      setError(err.message || "Import failed");
    } finally {
      setImporting(false);
    }
  }

  const schemaProps = preview?.schema?.properties ? Object.entries(preview.schema.properties) : [];
  const statusProp = propertyMappings.status;
  const statusValues = statusProp ? getUniquePropertyValues(preview?.rows, statusProp) : [];

  function getUniquePropertyValues(rows, propName) {
    if (!rows || !propName) return [];
    const values = new Set();
    for (const row of rows) {
      const val = row.values?.[propName];
      if (val) values.add(val);
    }
    return Array.from(values);
  }

  return (
    <div className="linear-wizard-overlay" onClick={onClose}>
      <div className="linear-wizard-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="linear-wizard-header">
          <div className="linear-wizard-title">
            <Database size={18} />
            <span>Import from Notion</span>
          </div>
          <button className="btn-icon" onClick={onClose}><X size={16} /></button>
        </div>

        {/* Steps indicator */}
        <div className="linear-wizard-steps">
          {STEPS.map((s, i) => (
            <div key={s.key} className={`linear-wizard-step ${i === step ? "active" : ""} ${i < step ? "done" : ""}`}>
              <div className="linear-wizard-step-dot">
                {i < step ? <Check size={12} /> : i + 1}
              </div>
              <span className="linear-wizard-step-label">{s.label}</span>
              {i < STEPS.length - 1 && <ChevronRight size={14} className="linear-wizard-step-arrow" />}
            </div>
          ))}
        </div>

        {/* Body */}
        <div className="linear-wizard-body">
          {error && (
            <div className="linear-wizard-error">
              <AlertCircle size={14} />
              {error}
            </div>
          )}

          {loading ? (
            <div className="linear-wizard-loading">
              <Loader2 size={24} className="spin" />
              <span>Loading from Notion...</span>
            </div>
          ) : step === 0 ? (
            /* Step 0: Select database */
            <div>
              <p className="linear-wizard-desc">
                Select a Notion database to import. Each row will become a card on your roadmap.
              </p>
              {databases.length === 0 ? (
                <p className="text-muted" style={{ fontSize: 13, padding: "var(--space-4)" }}>
                  No databases found. Make sure your Notion integration has access to at least one database.
                </p>
              ) : (
                <div className="linear-project-list">
                  {databases.map((db) => (
                    <div
                      key={db.id}
                      className={`linear-project-row ${selectedDbId === db.id ? "selected" : ""}`}
                      onClick={() => setSelectedDbId(db.id)}
                    >
                      <input
                        type="radio"
                        name="notion-db"
                        checked={selectedDbId === db.id}
                        onChange={() => setSelectedDbId(db.id)}
                      />
                      <div className="linear-project-info">
                        <span className="linear-project-name">
                          {db.icon ? `${db.icon} ` : ""}{db.title}
                        </span>
                        <span className="linear-project-meta">
                          {db.property_count} properties
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : step === 1 ? (
            /* Step 1: Map properties */
            <div>
              <p className="linear-wizard-desc">
                Map Notion properties to card fields. Only "Name" is required.
              </p>

              {/* Target roadmap */}
              <div style={{ marginBottom: 16 }}>
                <label className="form-label" style={{ display: "block", marginBottom: 4, fontSize: 12 }}>Import to roadmap</label>
                <select
                  className="input"
                  value={targetRoadmapId}
                  onChange={(e) => setTargetRoadmapId(e.target.value)}
                  style={{ width: "100%" }}
                >
                  {availableRoadmaps.length === 0 && <option value="">No roadmaps found</option>}
                  {availableRoadmaps.map((rm) => (
                    <option key={rm.id} value={rm.id}>{rm.name}</option>
                  ))}
                </select>
              </div>

              {/* Property mappings */}
              <div className="linear-mapping-table">
                <div className="linear-mapping-header">
                  <span>Card Field</span>
                  <span></span>
                  <span>Notion Property</span>
                </div>

                {[
                  { key: "name", label: "Name", required: true },
                  { key: "description", label: "Description" },
                  { key: "status", label: "Status" },
                  { key: "team", label: "Team" },
                ].map((field) => (
                  <div key={field.key} className="linear-mapping-row">
                    <div className="linear-mapping-cell">
                      {field.label}
                      {field.required && <span style={{ color: "var(--red)", marginLeft: 2 }}>*</span>}
                    </div>
                    <ArrowRight size={14} className="linear-mapping-arrow" />
                    <select
                      className="input linear-mapping-select"
                      value={propertyMappings[field.key] || ""}
                      onChange={(e) => setPropertyMappings((prev) => ({ ...prev, [field.key]: e.target.value }))}
                    >
                      <option value="">— Skip —</option>
                      {schemaProps.map(([name, prop]) => (
                        <option key={name} value={name}>
                          {name} ({prop.type})
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>

              {/* Status value mapping */}
              {statusProp && statusValues.length > 0 && (
                <div style={{ marginTop: 16 }}>
                  <h4 style={{ fontSize: 13, marginBottom: 8 }}>Map status values</h4>
                  <div className="linear-mapping-table">
                    <div className="linear-mapping-header">
                      <span>Notion Status</span>
                      <span></span>
                      <span>Roadway Status</span>
                    </div>
                    {statusValues.map((val) => (
                      <div key={val} className="linear-mapping-row">
                        <div className="linear-mapping-cell">{val}</div>
                        <ArrowRight size={14} className="linear-mapping-arrow" />
                        <select
                          className="input linear-mapping-select"
                          value={statusMappings[val] || ""}
                          onChange={(e) => setStatusMappings((prev) => ({ ...prev, [val]: e.target.value }))}
                        >
                          <option value="">— Skip (use default) —</option>
                          {roadwayStatuses.map((s) => (
                            <option key={s} value={s}>{s}</option>
                          ))}
                        </select>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Preview */}
              {preview?.rows?.length > 0 && (
                <div style={{ marginTop: 16 }}>
                  <h4 style={{ fontSize: 13, marginBottom: 8 }}>Preview ({preview.rows.length} rows)</h4>
                  <div style={{ overflow: "auto", maxHeight: 200, border: "1px solid var(--border-default)", borderRadius: 6, fontSize: 12 }}>
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                      <thead>
                        <tr>
                          {schemaProps.slice(0, 4).map(([name]) => (
                            <th key={name} style={{ padding: "6px 8px", borderBottom: "1px solid var(--border-default)", textAlign: "left", fontWeight: 600 }}>
                              {name}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {preview.rows.map((row) => (
                          <tr key={row.id}>
                            {schemaProps.slice(0, 4).map(([name]) => (
                              <td key={name} style={{ padding: "4px 8px", borderBottom: "1px solid var(--border-subtle)" }}>
                                {row.values?.[name] || "—"}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          ) : step === 2 ? (
            /* Step 2: Import result */
            <div className="linear-import-result">
              <div className="linear-import-result-icon"><Check size={24} /></div>
              <h3>Import Complete</h3>
              <p>
                Created <strong>{importResult?.created ?? 0}</strong> cards from Notion.
                {importResult?.errors?.length > 0 && (
                  <> (<strong>{importResult.errors.length}</strong> failed)</>
                )}
              </p>
              <button className="btn btn-primary" onClick={() => { onComplete?.(); onClose(); }}>
                Done
              </button>
            </div>
          ) : null}
        </div>

        {/* Footer */}
        {step < 2 && !loading && (
          <div className="linear-wizard-footer">
            <div>
              {step > 0 && (
                <button className="btn btn-secondary" onClick={() => setStep(step - 1)}>
                  <ChevronLeft size={14} /> Back
                </button>
              )}
            </div>
            <div style={{ display: "flex", gap: "var(--space-2)" }}>
              {step === 0 ? (
                <button
                  className="btn btn-primary"
                  onClick={handleSelectDatabase}
                  disabled={!selectedDbId}
                >
                  Next <ChevronRight size={14} />
                </button>
              ) : step === 1 ? (
                <button
                  className="btn btn-primary"
                  onClick={handleImport}
                  disabled={importing || !propertyMappings.name || !targetRoadmapId}
                >
                  {importing
                    ? <><Loader2 size={14} className="spin" /> Importing...</>
                    : <><Download size={14} /> Import</>}
                </button>
              ) : null}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
