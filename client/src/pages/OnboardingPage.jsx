import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Check, Plus } from "lucide-react";
import NumberStepper from "../components/NumberStepper";
import { createRoadmap, createTeam, updateProfile } from "../services/api";

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

  const [creating, setCreating] = useState(false);

  async function handleCreateRoadmap() {
    if (creating) return;
    setCreating(true);
    try {
      const user = JSON.parse(localStorage.getItem("user") || "{}");
      const workspaceId = user.workspace_id;

      if (!workspaceId) {
        console.error("No workspace_id found");
        return;
      }

      // Create teams
      for (const team of teams) {
        if (team.name.trim()) {
          await createTeam(workspaceId, {
            name: team.name.trim(),
            developer_count: team.developers,
            capacity_method: team.capacityMethod,
            avg_output: team.avgOutput,
            sprint_length_weeks: parseInt(team.sprintLength, 10),
          }).catch(() => {});
        }
      }

      // Create roadmap
      const rm = await createRoadmap(workspaceId, {
        workspace_id: workspaceId,
        name: roadmapName.trim(),
        created_by: user.id,
      });

      // Save last roadmap ID
      await updateProfile({ last_roadmap_id: rm.id }).catch(() => {});
      const updatedUser = { ...user, lastRoadmapId: rm.id, last_roadmap_id: rm.id };
      localStorage.setItem("user", JSON.stringify(updatedUser));

      navigate(`/roadmap/${rm.id}`);
    } catch (err) {
      console.error("Failed to create roadmap:", err);
    } finally {
      setCreating(false);
    }
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

            <button
              className="btn btn-primary btn-full"
              onClick={handleCreateRoadmap}
              disabled={!roadmapName.trim() || creating}
            >
              {creating ? "Creating..." : "Create Roadmap"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
