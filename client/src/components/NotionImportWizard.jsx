import React, { useState, useEffect } from "react";
import {
  X, ChevronRight, Check, Loader2,
  Database, Download, AlertCircle,
} from "lucide-react";
import {
  getNotionDatabases,
  importNotionDatabase,
  getRoadmaps,
} from "../services/api";

const STEPS = [
  { key: "database", label: "Select Database", icon: Database },
  { key: "import", label: "Import", icon: Download },
];

export default function NotionImportWizard({ integrationId, onClose, onComplete }) {
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Step 0: Database selection
  const [databases, setDatabases] = useState([]);
  const [selectedDbId, setSelectedDbId] = useState(null);

  // Step 1: Import
  const [availableRoadmaps, setAvailableRoadmaps] = useState([]);
  const [targetRoadmapId, setTargetRoadmapId] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("user") || "{}").last_roadmap_id || "";
    } catch { return ""; }
  });
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
      const rmData = workspaceId ? await getRoadmaps(workspaceId) : [];
      const rmList = Array.isArray(rmData) ? rmData : [];
      setAvailableRoadmaps(rmList);
      if (!targetRoadmapId && rmList.length > 0) {
        setTargetRoadmapId(rmList[0].id);
      }
      setStep(1);
    } catch (err) {
      setError(err.message || "Failed to load roadmaps");
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
        roadmap_id: targetRoadmapId,
      });
      setImportResult(result);
    } catch (err) {
      setError(err.message || "Import failed");
    } finally {
      setImporting(false);
    }
  }

  const selectedDb = databases.find((db) => db.id === selectedDbId);

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
          ) : step === 1 && importResult ? (
            /* Import result */
            <div className="linear-import-result">
              <div className="linear-import-result-icon"><Check size={24} /></div>
              <h3>Import Complete</h3>
              <p>
                Created <strong>{importResult.created ?? 0}</strong> cards from Notion.
                {importResult.errors?.length > 0 && (
                  <> (<strong>{importResult.errors.length}</strong> failed)</>
                )}
              </p>
              <button className="btn btn-primary" onClick={() => { onComplete?.(); onClose(); }}>
                Done
              </button>
            </div>
          ) : step === 1 ? (
            /* Step 1: Import */
            <div>
              <p className="linear-wizard-desc">
                Import all rows from <strong>{selectedDb?.title || "selected database"}</strong> as cards.
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
            </div>
          ) : null}
        </div>

        {/* Footer */}
        {!importResult && !loading && (
          <div className="linear-wizard-footer">
            <div>
              {step > 0 && (
                <button className="btn btn-secondary" onClick={() => setStep(step - 1)}>
                  Back
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
                  disabled={importing || !targetRoadmapId}
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
