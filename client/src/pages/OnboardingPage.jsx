import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Check, ArrowLeft } from "lucide-react";
import { submitOnboarding } from "../services/api";
import { useStore } from "../hooks/useStore";

const STEPS = [
  {
    questions: [
      {
        key: "company_size",
        label: "How big is your company?",
        options: ["1-10", "11-50", "51-200", "200+"],
      },
      {
        key: "company_nature",
        label: "What does your company do?",
        options: ["SaaS / Software", "E-commerce", "Agency / Consulting", "Fintech", "Healthcare"],
      },
    ],
  },
  {
    questions: [
      {
        key: "current_roadmap_tool",
        label: "Where do you keep your roadmap today?",
        options: ["Spreadsheets", "Jira", "Productboard", "Notion", "No roadmap yet"],
      },
      {
        key: "tracks_feature_requests",
        label: "Do you keep track of feature requests?",
        options: ["Yes, in HubSpot", "Yes, in Salesforce", "Yes, in Notion/Confluence", "Yes, in a spreadsheet", "No"],
      },
    ],
  },
  {
    questions: [
      {
        key: "crm",
        label: "Which CRM do you use?",
        options: ["HubSpot", "Salesforce", "Pipedrive", "None"],
      },
      {
        key: "dev_task_tool",
        label: "Where do you manage dev tasks?",
        options: ["Jira", "Linear", "Asana", "Trello", "GitHub Issues"],
      },
    ],
  },
];

export default function OnboardingPage() {
  const navigate = useNavigate();
  const { setCurrentUser } = useStore();
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState({});
  const [otherTexts, setOtherTexts] = useState({});
  const [submitting, setSubmitting] = useState(false);

  function selectAnswer(key, value) {
    if (value === "Other") {
      setAnswers((prev) => ({ ...prev, [key]: "Other" }));
    } else {
      setAnswers((prev) => ({ ...prev, [key]: value }));
      // Clear other text if switching away from Other
      setOtherTexts((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
  }

  function setOtherText(key, text) {
    setOtherTexts((prev) => ({ ...prev, [key]: text }));
  }

  function getResolvedAnswer(key) {
    if (answers[key] === "Other") {
      return otherTexts[key] || "Other";
    }
    return answers[key] || "";
  }

  function handleNext() {
    setStep((s) => s + 1);
  }

  function handleBack() {
    setStep((s) => s - 1);
  }

  function handleSkip() {
    if (step < STEPS.length - 1) {
      setStep((s) => s + 1);
    } else {
      handleSubmit();
    }
  }

  async function handleSubmit() {
    if (submitting) return;
    setSubmitting(true);
    try {
      const payload = {};
      for (const stepData of STEPS) {
        for (const q of stepData.questions) {
          payload[q.key] = getResolvedAnswer(q.key);
        }
      }

      const data = await submitOnboarding(payload);

      // Update local user data with onboarding_completed
      const user = JSON.parse(localStorage.getItem("user") || "{}");
      const updatedUser = { ...user, ...data.user, onboarding_completed: true, lastRoadmapId: data.user.last_roadmap_id || user.lastRoadmapId };
      localStorage.setItem("user", JSON.stringify(updatedUser));
      setCurrentUser(updatedUser);

      // Navigate to roadmap
      const roadmapId = updatedUser.lastRoadmapId || updatedUser.last_roadmap_id;
      navigate(roadmapId ? `/roadmap/${roadmapId}` : "/roadmaps", { replace: true });
    } catch (err) {
      console.error("Onboarding submit error:", err);
      // On error, still let them through
      const user = JSON.parse(localStorage.getItem("user") || "{}");
      const roadmapId = user.lastRoadmapId || user.last_roadmap_id;
      navigate(roadmapId ? `/roadmap/${roadmapId}` : "/roadmaps", { replace: true });
    } finally {
      setSubmitting(false);
    }
  }

  const isLastStep = step === STEPS.length - 1;
  const currentStep = STEPS[step];

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
      {/* Progress dots */}
      <div className="onboarding-progress">
        {STEPS.map((_, i) => (
          <React.Fragment key={i}>
            <div className={stepDotClass(i)}>
              {i < step ? <Check size={16} /> : i + 1}
            </div>
            {i < STEPS.length - 1 && <div className={stepLineClass(i)} />}
          </React.Fragment>
        ))}
      </div>

      <div className="onboarding-card">
        {/* Back button */}
        {step > 0 && (
          <button className="onboarding-back-btn" onClick={handleBack}>
            <ArrowLeft size={16} />
            Back
          </button>
        )}

        {currentStep.questions.map((q) => (
          <div key={q.key} className="onboarding-question">
            <h2>{q.label}</h2>
            <div className="onboarding-chips">
              {q.options.map((opt) => (
                <button
                  key={opt}
                  className={`onboarding-chip ${answers[q.key] === opt ? "selected" : ""}`}
                  onClick={() => selectAnswer(q.key, opt)}
                >
                  {opt}
                </button>
              ))}
              <button
                className={`onboarding-chip ${answers[q.key] === "Other" ? "selected" : ""}`}
                onClick={() => selectAnswer(q.key, "Other")}
              >
                Other
              </button>
            </div>
            {answers[q.key] === "Other" && (
              <input
                type="text"
                className="input onboarding-other-input"
                placeholder="Type your answer..."
                value={otherTexts[q.key] || ""}
                onChange={(e) => setOtherText(q.key, e.target.value)}
                autoFocus
              />
            )}
          </div>
        ))}

        <div className="onboarding-actions">
          {isLastStep ? (
            <button
              className="btn btn-primary btn-full"
              onClick={handleSubmit}
              disabled={submitting}
            >
              {submitting ? "Setting up..." : "Get started"}
            </button>
          ) : (
            <button
              className="btn btn-primary btn-full"
              onClick={handleNext}
            >
              Next
            </button>
          )}
          <button className="onboarding-skip" onClick={handleSkip}>
            Skip
          </button>
        </div>
      </div>
    </div>
  );
}
