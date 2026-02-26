import React, { useState, useEffect } from "react";
import {
  X, ChevronRight, ChevronLeft, Check, Loader2, ArrowRight,
  GitBranch, Map, Download, Settings2, AlertCircle,
} from "lucide-react";
import {
  getLinearTeams,
  getLinearWorkflowStates,
  saveLinearTeamMappings,
  saveLinearStatusMappings,
  saveLinearConfig,
  getLinearProjects,
  getLinearInitiatives,
  importLinearProjects,
  getAllTeams,
  getWorkspaceSettings,
  updateWorkspaceSettings,
  getRoadmaps,
} from "../services/api";

const STEPS = [
  { key: "teams", label: "Map Teams", icon: GitBranch },
  { key: "statuses", label: "Map Statuses", icon: Map },
  { key: "import", label: "Import Projects", icon: Download },
];

export default function LinearSetupWizard({ integrationId, onClose, onComplete }) {
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Team mapping state
  const [linearTeams, setLinearTeams] = useState([]);
  const [roadwayTeams, setRoadwayTeams] = useState([]);
  const [teamMappings, setTeamMappings] = useState({}); // linearTeamId -> roadwayTeamId

  // Status mapping state
  const [workflowStates, setWorkflowStates] = useState([]);
  const [roadwayStatuses, setRoadwayStatuses] = useState([]);
  const [statusMappings, setStatusMappings] = useState({}); // linearStateId -> roadwayStatus
  const [showImportStatuses, setShowImportStatuses] = useState(false);
  const [statusesToImport, setStatusesToImport] = useState(new Set());

  // Import state
  const [projects, setProjects] = useState([]);
  const [initiatives, setInitiatives] = useState([]);
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

  // Load initial data
  useEffect(() => {
    loadStepData(0);
  }, []);

  async function loadStepData(stepIndex) {
    setLoading(true);
    setError("");
    try {
      if (stepIndex === 0) {
        const [ltData, rtData] = await Promise.all([
          getLinearTeams(integrationId),
          getAllTeams(JSON.parse(localStorage.getItem("user") || "{}").workspace_id),
        ]);
        setLinearTeams(ltData.linear_teams || ltData.teams || []);
        setRoadwayTeams(Array.isArray(rtData) ? rtData : []);

        // Auto-map by fuzzy name match
        if (Object.keys(teamMappings).length === 0) {
          const auto = {};
          for (const lt of (ltData.linear_teams || ltData.teams || [])) {
            const match = (Array.isArray(rtData) ? rtData : []).find(
              (rt) => rt.name.toLowerCase() === lt.name.toLowerCase()
            );
            if (match) auto[lt.id] = match.id;
          }
          setTeamMappings(auto);
        }
      } else if (stepIndex === 1) {
        const workspaceId = JSON.parse(localStorage.getItem("user") || "{}").workspace_id;
        const [wsData, settingsData] = await Promise.all([
          getLinearWorkflowStates(integrationId),
          workspaceId ? getWorkspaceSettings(workspaceId) : Promise.resolve({}),
        ]);
        const states = wsData.linear_states || wsData.states || [];
        setWorkflowStates(states);

        // Load actual Roadway statuses from workspace settings
        const existingStatuses = wsData.roadway_statuses
          || (settingsData.custom_statuses ? JSON.parse(settingsData.custom_statuses) : null)
          || ["Placeholder", "Tentative", "Committed", "Done"];
        setRoadwayStatuses(existingStatuses);

        // Find Linear state names not already in Roadway
        const existingLower = new Set(existingStatuses.map((s) => s.toLowerCase()));
        const newNames = [];
        for (const ws of states) {
          if (ws.name && !existingLower.has(ws.name.toLowerCase())) {
            newNames.push(ws.name);
          }
        }
        if (newNames.length > 0) {
          setStatusesToImport(new Set(newNames));
          setShowImportStatuses(true);
        }

        // Auto-map by name match
        if (Object.keys(statusMappings).length === 0) {
          const auto = {};
          for (const ws of states) {
            const match = existingStatuses.find(
              (s) => s.toLowerCase() === (ws.name || "").toLowerCase()
            );
            if (match) auto[ws.id] = match;
          }
          setStatusMappings(auto);
        }
      } else if (stepIndex === 2) {
        const workspaceId = JSON.parse(localStorage.getItem("user") || "{}").workspace_id;
        const [projData, initData, rmData] = await Promise.all([
          getLinearProjects(integrationId, { includeCompleted, teamId: filterTeamId || undefined }),
          getLinearInitiatives(integrationId),
          workspaceId ? getRoadmaps(workspaceId) : Promise.resolve([]),
        ]);
        setProjects(projData.projects || []);
        setInitiatives(initData.initiatives || []);
        const rmList = Array.isArray(rmData) ? rmData : [];
        setAvailableRoadmaps(rmList);
        // If no target roadmap set yet, default to first available
        if (!targetRoadmapId && rmList.length > 0) {
          setTargetRoadmapId(rmList[0].id);
        }
      }
    } catch (err) {
      setError(err.message || "Failed to load data");
    } finally {
      setLoading(false);
    }
  }

  async function handleNext() {
    setSaving(true);
    setError("");
    try {
      if (step === 0) {
        // Save team mappings
        const mappings = Object.entries(teamMappings)
          .filter(([, v]) => v)
          .map(([linearId, roadwayId]) => ({
            linear_team_id: linearId,
            linear_team_name: linearTeams.find((t) => t.id === linearId)?.name || "",
            roadway_team_id: roadwayId,
          }));
        await saveLinearTeamMappings(integrationId, mappings);
      } else if (step === 1) {
        // Save status mappings
        const mappings = Object.entries(statusMappings)
          .filter(([, v]) => v)
          .map(([linearId, roadwayStatus]) => ({
            linear_state_id: linearId,
            linear_state_name: workflowStates.find((s) => s.id === linearId)?.name || "",
            roadway_status: roadwayStatus,
          }));
        await saveLinearStatusMappings(integrationId, mappings);
      }

      const nextStep = step + 1;
      if (nextStep < STEPS.length) {
        setStep(nextStep);
        await loadStepData(nextStep);
      }
    } catch (err) {
      setError(err.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  function handleBack() {
    if (step > 0) {
      setStep(step - 1);
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
      // Build projects array with project_id as backend expects
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
    if (step === 2 && !loading) {
      loadStepData(2);
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

  // Group workflow states by team
  const statesByTeam = {};
  for (const ws of workflowStates) {
    const teamName = ws.team?.name || ws.team_name || "Shared";
    if (!statesByTeam[teamName]) statesByTeam[teamName] = [];
    statesByTeam[teamName].push(ws);
  }

  return (
    <div className="linear-wizard-overlay" onClick={onClose}>
      <div className="linear-wizard-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="linear-wizard-header">
          <div className="linear-wizard-title">
            <Settings2 size={18} />
            <span>Linear Setup</span>
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
              <span>Loading from Linear...</span>
            </div>
          ) : step === 0 ? (
            /* Team Mapping */
            <div>
              <p className="linear-wizard-desc">
                Map your Linear teams to Roadway teams. This determines which row imported projects land in.
              </p>
              {linearTeams.length === 0 ? (
                <p className="text-muted" style={{ fontSize: 13 }}>No teams found in Linear.</p>
              ) : (
                <div className="linear-mapping-table">
                  <div className="linear-mapping-header">
                    <span>Linear Team</span>
                    <span></span>
                    <span>Roadway Team</span>
                  </div>
                  {linearTeams.map((lt) => (
                    <div key={lt.id} className="linear-mapping-row">
                      <div className="linear-mapping-cell">
                        {lt.color && <span className="color-dot" style={{ background: lt.color }} />}
                        {lt.name}
                      </div>
                      <ArrowRight size={14} className="linear-mapping-arrow" />
                      <select
                        className="input linear-mapping-select"
                        value={teamMappings[lt.id] || ""}
                        onChange={(e) => setTeamMappings((prev) => ({ ...prev, [lt.id]: e.target.value }))}
                      >
                        <option value="">— Skip —</option>
                        {roadwayTeams.map((rt) => (
                          <option key={rt.id} value={rt.id}>{rt.name}</option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : step === 1 ? (
            /* Status Mapping */
            <div>
              {/* Offer to import Linear statuses */}
              {showImportStatuses && statusesToImport.size > 0 && (
                <div className="linear-import-statuses-offer">
                  <p>
                    <strong>{statusesToImport.size} Linear status{statusesToImport.size !== 1 ? "es" : ""}</strong> not in Roadway yet.
                    Add them so they map automatically?
                  </p>
                  <div className="linear-import-statuses-list">
                    {Array.from(statusesToImport).map((name) => (
                      <span key={name} className="linear-import-status-chip">{name}</span>
                    ))}
                  </div>
                  <div style={{ display: "flex", gap: "var(--space-2)", marginTop: "var(--space-3)" }}>
                    <button
                      className="btn btn-primary"
                      onClick={async () => {
                        const workspaceId = JSON.parse(localStorage.getItem("user") || "{}").workspace_id;
                        if (!workspaceId) return;
                        const merged = [...roadwayStatuses, ...Array.from(statusesToImport)];
                        try {
                          await updateWorkspaceSettings(workspaceId, {
                            custom_statuses: JSON.stringify(merged),
                          });
                          setRoadwayStatuses(merged);
                          // Auto-map all by name match now
                          const auto = { ...statusMappings };
                          for (const ws of workflowStates) {
                            const match = merged.find(
                              (s) => s.toLowerCase() === (ws.name || "").toLowerCase()
                            );
                            if (match) auto[ws.id] = match;
                          }
                          setStatusMappings(auto);
                          setShowImportStatuses(false);
                        } catch (err) {
                          setError(err.message || "Failed to save statuses");
                        }
                      }}
                    >
                      <Check size={14} />
                      Add {statusesToImport.size} status{statusesToImport.size !== 1 ? "es" : ""} to Roadway
                    </button>
                    <button
                      className="btn btn-secondary"
                      onClick={() => setShowImportStatuses(false)}
                    >
                      Skip, I'll map manually
                    </button>
                  </div>
                </div>
              )}

              {(() => {
                // Split states into auto-matched and unmatched
                const autoMapped = [];
                const unmapped = [];
                for (const ws of workflowStates) {
                  const match = roadwayStatuses.find(
                    (s) => s.toLowerCase() === (ws.name || "").toLowerCase()
                  );
                  if (match && statusMappings[ws.id] === match) {
                    autoMapped.push(ws);
                  } else {
                    unmapped.push(ws);
                  }
                }

                // Group only unmapped by team
                const unmappedByTeam = {};
                for (const ws of unmapped) {
                  const teamName = ws.team?.name || ws.team_name || "Shared";
                  if (!unmappedByTeam[teamName]) unmappedByTeam[teamName] = [];
                  unmappedByTeam[teamName].push(ws);
                }

                return (
                  <>
                    {autoMapped.length > 0 && (
                      <div className="linear-auto-mapped-summary">
                        <Check size={14} />
                        <span><strong>{autoMapped.length}</strong> status{autoMapped.length !== 1 ? "es" : ""} auto-mapped by name match</span>
                      </div>
                    )}

                    {unmapped.length > 0 ? (
                      <>
                        <p className="linear-wizard-desc">
                          Map the remaining {unmapped.length} Linear state{unmapped.length !== 1 ? "s" : ""} to Roadway statuses.
                        </p>
                        {Object.entries(unmappedByTeam).map(([teamName, states]) => (
                          <div key={teamName} className="linear-status-group">
                            <h4 className="linear-status-group-title">{teamName}</h4>
                            <div className="linear-mapping-table">
                              <div className="linear-mapping-header">
                                <span>Linear State</span>
                                <span></span>
                                <span>Roadway Status</span>
                              </div>
                              {states.map((ws) => (
                                <div key={ws.id} className="linear-mapping-row">
                                  <div className="linear-mapping-cell">
                                    {ws.color && <span className="color-dot" style={{ background: ws.color }} />}
                                    {ws.name}
                                    <span className="linear-state-type">{ws.type}</span>
                                  </div>
                                  <ArrowRight size={14} className="linear-mapping-arrow" />
                                  <select
                                    className="input linear-mapping-select"
                                    value={statusMappings[ws.id] || ""}
                                    onChange={(e) => setStatusMappings((prev) => ({ ...prev, [ws.id]: e.target.value }))}
                                  >
                                    <option value="">— Skip —</option>
                                    {roadwayStatuses.map((s) => (
                                      <option key={s} value={s}>{s}</option>
                                    ))}
                                  </select>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </>
                    ) : (
                      <p className="linear-wizard-desc" style={{ color: "var(--teal)" }}>
                        All statuses mapped automatically. Click Next to continue.
                      </p>
                    )}
                  </>
                );
              })()}
            </div>
          ) : step === 2 ? (
            /* Import Projects */
            <div>
              {importResult ? (
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
          ) : null}
        </div>

        {/* Footer */}
        {!importResult && (
          <div className="linear-wizard-footer">
            <div>
              {step > 0 && (
                <button className="btn btn-secondary" onClick={handleBack} disabled={saving}>
                  <ChevronLeft size={14} /> Back
                </button>
              )}
            </div>
            <div style={{ display: "flex", gap: "var(--space-2)" }}>
              {step < 2 ? (
                <button
                  className="btn btn-primary"
                  onClick={handleNext}
                  disabled={saving || loading}
                >
                  {saving ? <><Loader2 size={14} className="spin" /> Saving...</> : <>Next <ChevronRight size={14} /></>}
                </button>
              ) : (
                <button
                  className="btn btn-primary"
                  onClick={handleImport}
                  disabled={importing || selectedProjects.size === 0}
                >
                  {importing
                    ? <><Loader2 size={14} className="spin" /> Importing...</>
                    : <><Download size={14} /> Import {selectedProjects.size} Project{selectedProjects.size !== 1 ? "s" : ""}</>}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
