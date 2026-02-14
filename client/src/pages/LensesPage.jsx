import React, { useState } from "react";
import { ChevronDown, ChevronUp, Plus } from "lucide-react";

const PRIORITY_FIELDS = [
  "Revenue Impact",
  "Customer Requests",
  "Churn Risk",
  "Contract Commitment",
  "Strategic Alignment",
  "Effort Estimate",
];

const INITIAL_LENSES = [
  {
    id: 1,
    emoji: "\uD83C\uDFAF",
    name: "Customer Success",
    description: "Evaluates features from the customer satisfaction and retention perspective",
    active: true,
    strategyContext:
      "Focus on reducing churn by 15% this quarter. Prioritize features requested by top-tier accounts and those that directly improve NPS scores. Consider support ticket volume as a leading indicator.",
    dataSources: [
      { name: "Manual Input", connected: true },
      { name: "HubSpot CRM", connected: false },
    ],
    selectedPriorities: ["Revenue Impact", "Customer Requests", "Churn Risk"],
  },
  {
    id: 2,
    emoji: "\uD83D\uDD27",
    name: "Engineering",
    description: "Assesses technical feasibility, debt reduction, and infrastructure alignment",
    active: true,
    strategyContext:
      "Migrate to event-driven architecture by Q3. Reduce tech debt ratio below 20%. Ensure all new features align with the microservices refactoring plan currently underway.",
    dataSources: [
      { name: "Manual Input", connected: true },
      { name: "Jira Backlog", connected: false },
    ],
    selectedPriorities: ["Effort Estimate", "Strategic Alignment"],
  },
  {
    id: 3,
    emoji: "\uD83D\uDCB0",
    name: "Revenue",
    description: "Analyzes revenue potential, deal pipeline impact, and pricing tier alignment",
    active: false,
    strategyContext:
      "Hit $5M ARR target by end of year. Enterprise segment is primary growth driver. Features that unlock new pricing tiers or remove deal blockers should be weighted heavily.",
    dataSources: [
      { name: "Manual Input", connected: true },
      { name: "Salesforce", connected: false },
    ],
    selectedPriorities: ["Revenue Impact", "Contract Commitment", "Strategic Alignment"],
  },
];

export default function LensesPage() {
  const [lenses, setLenses] = useState(INITIAL_LENSES);
  const [expandedId, setExpandedId] = useState(null);

  function toggleExpand(id) {
    setExpandedId((prev) => (prev === id ? null : id));
  }

  function updateLens(id, updates) {
    setLenses((prev) =>
      prev.map((lens) => (lens.id === id ? { ...lens, ...updates } : lens))
    );
  }

  function togglePriority(lensId, field) {
    setLenses((prev) =>
      prev.map((lens) => {
        if (lens.id !== lensId) return lens;
        const selected = lens.selectedPriorities.includes(field)
          ? lens.selectedPriorities.filter((f) => f !== field)
          : [...lens.selectedPriorities, field];
        return { ...lens, selectedPriorities: selected };
      })
    );
  }

  function handleCreateLens() {
    const newId = Math.max(...lenses.map((l) => l.id)) + 1;
    const newLens = {
      id: newId,
      emoji: "\u2728",
      name: "New Custom Lens",
      description: "Describe this lens perspective",
      active: false,
      strategyContext: "",
      dataSources: [
        { name: "Manual Input", connected: true },
        { name: "Integration", connected: false },
      ],
      selectedPriorities: [],
    };
    setLenses((prev) => [...prev, newLens]);
    setExpandedId(newId);
  }

  return (
    <div className="lenses-page">
      <div className="page-header">
        <h1>Agent Lenses</h1>
        <p className="page-header-subtitle">
          Configure AI agent perspectives that evaluate your roadmap from different stakeholder viewpoints
        </p>
      </div>

      {lenses.map((lens) => {
        const isExpanded = expandedId === lens.id;
        return (
          <div key={lens.id} className="lens-card">
            <div className="lens-card-header" onClick={() => toggleExpand(lens.id)}>
              <div className="lens-card-left">
                <span className="lens-card-icon">{lens.emoji}</span>
                <div className="lens-card-info">
                  <span className="lens-card-name">{lens.name}</span>
                  <span className="lens-card-desc">{lens.description}</span>
                </div>
              </div>
              <div className="lens-card-right">
                <span className={`badge ${lens.active ? "badge-green" : "badge-gray"}`}>
                  {lens.active ? "ACTIVE" : "PAUSED"}
                </span>
                {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </div>
            </div>

            {isExpanded && (
              <div className="lens-card-body">
                {/* Section 1: Identity */}
                <div>
                  <div className="lens-section-title">Identity</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
                    <div className="form-group">
                      <label className="form-label">Name</label>
                      <input
                        className="input"
                        type="text"
                        value={lens.name}
                        onChange={(e) => updateLens(lens.id, { name: e.target.value })}
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Description</label>
                      <input
                        className="input"
                        type="text"
                        value={lens.description}
                        onChange={(e) => updateLens(lens.id, { description: e.target.value })}
                      />
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
                      <span className="form-label">Active</span>
                      <button
                        className={`toggle ${lens.active ? "active" : ""}`}
                        onClick={() => updateLens(lens.id, { active: !lens.active })}
                      />
                    </div>
                  </div>
                </div>

                {/* Section 2: Strategy Context */}
                <div>
                  <div className="lens-section-title">Strategy Context</div>
                  <textarea
                    className="input"
                    rows={4}
                    placeholder="Describe the strategic context this lens should consider when evaluating features. Include goals, constraints, and key metrics."
                    value={lens.strategyContext}
                    onChange={(e) => updateLens(lens.id, { strategyContext: e.target.value })}
                  />
                </div>

                {/* Section 3: Data Sources */}
                <div>
                  <div className="lens-section-title">Data Sources</div>
                  <div className="lens-data-sources">
                    {lens.dataSources.map((ds, idx) => (
                      <div key={idx} className="lens-data-card">
                        <div>
                          <div style={{ fontWeight: 600, fontSize: 13 }}>{ds.name}</div>
                          <div style={{ fontSize: 11, color: ds.connected ? "var(--green)" : "var(--text-muted)" }}>
                            {ds.connected ? "Connected" : "Not connected"}
                          </div>
                        </div>
                        <span className={`badge ${ds.connected ? "badge-green" : "badge-gray"}`}>
                          {ds.connected ? "CONNECTED" : "CONNECT"}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Section 4: Priority Fields */}
                <div>
                  <div className="lens-section-title">Priority Fields</div>
                  <div className="lens-priority-pills">
                    {PRIORITY_FIELDS.map((field) => (
                      <button
                        key={field}
                        className={`lens-priority-pill ${
                          lens.selectedPriorities.includes(field) ? "selected" : ""
                        }`}
                        onClick={() => togglePriority(lens.id, field)}
                      >
                        {field}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })}

      <div className="create-lens-card" onClick={handleCreateLens}>
        <Plus size={18} />
        <span>+ Create Custom Lens</span>
      </div>
    </div>
  );
}
