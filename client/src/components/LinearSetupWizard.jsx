import React, { useState, useEffect } from "react";
import {
  X, ChevronRight, Check, Loader2,
  Download, AlertCircle,
} from "lucide-react";
import {
  getLinearTeams,
  getLinearProjects,
  getLinearInitiatives,
  importLinearProjects,
  getRoadmaps,
} from "../services/api";

export default function LinearSetupWizard({ integrationId, onClose, onComplete }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Import state
  const [projects, setProjects] = useState([]);
  const [linearTeams, setLinearTeams] = useState([]);
  const [selectedProjects, setSelectedProjects] = useState(new Set());
  const [includeCompleted, setIncludeCompleted] = useState(false);
  const [filterTeamId, setFilterTeamId] = useState("");
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [availableRoadmaps, setAvailableRoadmaps] = useState([]);
  const [targetRoadmapId, setTargetRoadmapId] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("user") || "{}").last_roadmap_id || "";
    } catch { return ""; }
  });

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    setError("");
    try {
      const workspaceId = JSON.parse(localStorage.getItem("user") || "{}").workspace_id;
      const [projData, initData, rmData, ltData] = await Promise.all([
        getLinearProjects(integrationId, { includeCompleted, teamId: filterTeamId || undefined }),
        getLinearInitiatives(integrationId),
        workspaceId ? getRoadmaps(workspaceId) : Promise.resolve([]),
        getLinearTeams(integrationId),
      ]);
      setProjects(projData.projects || []);
      setLinearTeams(ltData.linear_teams || ltData.teams || []);
      const rmList = Array.isArray(rmData) ? rmData : [];
      setAvailableRoadmaps(rmList);
      if (!targetRoadmapId && rmList.length > 0) {
        setTargetRoadmapId(rmList[0].id);
      }
    } catch (err) {
      setError(err.message || "Failed to load data");
    } finally {
      setLoading(false);
    }
  }

  async function handleImport() {
    if (selectedProjects.size === 0) return;
    if (!targetRoadmapId) {
      setError("No roadmap selected. Open a roadmap first, then try again.");
      return;
    }
    setImporting(true);
    setError("");
    setImportResult(null);
    try {
      const projectsToImport = projects
        .filter((p) => selectedProjects.has(p.id))
        .map((p) => ({ project_id: p.id, name: p.name }));
      const result = await importLinearProjects(integrationId, {
        projects: projectsToImport,
        roadmap_id: targetRoadmapId,
      });
      setImportResult(result);
    } catch (err) {
      setError(err.message || "Import failed");
    } finally {
      setImporting(false);
    }
  }

  // Reload projects when filters change
  useEffect(() => {
    if (!loading) {
      loadData();
    }
  }, [includeCompleted, filterTeamId]);

  function toggleProject(id) {
    setSelectedProjects((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAllProjects() {
    if (selectedProjects.size === projects.length) {
      setSelectedProjects(new Set());
    } else {
      setSelectedProjects(new Set(projects.map((p) => p.id)));
    }
  }

  return (
    <div className="linear-wizard-overlay" onClick={onClose}>
      <div className="linear-wizard-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="linear-wizard-header">
          <div className="linear-wizard-title">
            <Download size={18} />
            <span>Import from Linear</span>
          </div>
          <button className="btn-icon" onClick={onClose}><X size={16} /></button>
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
              <span>Loading from Linear...</span>
            </div>
          ) : importResult ? (
            <div className="linear-import-result">
              <div className="linear-import-result-icon"><Check size={24} /></div>
              <h3>Import Complete</h3>
              <p>
                Created <strong>{importResult.imported ?? 0}</strong> cards
                from <strong>{importResult.results?.length ?? 0}</strong> projects.
                {importResult.errors > 0 && (
                  <> (<strong>{importResult.errors}</strong> failed)</>
                )}
              </p>
              <button className="btn btn-primary" onClick={() => { onComplete?.(); onClose(); }}>
                Done
              </button>
            </div>
          ) : (
            <>
              <p className="linear-wizard-desc">
                Select Linear projects to import as roadmap cards.
              </p>

              {/* Target roadmap selector */}
              <div className="linear-import-filters" style={{ marginBottom: 8 }}>
                <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-secondary)" }}>
                  Import to:
                </label>
                <select
                  className="input"
                  value={targetRoadmapId}
                  onChange={(e) => setTargetRoadmapId(e.target.value)}
                  style={{ flex: 1, maxWidth: 280 }}
                >
                  {availableRoadmaps.length === 0 && (
                    <option value="">No roadmaps found</option>
                  )}
                  {availableRoadmaps.map((rm) => (
                    <option key={rm.id} value={rm.id}>{rm.name}</option>
                  ))}
                </select>
              </div>

              {/* Filters */}
              <div className="linear-import-filters">
                <select
                  className="input"
                  value={filterTeamId}
                  onChange={(e) => setFilterTeamId(e.target.value)}
                  style={{ width: 180 }}
                >
                  <option value="">All Teams</option>
                  {linearTeams.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
                <label className="linear-import-checkbox">
                  <input
                    type="checkbox"
                    checked={includeCompleted}
                    onChange={(e) => setIncludeCompleted(e.target.checked)}
                  />
                  Include completed
                </label>
              </div>

              {/* Project list */}
              <div className="linear-project-list">
                {projects.length === 0 ? (
                  <p className="text-muted" style={{ fontSize: 13, padding: "var(--space-4)" }}>
                    No projects found. Try changing filters.
                  </p>
                ) : (
                  <>
                    <div className="linear-project-header">
                      <label className="linear-import-checkbox">
                        <input
                          type="checkbox"
                          checked={selectedProjects.size === projects.length && projects.length > 0}
                          onChange={selectAllProjects}
                        />
                        Select all ({projects.length})
                      </label>
                    </div>
                    {projects.map((proj) => (
                      <div
                        key={proj.id}
                        className={`linear-project-row ${selectedProjects.has(proj.id) ? "selected" : ""}`}
                        onClick={() => toggleProject(proj.id)}
                      >
                        <input
                          type="checkbox"
                          checked={selectedProjects.has(proj.id)}
                          onChange={() => toggleProject(proj.id)}
                        />
                        <div className="linear-project-info">
                          <span className="linear-project-name">{proj.name}</span>
                          <span className="linear-project-meta">
                            {proj.state || "No status"}
                            {proj.team_name ? ` · ${proj.team_name}` : ""}
                            {proj.issue_count != null ? ` · ${proj.issue_count} issues` : ""}
                            {proj.progress != null ? ` · ${Math.round(proj.progress * 100)}%` : ""}
                          </span>
                        </div>
                      </div>
                    ))}
                  </>
                )}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        {!importResult && !loading && (
          <div className="linear-wizard-footer">
            <div />
            <div style={{ display: "flex", gap: "var(--space-2)" }}>
              <button
                className="btn btn-primary"
                onClick={handleImport}
                disabled={importing || selectedProjects.size === 0}
              >
                {importing
                  ? <><Loader2 size={14} className="spin" /> Importing...</>
                  : <><Download size={14} /> Import {selectedProjects.size} Project{selectedProjects.size !== 1 ? "s" : ""}</>}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
