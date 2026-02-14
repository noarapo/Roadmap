import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { executeAgent, getAgentCapabilities, getAgentLogs, getRoadmaps } from "../services/api";

export default function AgentPanel() {
  const navigate = useNavigate();
  const [capabilities, setCapabilities] = useState(null);
  const [logs, setLogs] = useState([]);
  const [roadmaps, setRoadmaps] = useState([]);
  const [selectedAction, setSelectedAction] = useState("generate_roadmap");
  const [params, setParams] = useState({});
  const [result, setResult] = useState(null);
  const [working, setWorking] = useState(false);

  useEffect(() => {
    getAgentCapabilities().then(setCapabilities);
    getAgentLogs().then(setLogs);
    getRoadmaps().then(setRoadmaps);
  }, []);

  function handleParamChange(key, value) {
    setParams((prev) => ({ ...prev, [key]: value }));
  }

  async function handleExecute(e) {
    e.preventDefault();
    setWorking(true);
    setResult(null);
    try {
      const res = await executeAgent(selectedAction, params);
      setResult(res);
      getAgentLogs().then(setLogs);
      getRoadmaps().then(setRoadmaps);
    } catch (err) {
      setResult({ error: err.message });
    }
    setWorking(false);
  }

  function renderParamInputs() {
    if (!capabilities) return null;
    const actionDef = capabilities.actions[selectedAction];
    if (!actionDef) return null;

    return Object.entries(actionDef.params).map(([key, schema]) => {
      if (key === "roadmap_id") {
        return (
          <div className="form-group" key={key}>
            <label>{key}</label>
            <select value={params[key] || ""} onChange={(e) => handleParamChange(key, e.target.value)}>
              <option value="">Select a roadmap</option>
              {roadmaps.map((r) => <option key={r.id} value={r.id}>{r.title}</option>)}
            </select>
          </div>
        );
      }
      if (schema.enum) {
        return (
          <div className="form-group" key={key}>
            <label>{key}{schema.required ? " *" : ""}</label>
            <select value={params[key] || schema.default || ""} onChange={(e) => handleParamChange(key, e.target.value)}>
              {schema.enum.map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          </div>
        );
      }
      return (
        <div className="form-group" key={key}>
          <label>{key}{schema.required ? " *" : ""}</label>
          <input
            type={schema.type === "number" ? "number" : "text"}
            placeholder={key}
            value={params[key] || ""}
            onChange={(e) => handleParamChange(key, e.target.value)}
          />
        </div>
      );
    });
  }

  return (
    <div className="page agent-page">
      <div className="page-header">
        <h1>Fullstack Developer Agent</h1>
      </div>

      <div className="agent-layout">
        <div className="agent-controls card">
          <h2>Execute Action</h2>
          {capabilities && (
            <form onSubmit={handleExecute}>
              <div className="form-group">
                <label>Action</label>
                <select
                  value={selectedAction}
                  onChange={(e) => { setSelectedAction(e.target.value); setParams({}); setResult(null); }}
                >
                  {Object.entries(capabilities.actions).map(([key, val]) => (
                    <option key={key} value={key}>{key} - {val.description}</option>
                  ))}
                </select>
              </div>
              {renderParamInputs()}
              <button className="btn btn-primary" type="submit" disabled={working}>
                {working ? "Working..." : "Execute"}
              </button>
            </form>
          )}

          {result && (
            <div className="result-panel">
              <h3>Result</h3>
              {result.error ? (
                <div className="error-msg">{result.error}</div>
              ) : (
                <div className="result-content">
                  {result.id && result.milestones ? (
                    <div>
                      <p>Roadmap "{result.title}" created with {result.milestones.length} milestones.</p>
                      <button className="btn btn-secondary" onClick={() => navigate(`/roadmap/${result.id}`)}>
                        View Roadmap
                      </button>
                    </div>
                  ) : (
                    <pre>{JSON.stringify(result, null, 2)}</pre>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="agent-logs card">
          <h2>Agent Activity Log</h2>
          {logs.length === 0 ? (
            <p className="meta">No agent activity yet.</p>
          ) : (
            <div className="logs-list">
              {logs.map((log) => (
                <div key={log.id} className="log-entry">
                  <div className="log-header">
                    <span className="log-action">{log.action}</span>
                    <span className="meta">{new Date(log.created_at).toLocaleString()}</span>
                  </div>
                  {log.input && <div className="log-input">Input: {log.input}</div>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
