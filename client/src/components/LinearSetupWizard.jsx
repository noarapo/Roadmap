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
} from "../services/api";

const STEPS = [
  { key: "teams", label: "Map Teams", icon: GitBranch },
  { key: "statuses", label: "Map Statuses", icon: Map },
  { key: "import", label: "Import Projects", icon: Download },
];

const ROADWAY_STATUSES = ["Placeholder", "Tentative", "Committed", "Done"];

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
  const [statusMappings, setStatusMappings] = useState({}); // linearStateId -> roadwayStatus

  // Import state
  const [projects, setProjects] = useState([]);
  const [initiatives, setInitiatives] = useState([]);
  const [selectedProjects, setSelectedProjects] = useState(new Set());
  const [includeCompleted, setIncludeCompleted] = useState(false);
  const [filterTeamId, setFilterTeamId] = useState("");
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);
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
        setLinearTeams(ltData.teams || []);
        setRoadwayTeams(Array.isArray(rtData) ? rtData : []);

        // Auto-map by fuzzy name match
        if (Object.keys(teamMappings).length === 0) {
          const auto = {};
          for (const lt of (ltData.teams || [])) {
            const match = (Array.isArray(rtData) ? rtData : []).find(
              (rt) => rt.name.toLowerCase() === lt.name.toLowerCase()
            );
            if (match) auto[lt.id] = match.id;
          }
          setTeamMappings(auto);
        }
      } else if (stepIndex === 1) {
        const wsData = await getLinearWorkflowStates(integrationId);
        setWorkflowStates(wsData.states || []);

        // Auto-map by state type
        if (Object.keys(statusMappings).length === 0) {
          const auto = {};
          for (const ws of (wsData.states || [])) {
            const type = (ws.type || "").toLowerCase();
            if (type === "backlog" || type === "triage") auto[ws.id] = "Placeholder";
            else if (type === "unstarted") auto[ws.id] = "Tentative";
            else if (type === "started") auto[ws.id] = "Committed";
            else if (type === "completed") auto[ws.id] = "Done";
            else if (type === "cancelled" || type === "canceled") auto[ws.id] = "Done";
          }
          setStatusMappings(auto);
        }
      } else if (stepIndex === 2) {
        const [projData, initData] = await Promise.all([
          getLinearProjects(integrationId, { includeCompleted, teamId: filterTeamId || undefined }),
          getLinearInitiatives(integrationId),
        ]);
        setProjects(projData.projects || []);
        setInitiatives(initData.initiatives || []);
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
    setImporting(true);
    setError("");
    setImportResult(null);
    try {
      const result = await importLinearProjects(integrationId, {
        project_ids: Array.from(selectedProjects),
        roadmap_id: targetRoadmapId || undefined,
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
    const teamName = ws.team_name || "Shared";
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
              <p className="linear-wizard-desc">
                Map Linear workflow states to Roadway card statuses. Grouped by team.
              </p>
              {Object.entries(statesByTeam).map(([teamName, states]) => (
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
                          {ROADWAY_STATUSES.map((s) => (
                            <option key={s} value={s}>{s}</option>
                          ))}
                        </select>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : step === 2 ? (
            /* Import Projects */
            <div>
              {importResult ? (
                <div className="linear-import-result">
                  <div className="linear-import-result-icon"><Check size={24} /></div>
                  <h3>Import Complete</h3>
                  <p>
                    Created <strong>{importResult.created_cards}</strong> cards
                    from <strong>{importResult.imported_projects}</strong> projects.
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
