import React, { useState, useEffect } from "react";

const STEPS = [
  {
    title: "Welcome to Roadway!",
    description: "Your new home for roadmap planning. Let's walk through the basics so you can get started quickly.",
    illustration: (
      <svg viewBox="0 0 280 160" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="20" y="20" width="240" height="120" rx="12" fill="#F0FDF9" stroke="#2D6A5E" strokeWidth="2" />
        <rect x="40" y="50" width="60" height="30" rx="6" fill="#2D6A5E" />
        <rect x="110" y="50" width="60" height="30" rx="6" fill="#38A89D" />
        <rect x="180" y="50" width="60" height="30" rx="6" fill="#81E6D9" />
        <rect x="40" y="90" width="60" height="30" rx="6" fill="#38A89D" />
        <rect x="110" y="90" width="130" height="30" rx="6" fill="#81E6D9" />
        <text x="140" y="38" textAnchor="middle" fill="#2D6A5E" fontSize="13" fontWeight="600">My Roadmap</text>
      </svg>
    ),
  },
  {
    title: "Your Sprint Board",
    description: "Your roadmap is organized into sprints (columns) and feature rows. Drag cards across sprints to plan your timeline, and click + to add new features.",
    illustration: (
      <svg viewBox="0 0 280 160" fill="none" xmlns="http://www.w3.org/2000/svg">
        {/* Column headers */}
        <rect x="10" y="10" width="80" height="24" rx="4" fill="#E2E8F0" />
        <text x="50" y="26" textAnchor="middle" fill="#64748B" fontSize="9" fontWeight="600">Sprint 1</text>
        <rect x="100" y="10" width="80" height="24" rx="4" fill="#E2E8F0" />
        <text x="140" y="26" textAnchor="middle" fill="#64748B" fontSize="9" fontWeight="600">Sprint 2</text>
        <rect x="190" y="10" width="80" height="24" rx="4" fill="#E2E8F0" />
        <text x="230" y="26" textAnchor="middle" fill="#64748B" fontSize="9" fontWeight="600">Sprint 3</text>
        {/* Grid lines */}
        <line x1="95" y1="10" x2="95" y2="150" stroke="#E2E8F0" strokeWidth="1" />
        <line x1="185" y1="10" x2="185" y2="150" stroke="#E2E8F0" strokeWidth="1" />
        {/* Cards */}
        <rect x="15" y="45" width="72" height="28" rx="5" fill="#2D6A5E" />
        <text x="51" y="63" textAnchor="middle" fill="white" fontSize="8" fontWeight="500">Auth flow</text>
        <rect x="105" y="45" width="72" height="28" rx="5" fill="#38A89D" />
        <text x="141" y="63" textAnchor="middle" fill="white" fontSize="8" fontWeight="500">Dashboard</text>
        <rect x="15" y="85" width="72" height="28" rx="5" fill="#38A89D" />
        <text x="51" y="103" textAnchor="middle" fill="white" fontSize="8" fontWeight="500">API v2</text>
        {/* Drag arrow */}
        <path d="M90 99 L190 59" stroke="#2D6A5E" strokeWidth="1.5" strokeDasharray="4 3" markerEnd="url(#arrowhead)" />
        <defs>
          <marker id="arrowhead" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
            <path d="M0 0 L8 3 L0 6" fill="none" stroke="#2D6A5E" strokeWidth="1.5" />
          </marker>
        </defs>
        <rect x="195" y="85" width="72" height="28" rx="5" fill="#81E6D9" />
        <text x="231" y="103" textAnchor="middle" fill="#2D6A5E" fontSize="8" fontWeight="500">Settings</text>
        {/* Plus button */}
        <circle cx="231" cy="140" r="10" fill="#F0FDF9" stroke="#2D6A5E" strokeWidth="1.5" />
        <text x="231" y="144" textAnchor="middle" fill="#2D6A5E" fontSize="14" fontWeight="400">+</text>
      </svg>
    ),
  },
  {
    title: "Feature Drawer",
    description: "Click any card to open its detail drawer. Add descriptions, set status, assign teams, track effort, and manage everything about a feature in one place.",
    illustration: (
      <svg viewBox="0 0 280 160" fill="none" xmlns="http://www.w3.org/2000/svg">
        {/* Board background */}
        <rect x="10" y="10" width="140" height="140" rx="8" fill="#F7FAFC" stroke="#E2E8F0" strokeWidth="1" />
        <rect x="20" y="30" width="50" height="20" rx="4" fill="#CBD5E0" />
        <rect x="80" y="30" width="50" height="20" rx="4" fill="#CBD5E0" />
        <rect x="20" y="60" width="50" height="20" rx="4" fill="#CBD5E0" />
        {/* Drawer panel */}
        <rect x="155" y="10" width="115" height="140" rx="8" fill="white" stroke="#2D6A5E" strokeWidth="2" />
        <text x="165" y="32" fill="#2D6A5E" fontSize="10" fontWeight="600">Auth flow</text>
        <line x1="165" y1="40" x2="260" y2="40" stroke="#E2E8F0" strokeWidth="1" />
        {/* Fields */}
        <text x="165" y="56" fill="#94A3B8" fontSize="7">Status</text>
        <rect x="165" y="60" width="40" height="14" rx="3" fill="#2D6A5E" />
        <text x="170" y="70" fill="white" fontSize="7">In progress</text>
        <text x="165" y="86" fill="#94A3B8" fontSize="7">Team</text>
        <rect x="165" y="90" width="35" height="14" rx="3" fill="#E2E8F0" />
        <text x="170" y="100" fill="#64748B" fontSize="7">Frontend</text>
        <text x="165" y="116" fill="#94A3B8" fontSize="7">Effort</text>
        <rect x="165" y="120" width="20" height="14" rx="3" fill="#E2E8F0" />
        <text x="170" y="130" fill="#64748B" fontSize="7">5 pts</text>
        {/* Click indicator */}
        <circle cx="95" cy="40" r="6" fill="#2D6A5E" opacity="0.3" />
        <circle cx="95" cy="40" r="3" fill="#2D6A5E" />
      </svg>
    ),
  },
  {
    title: "Integrations",
    description: "Connect your favorite tools — Linear, Notion, HubSpot — to sync issues, import pages, and enrich your roadmap with real data. Set them up anytime from Settings.",
    illustration: (
      <svg viewBox="0 0 280 160" fill="none" xmlns="http://www.w3.org/2000/svg">
        {/* Center hub */}
        <circle cx="140" cy="80" r="28" fill="#2D6A5E" />
        <text x="140" y="76" textAnchor="middle" fill="white" fontSize="11" fontWeight="600">R</text>
        <text x="140" y="90" textAnchor="middle" fill="#81E6D9" fontSize="7">Roadway</text>
        {/* Linear */}
        <circle cx="50" cy="45" r="22" fill="#F0FDF9" stroke="#5E6AD2" strokeWidth="2" />
        <text x="50" y="43" textAnchor="middle" fill="#5E6AD2" fontSize="17" fontWeight="700">L</text>
        <text x="50" y="54" textAnchor="middle" fill="#5E6AD2" fontSize="6">Linear</text>
        <line x1="72" y1="55" x2="112" y2="70" stroke="#5E6AD2" strokeWidth="1.5" strokeDasharray="4 3" />
        {/* Notion */}
        <circle cx="50" cy="120" r="22" fill="#F0FDF9" stroke="#191919" strokeWidth="2" />
        <text x="50" y="118" textAnchor="middle" fill="#191919" fontSize="17" fontWeight="700">N</text>
        <text x="50" y="129" textAnchor="middle" fill="#191919" fontSize="6">Notion</text>
        <line x1="72" y1="110" x2="112" y2="90" stroke="#191919" strokeWidth="1.5" strokeDasharray="4 3" />
        {/* HubSpot */}
        <circle cx="230" cy="45" r="22" fill="#F0FDF9" stroke="#FF7A59" strokeWidth="2" />
        <text x="230" y="43" textAnchor="middle" fill="#FF7A59" fontSize="17" fontWeight="700">H</text>
        <text x="230" y="54" textAnchor="middle" fill="#FF7A59" fontSize="6">HubSpot</text>
        <line x1="208" y1="55" x2="168" y2="70" stroke="#FF7A59" strokeWidth="1.5" strokeDasharray="4 3" />
        {/* Sync arrows */}
        <circle cx="230" cy="120" r="22" fill="#F0FDF9" stroke="#2D6A5E" strokeWidth="2" />
        <text x="230" y="118" textAnchor="middle" fill="#2D6A5E" fontSize="13" fontWeight="400">+</text>
        <text x="230" y="130" textAnchor="middle" fill="#2D6A5E" fontSize="6">More</text>
        <line x1="208" y1="110" x2="168" y2="90" stroke="#2D6A5E" strokeWidth="1.5" strokeDasharray="4 3" />
      </svg>
    ),
  },
  {
    title: "Custom Fields",
    description: "Make Roadway yours — add custom fields like ROI scores, contract dates, priority tiers, or anything your team needs. Toggle fields on and off per-view to keep things focused.",
    illustration: (
      <svg viewBox="0 0 280 160" fill="none" xmlns="http://www.w3.org/2000/svg">
        {/* Panel background */}
        <rect x="40" y="10" width="200" height="140" rx="10" fill="white" stroke="#E2E8F0" strokeWidth="2" />
        <text x="140" y="32" textAnchor="middle" fill="#2D6A5E" fontSize="10" fontWeight="600">Drawer Setup</text>
        <line x1="60" y1="40" x2="220" y2="40" stroke="#E2E8F0" strokeWidth="1" />
        {/* Field rows with toggles */}
        {[
          { label: "Status", on: true, y: 52 },
          { label: "ROI Score", on: true, y: 74 },
          { label: "Contract Date", on: false, y: 96 },
          { label: "Priority Tier", on: true, y: 118 },
        ].map((f) => (
          <g key={f.label}>
            <text x="70" y={f.y + 10} fill="#334155" fontSize="9">{f.label}</text>
            {/* Toggle track */}
            <rect x="185" y={f.y + 1} width="26" height="14" rx="7" fill={f.on ? "#2D6A5E" : "#CBD5E0"} />
            {/* Toggle knob */}
            <circle cx={f.on ? 204 : 192} cy={f.y + 8} r="5" fill="white" />
          </g>
        ))}
        {/* Add field button */}
        <rect x="70" y="137" width="80" height="0" rx="0" fill="none" />
      </svg>
    ),
  },
  {
    title: "Collaborate & Comment",
    description: "Work together in real-time — invite your team, leave comments directly on cards, and discuss decisions right where they happen. Press C to toggle comment mode and click anywhere on the board.",
    illustration: (
      <svg viewBox="0 0 280 160" fill="none" xmlns="http://www.w3.org/2000/svg">
        {/* Board background */}
        <rect x="10" y="10" width="260" height="140" rx="10" fill="#F7FAFC" stroke="#E2E8F0" strokeWidth="1" />
        {/* Cards */}
        <rect x="25" y="35" width="70" height="28" rx="5" fill="#2D6A5E" />
        <text x="60" y="53" textAnchor="middle" fill="white" fontSize="8" fontWeight="500">Auth flow</text>
        <rect x="105" y="35" width="70" height="28" rx="5" fill="#38A89D" />
        <text x="140" y="53" textAnchor="middle" fill="white" fontSize="8" fontWeight="500">Dashboard</text>
        {/* Comment bubble 1 */}
        <rect x="160" y="75" width="95" height="32" rx="8" fill="white" stroke="#2D6A5E" strokeWidth="1.5" />
        <circle cx="175" cy="91" r="8" fill="#E6FFFA" />
        <text x="175" y="94" textAnchor="middle" fill="#2D6A5E" fontSize="8" fontWeight="600">N</text>
        <text x="190" y="88" fill="#334155" fontSize="7" fontWeight="500">Should we split</text>
        <text x="190" y="97" fill="#334155" fontSize="7" fontWeight="500">this into two?</text>
        {/* Comment bubble 2 */}
        <rect x="30" y="85" width="85" height="32" rx="8" fill="white" stroke="#38A89D" strokeWidth="1.5" />
        <circle cx="45" cy="101" r="8" fill="#F0FDF9" />
        <text x="45" y="104" textAnchor="middle" fill="#38A89D" fontSize="8" fontWeight="600">A</text>
        <text x="59" y="98" fill="#334155" fontSize="7" fontWeight="500">Looks good!</text>
        <text x="59" y="107" fill="#334155" fontSize="7" fontWeight="500">Ship it.</text>
        {/* Avatars row */}
        <circle cx="200" cy="135" r="10" fill="#2D6A5E" />
        <text x="200" y="138" textAnchor="middle" fill="white" fontSize="8" fontWeight="600">N</text>
        <circle cx="218" cy="135" r="10" fill="#38A89D" />
        <text x="218" y="138" textAnchor="middle" fill="white" fontSize="8" fontWeight="600">A</text>
        <circle cx="236" cy="135" r="10" fill="#81E6D9" />
        <text x="236" y="138" textAnchor="middle" fill="#2D6A5E" fontSize="8" fontWeight="600">+</text>
        <text x="185" y="138" textAnchor="end" fill="#94A3B8" fontSize="7">Team</text>
      </svg>
    ),
  },
];

export default function WelcomeGuide({ onComplete }) {
  const [step, setStep] = useState(0);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape") onComplete();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onComplete]);

  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;

  return (
    <div className="welcome-guide-overlay" onClick={onComplete}>
      <div className="welcome-guide-modal" onClick={(e) => e.stopPropagation()}>
        <div className="welcome-guide-illustration">
          {current.illustration}
        </div>
        <div className="welcome-guide-content">
          <h2 className="welcome-guide-title">{current.title}</h2>
          <p className="welcome-guide-desc">{current.description}</p>
        </div>
        <div className="welcome-guide-footer">
          <div className="welcome-guide-dots">
            {STEPS.map((_, i) => (
              <span
                key={i}
                className={`welcome-guide-dot${i === step ? " active" : ""}${i < step ? " completed" : ""}`}
                onClick={() => setStep(i)}
              />
            ))}
          </div>
          <div className="welcome-guide-actions">
            {step > 0 && (
              <button className="welcome-guide-btn-back" onClick={() => setStep(s => s - 1)}>
                Back
              </button>
            )}
            <button className="welcome-guide-btn-next" onClick={isLast ? onComplete : () => setStep(s => s + 1)}>
              {isLast ? "Get started" : "Next"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
