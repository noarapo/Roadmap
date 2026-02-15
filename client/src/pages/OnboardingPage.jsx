import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Check, Plus } from "lucide-react";
import NumberStepper from "../components/NumberStepper";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const currentYear = new Date().getFullYear();
const YEARS = [currentYear, currentYear + 1, currentYear + 2, currentYear + 3];

function emptyTeam() {
  return {
    name: "",
    developers: 5,
    capacityMethod: "Story Points",
    avgOutput: 8,
    sprintLength: "2",
  };
}

export default function OnboardingPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);

  // Step 1
  const [companyName, setCompanyName] = useState("");

  // Step 2
  const [teams, setTeams] = useState([emptyTeam()]);

  // Step 3
  const [roadmapName, setRoadmapName] = useState("");
  const [startMonth, setStartMonth] = useState(MONTHS[new Date().getMonth()]);
  const [startYear, setStartYear] = useState(String(currentYear));
  const [endMonth, setEndMonth] = useState(MONTHS[Math.min(new Date().getMonth() + 5, 11)]);
  const [endYear, setEndYear] = useState(String(currentYear + 1));
  const [subdivision, setSubdivision] = useState("quarters");

  function updateTeam(index, field, value) {
    setTeams((prev) =>
      prev.map((t, i) => (i === index ? { ...t, [field]: value } : t))
    );
  }

  function addTeam() {
    setTeams((prev) => [...prev, emptyTeam()]);
  }

  function handleNext() {
    setStep((s) => s + 1);
  }

  function handleCreateRoadmap() {
    navigate("/roadmap/1");
  }

  function stepDotClass(dotStep) {
    if (dotStep < step) return "onboarding-step-dot completed";
    if (dotStep === step) return "onboarding-step-dot active";
    return "onboarding-step-dot upcoming";
  }

  function stepLineClass(lineAfterStep) {
    return lineAfterStep < step
      ? "onboarding-step-line completed"
      : "onboarding-step-line";
  }

  return (
    <div className="onboarding-page">
      {/* Progress bar */}
      <div className="onboarding-progress">
        <div className={stepDotClass(1)}>
          {step > 1 ? <Check size={16} /> : "1"}
        </div>
        <div className={stepLineClass(1)} />
        <div className={stepDotClass(2)}>
          {step > 2 ? <Check size={16} /> : "2"}
        </div>
        <div className={stepLineClass(2)} />
        <div className={stepDotClass(3)}>3</div>
      </div>

      {/* Step 1: Company / Team name */}
      {step === 1 && (
        <div className="onboarding-card">
          <h2>What's your company or team name?</h2>
          <div className="auth-form">
            <div className="form-group">
              <label className="form-label">Company / Team name</label>
              <input
                type="text"
                className="input"
                placeholder="e.g. Acme Corp"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
              />
            </div>
            <button
              className="btn btn-primary btn-full"
              onClick={handleNext}
              disabled={!companyName.trim()}
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* Step 2: Create teams */}
      {step === 2 && (
        <div className="onboarding-card">
          <h2>Create Your First Team</h2>
          <div className="auth-form">
            {teams.map((team, idx) => (
              <div
                key={idx}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "var(--space-4)",
                  paddingBottom: "var(--space-4)",
                  borderBottom:
                    idx < teams.length - 1
                      ? "1px solid var(--border-default)"
                      : "none",
                  marginBottom:
                    idx < teams.length - 1 ? "var(--space-4)" : "0",
                }}
              >
                {teams.length > 1 && (
                  <span className="small-label">Team {idx + 1}</span>
                )}

                <div className="form-group">
                  <label className="form-label">Team name</label>
                  <input
                    type="text"
                    className="input"
                    placeholder="e.g. Platform Team"
                    value={team.name}
                    onChange={(e) => updateTeam(idx, "name", e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Number of developers</label>
                  <NumberStepper
                    value={team.developers}
                    onChange={(val) => updateTeam(idx, "developers", val)}
                    min={1}
                    max={50}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Capacity method</label>
                  <select
                    className="input"
                    value={team.capacityMethod}
                    onChange={(e) =>
                      updateTeam(idx, "capacityMethod", e.target.value)
                    }
                  >
                    <option value="Story Points">Story Points</option>
                    <option value="Hours">Hours</option>
                    <option value="Tasks">Tasks</option>
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">
                    Avg output per developer per sprint
                  </label>
                  <input
                    type="number"
                    className="input"
                    placeholder="e.g. 8"
                    value={team.avgOutput}
                    onChange={(e) =>
                      updateTeam(idx, "avgOutput", e.target.value)
                    }
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Sprint length</label>
                  <select
                    className="input"
                    value={team.sprintLength}
                    onChange={(e) =>
                      updateTeam(idx, "sprintLength", e.target.value)
                    }
                  >
                    <option value="1">1 week</option>
                    <option value="2">2 weeks</option>
                    <option value="3">3 weeks</option>
                    <option value="4">4 weeks</option>
                  </select>
                </div>
              </div>
            ))}

            <button
              type="button"
              className="btn btn-ghost btn-full"
              onClick={addTeam}
            >
              <Plus size={14} />
              Add another team
            </button>

            <button
              className="btn btn-primary btn-full"
              onClick={handleNext}
              disabled={teams.some((t) => !t.name.trim())}
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Create roadmap */}
      {step === 3 && (
        <div className="onboarding-card">
          <h2>Create Your First Roadmap</h2>
          <div className="auth-form">
            <div className="form-group">
              <label className="form-label">Roadmap name</label>
              <input
                type="text"
                className="input"
                placeholder="e.g. Q1-Q2 Product Roadmap"
                value={roadmapName}
                onChange={(e) => setRoadmapName(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Time horizon start</label>
              <div style={{ display: "flex", gap: "var(--space-2)" }}>
                <select
                  className="input"
                  value={startMonth}
                  onChange={(e) => setStartMonth(e.target.value)}
                >
                  {MONTHS.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
                <select
                  className="input"
                  value={startYear}
                  onChange={(e) => setStartYear(e.target.value)}
                >
                  {YEARS.map((y) => (
                    <option key={y} value={String(y)}>
                      {y}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Time horizon end</label>
              <div style={{ display: "flex", gap: "var(--space-2)" }}>
                <select
                  className="input"
                  value={endMonth}
                  onChange={(e) => setEndMonth(e.target.value)}
                >
                  {MONTHS.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
                <select
                  className="input"
                  value={endYear}
                  onChange={(e) => setEndYear(e.target.value)}
                >
                  {YEARS.map((y) => (
                    <option key={y} value={String(y)}>
                      {y}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Subdivision</label>
              <div className="radio-group">
                <div
                  className={`radio-option ${subdivision === "quarters" ? "selected" : ""}`}
                  onClick={() => setSubdivision("quarters")}
                >
                  <div className="radio-dot">
                    <div className="radio-dot-inner" />
                  </div>
                  Quarters (Q1, Q2, Q3, Q4)
                </div>
                <div
                  className={`radio-option ${subdivision === "months" ? "selected" : ""}`}
                  onClick={() => setSubdivision("months")}
                >
                  <div className="radio-dot">
                    <div className="radio-dot-inner" />
                  </div>
                  Months (Jan, Feb, Mar...)
                </div>
                <div
                  className={`radio-option ${subdivision === "sprints" ? "selected" : ""}`}
                  onClick={() => setSubdivision("sprints")}
                >
                  <div className="radio-dot">
                    <div className="radio-dot-inner" />
                  </div>
                  Sprints (Sprint 1, Sprint 2...)
                </div>
              </div>
            </div>

            <button
              className="btn btn-primary btn-full"
              onClick={handleCreateRoadmap}
              disabled={!roadmapName.trim()}
            >
              Create Roadmap
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
