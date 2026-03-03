import React, { useState, useEffect, useCallback, useRef } from "react";

/* ------------------------------------------------------------------
 *  Tutorial Steps
 *
 *  step === -1 is the welcome screen (no spotlight).
 *  Steps 0-4 are guide steps. Some use real DOM selectors,
 *  others use static mockups for instant rendering.
 * ------------------------------------------------------------------ */

const GUIDE_STEPS = [
  {
    selector: ".feature-card",
    title: "Feature cards",
    description:
      "These are your feature cards — the building blocks of your roadmap. Each one represents a feature, task, or initiative your team is planning. Click the + button in any cell to add more, and drag cards across sprints to plan your timeline.",
    position: "right",
    requiresSetup: "closeChat",
  },
  {
    selector: ".actions-dropdown-menu",
    title: "Import or upload",
    description:
      "Already have a roadmap somewhere else? Import from your favorite tools or drop any file here — .csv, .xlsx, .json, or even a plain text list — and the AI Assistant will automatically turn it into cards on your board.",
    position: "left",
    requiresSetup: "openImport",
  },
  {
    mockup: "drawer",
    title: "Your feature drawer",
    description:
      "Click any card to open its detail drawer. Here you can add descriptions, assign teams, track effort estimates, manage tags, and configure custom fields — everything you need to plan a feature. Switch between the Details tab and integration tabs to see linked data.",
    position: "left",
    requiresSetup: "closePanels",
  },
  {
    mockup: "workspace",
    title: "Customize your workspace",
    description:
      "This is your workspace editor. Toggle fields on or off, add custom fields, and manage your integrations — all from one place. Changes are saved automatically.",
    position: "left",
    requiresSetup: "closePanels",
  },
  {
    selector: ".triage-drawer",
    title: "Triage",
    description:
      "Unscheduled cards live here in Triage. When you import features or create cards without assigning them to a sprint, they'll appear in this drawer. Drag cards from here onto the roadmap when you're ready to schedule them.",
    position: "top",
    requiresSetup: "openTriage",
  },
];

const TOTAL_GUIDE_STEPS = GUIDE_STEPS.length;

/* ---- Static mockup components ---- */

function DrawerMockup() {
  return (
    <div className="side-panel-overlay" style={{ position: "relative", width: 380, animation: "none", boxShadow: "var(--shadow-panel)" }}>
      {/* Header */}
      <div className="sp-header">
        <div className="sp-header-row">
          <span style={{ width: 16, height: 16, display: "inline-flex", alignItems: "center", justifyContent: "center", color: "var(--text-muted)" }}>✕</span>
          <div style={{ flex: 1 }} />
          <span style={{ color: "var(--text-muted)", fontSize: 14 }}>⚙</span>
        </div>
        <h2 className="sp-name" style={{ cursor: "default" }}>Mobile App Optimization</h2>
        <div className="sp-description-placeholder" style={{ cursor: "default" }}>Add a description...</div>
      </div>
      {/* Tabs */}
      <div className="sp-tabs">
        <div className="sp-tabs-inner">
          <button type="button" className="sp-tab active" style={{ cursor: "default" }}>Details</button>
          <button type="button" className="sp-tab" style={{ cursor: "default" }}>HubSpot</button>
          <button type="button" className="sp-tab" style={{ cursor: "default" }}>Linear</button>
        </div>
      </div>
      {/* Fields */}
      <div className="sp-fields">
        <div className="sp-field sp-field-block">
          <div className="sp-field-header">
            <span style={{ color: "var(--text-muted)", fontSize: 12 }}>👥</span>
            <span className="sp-field-label" style={{ marginBottom: 0 }}>Teams</span>
          </div>
          <div className="sp-teams">
            <div className="sp-team-row">
              <span className="sp-team-color" style={{ background: "#2D6A5E" }} />
              <span className="sp-team-name">Engineering</span>
              <div className="sp-team-effort"><span style={{ fontSize: 13, color: "var(--text-primary)" }}>8</span><span className="sp-unit">sp</span></div>
            </div>
            <div className="sp-team-row">
              <span className="sp-team-color" style={{ background: "#E67E22" }} />
              <span className="sp-team-name">Design</span>
              <div className="sp-team-effort"><span style={{ fontSize: 13, color: "var(--text-primary)" }}>3</span><span className="sp-unit">sp</span></div>
            </div>
          </div>
        </div>
        <div className="sp-field">
          <span className="sp-field-label">Ends on</span>
          <div className="sp-field-value"><span className="sp-readonly">Apr 25</span></div>
        </div>
        <div className="sp-field">
          <span className="sp-field-label">Duration</span>
          <div className="sp-field-value"><span className="sp-readonly">2 sprints</span></div>
        </div>
        <div className="sp-field sp-field-block">
          <div className="sp-field-header">
            <span style={{ color: "var(--text-muted)", fontSize: 12 }}>🏷</span>
            <span className="sp-field-label" style={{ marginBottom: 0 }}>Tags</span>
          </div>
          <div className="sp-tags">
            <span className="sp-tag">mobile</span>
            <span className="sp-tag">performance</span>
          </div>
        </div>
        <div className="sp-field">
          <span className="sp-field-label">Priority</span>
          <div className="sp-field-value"><span className="sp-readonly" style={{ color: "var(--green)", fontWeight: 500 }}>High</span></div>
        </div>
      </div>
    </div>
  );
}

function WorkspaceMockup() {
  const Toggle = ({ on }) => (
    <span style={{
      width: 28, height: 16, borderRadius: 8, display: "inline-block", position: "relative",
      background: on ? "var(--teal)" : "var(--border-default)", transition: "background 120ms",
    }}>
      <span style={{
        width: 12, height: 12, borderRadius: "50%", background: "#fff", position: "absolute",
        top: 2, left: on ? 14 : 2, transition: "left 120ms",
      }} />
    </span>
  );
  return (
    <div className="side-panel-overlay" style={{ position: "relative", width: 380, animation: "none", boxShadow: "var(--shadow-panel)" }}>
      <div className="sp-header">
        <div className="sp-header-row">
          <span style={{ width: 16, height: 16, display: "inline-flex", alignItems: "center", justifyContent: "center", color: "var(--text-muted)" }}>←</span>
          <span style={{ fontSize: 14, fontWeight: 600 }}>Customize Drawer</span>
          <div style={{ flex: 1 }} />
        </div>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px" }}>
        {/* Integrations section */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
            <span style={{ fontSize: 11, color: "var(--text-muted)" }}>▼</span>
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>Integrations</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", background: "var(--bg-secondary)", borderRadius: 8 }}>
              <span style={{ fontSize: 10, fontWeight: 700, background: "#FF7A59", color: "#fff", padding: "2px 5px", borderRadius: 4 }}>HS</span>
              <span style={{ fontSize: 12, fontWeight: 500 }}>HubSpot</span>
              <span style={{ fontSize: 10, color: "var(--green)", marginLeft: "auto" }}>● Connected</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", background: "var(--bg-secondary)", borderRadius: 8 }}>
              <span style={{ fontSize: 10, fontWeight: 700, background: "#5E6AD2", color: "#fff", padding: "2px 5px", borderRadius: 4 }}>Li</span>
              <span style={{ fontSize: 12, fontWeight: 500 }}>Linear</span>
              <span style={{ fontSize: 10, color: "var(--green)", marginLeft: "auto" }}>● Connected</span>
            </div>
          </div>
        </div>
        {/* Fields section */}
        <div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 11, color: "var(--text-muted)" }}>▼</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>Fields</span>
            </div>
            <span style={{ fontSize: 11, color: "var(--teal)", fontWeight: 600 }}>6</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {[
              { name: "Teams", on: true },
              { name: "Ends on", on: true },
              { name: "Duration", on: true },
              { name: "Tags", on: true },
              { name: "Priority", on: true },
              { name: "Revenue", on: false },
            ].map((f) => (
              <div key={f.name} className="config-reorder-row" style={{ opacity: f.on ? 1 : 0.45 }}>
                <span className="config-drag-handle" style={{ opacity: 0.4 }}>⠿</span>
                <span className="config-reorder-name">{f.name}</span>
                <Toggle on={f.on} />
              </div>
            ))}
          </div>
          <div className="config-add-field-btn" style={{ marginTop: 10, cursor: "default" }}>
            <span style={{ fontSize: 11 }}>+</span> Add field
          </div>
        </div>
      </div>
    </div>
  );
}

export default function TutorialOverlay({
  onComplete,
  onOpenCard,
  onCloseCard,
  onOpenImport,
  onCloseImport,
  onCloseChat,
  onOpenSetup,
  onCloseSetup,
  onOpenTriage,
}) {
  const [step, setStep] = useState(-1);
  const [targetRect, setTargetRect] = useState(null);
  const [ready, setReady] = useState(false);
  const tooltipRef = useRef(null);
  const mockupRef = useRef(null);
  const [tooltipHeight, setTooltipHeight] = useState(200);

  const cbRef = useRef({});
  cbRef.current = { onComplete, onOpenCard, onCloseCard, onOpenImport, onCloseImport, onCloseChat, onOpenSetup, onCloseSetup, onOpenTriage };

  const isWelcome = step === -1;
  const guideStep = isWelcome ? null : GUIDE_STEPS[step];
  const isMockupStep = guideStep && guideStep.mockup;

  /* ---- Find and measure the target element ---- */
  const findAndMeasureTarget = useCallback((stepIdx) => {
    const s = GUIDE_STEPS[stepIdx];
    if (!s) return null;
    if (s.mockup) return null; // mockup steps don't use selectors
    const el = document.querySelector(s.selector);
    if (!el) return null;
    el.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
    const rect = el.getBoundingClientRect();
    return { top: rect.top, left: rect.left, width: rect.width, height: rect.height };
  }, []);

  /* ---- Measure mockup element ---- */
  useEffect(() => {
    if (!isMockupStep || !mockupRef.current) return;
    const rect = mockupRef.current.getBoundingClientRect();
    setTargetRect({ top: rect.top, left: rect.left, width: rect.width, height: rect.height });
    setReady(true);
  });

  /* ---- Run setup actions and poll for target element ---- */
  useEffect(() => {
    if (step === -1) {
      setReady(true);
      return;
    }

    setReady(false);
    setTargetRect(null);

    const s = GUIDE_STEPS[step];
    if (!s) {
      cbRef.current.onComplete();
      return;
    }

    // Mockup steps: close all panels and mark ready immediately
    if (s.mockup || s.requiresSetup === "closePanels") {
      const cb = cbRef.current;
      cb.onCloseChat();
      cb.onCloseCard();
      cb.onCloseImport();
      cb.onCloseSetup();
      // Ready is set by the mockup measurement effect above
      return;
    }

    let cancelled = false;
    let timerId = null;
    let attempts = 0;
    const maxAttempts = 20;

    function pollForTarget(stepIdx) {
      if (cancelled) return;
      const rect = findAndMeasureTarget(stepIdx);
      if (rect) {
        setTargetRect(rect);
        setReady(true);
      } else {
        attempts++;
        if (attempts >= maxAttempts) {
          const nextStep = step + 1;
          if (nextStep >= GUIDE_STEPS.length) {
            cbRef.current.onComplete();
          } else {
            setStep(nextStep);
          }
          return;
        }
        timerId = setTimeout(() => pollForTarget(stepIdx), 250);
      }
    }

    const cb = cbRef.current;
    if (s.requiresSetup === "closeChat") {
      cb.onCloseChat();
      cb.onCloseCard();
      cb.onCloseImport();
      cb.onCloseSetup();
    } else if (s.requiresSetup === "openImport") {
      cb.onCloseChat();
      cb.onCloseCard();
      cb.onCloseSetup();
      cb.onOpenImport();
    } else if (s.requiresSetup === "openTriage") {
      cb.onCloseChat();
      cb.onCloseCard();
      cb.onCloseImport();
      cb.onCloseSetup();
      cb.onOpenTriage();
    } else {
      cb.onCloseImport();
      cb.onCloseSetup();
    }

    timerId = setTimeout(() => pollForTarget(step), 150);

    return () => {
      cancelled = true;
      if (timerId) clearTimeout(timerId);
    };
  }, [step, findAndMeasureTarget]);

  /* ---- Recalculate position on resize/scroll ---- */
  useEffect(() => {
    if (!ready || isWelcome || isMockupStep) return;
    const recalc = () => {
      const rect = findAndMeasureTarget(step);
      if (rect) setTargetRect(rect);
    };
    window.addEventListener("resize", recalc);
    window.addEventListener("scroll", recalc, true);
    return () => {
      window.removeEventListener("resize", recalc);
      window.removeEventListener("scroll", recalc, true);
    };
  }, [ready, isWelcome, isMockupStep, step, findAndMeasureTarget]);

  /* ---- Measure tooltip height for positioning ---- */
  useEffect(() => {
    if (tooltipRef.current) {
      setTooltipHeight(tooltipRef.current.offsetHeight);
    }
  });

  /* ---- Escape key to dismiss ---- */
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape") onComplete();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onComplete]);

  /* ---- Navigation helpers ---- */
  const goNext = useCallback(() => {
    if (isWelcome) {
      setStep(0);
    } else if (step >= GUIDE_STEPS.length - 1) {
      onComplete();
    } else {
      setStep((s) => s + 1);
    }
  }, [isWelcome, step, onComplete]);

  const goBack = useCallback(() => {
    if (step === 0) {
      setStep(-1);
    } else {
      setStep((s) => s - 1);
    }
  }, [step]);

  /* ==================================================================
     LOADING STATE
     ================================================================== */
  if (!ready && !isMockupStep) {
    return (
      <div className="tutorial-overlay" style={{ pointerEvents: "all" }}>
        <div style={{ position: "absolute", inset: 0, background: "rgba(0, 0, 0, 0.55)" }} />
      </div>
    );
  }

  /* ==================================================================
     WELCOME SCREEN (step -1)
     ================================================================== */
  if (isWelcome) {
    return (
      <div className="tutorial-overlay">
        <svg className="tutorial-overlay-svg" width="100%" height="100%">
          <rect width="100%" height="100%" fill="rgba(0, 0, 0, 0.55)" />
        </svg>
        <div className="tutorial-welcome">
          <button className="tutorial-close-btn" type="button" onClick={onComplete} aria-label="Close tour">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
          <div className="tutorial-welcome-title">Welcome to your roadmap!</div>
          <div className="tutorial-welcome-desc">
            Let's take a quick look around so you can hit the ground running.
            This will only take a moment — you can skip anytime.
          </div>
          <div className="tutorial-welcome-actions">
            <button className="tutorial-btn-skip" type="button" onClick={onComplete}>
              Skip tour
            </button>
            <button className="tutorial-btn-next" type="button" onClick={goNext}>
              Show me around
            </button>
          </div>
        </div>
      </div>
    );
  }

  /* ==================================================================
     MOCKUP STEPS — render static preview with spotlight
     ================================================================== */
  if (isMockupStep) {
    const MockupComponent = guideStep.mockup === "drawer" ? DrawerMockup : WorkspaceMockup;

    // Position mockup: right side of viewport, vertically centered
    const mockupStyle = {
      position: "fixed",
      top: "50%",
      right: "80px",
      transform: "translateY(-50%)",
      zIndex: 60,
    };

    const padding = 10;
    const hasRect = targetRect != null;

    // Compute cutout + tooltip positioning from mockup rect
    let cutout = null;
    let tooltipStyle = {};
    if (hasRect) {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      cutout = {
        x: Math.max(0, targetRect.left - padding),
        y: Math.max(0, targetRect.top - padding),
        w: Math.min(vw, targetRect.left + targetRect.width + padding) - Math.max(0, targetRect.left - padding),
        h: Math.min(vh, targetRect.top + targetRect.height + padding) - Math.max(0, targetRect.top - padding),
        rx: 12,
      };
      const tooltipWidth = 320;
      const tooltipGap = 16;
      const margin = 12;
      let left = cutout.x - tooltipGap - tooltipWidth;
      let top = cutout.y + cutout.h / 2 - tooltipHeight / 2;
      left = Math.max(margin, Math.min(vw - tooltipWidth - margin, left));
      top = Math.max(margin, Math.min(vh - tooltipHeight - margin, top));
      tooltipStyle = { top, left };
    }

    const isLast = step === GUIDE_STEPS.length - 1;

    return (
      <div className="tutorial-overlay">
        <svg className="tutorial-overlay-svg" width="100%" height="100%">
          {hasRect && cutout ? (
            <>
              <defs>
                <mask id="tutorial-mask">
                  <rect width="100%" height="100%" fill="white" />
                  <rect x={cutout.x} y={cutout.y} width={cutout.w} height={cutout.h} rx={cutout.rx} fill="black" />
                </mask>
              </defs>
              <rect width="100%" height="100%" fill="rgba(0, 0, 0, 0.55)" mask="url(#tutorial-mask)" />
            </>
          ) : (
            <rect width="100%" height="100%" fill="rgba(0, 0, 0, 0.55)" />
          )}
        </svg>

        {/* Static mockup */}
        <div style={mockupStyle} ref={mockupRef}>
          <MockupComponent />
        </div>

        {hasRect && cutout && (
          <div
            className="tutorial-spotlight-ring"
            style={{ top: cutout.y, left: cutout.x, width: cutout.w, height: cutout.h, borderRadius: cutout.rx }}
          />
        )}

        {/* Tooltip */}
        {hasRect && (
          <div className="tutorial-tooltip" style={tooltipStyle} ref={tooltipRef}>
            <button className="tutorial-close-btn" type="button" onClick={onComplete} aria-label="Close tour">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
            <div className="tutorial-tooltip-header">
              <span className="tutorial-tooltip-step">Step {step + 1} of {TOTAL_GUIDE_STEPS}</span>
            </div>
            <div className="tutorial-tooltip-title">{guideStep.title}</div>
            <div className="tutorial-tooltip-desc">{guideStep.description}</div>
            <div className="tutorial-tooltip-footer">
              <div className="tutorial-dots">
                {GUIDE_STEPS.map((_, i) => (
                  <span key={i} className={`tutorial-dot${i === step ? " active" : ""}${i < step ? " completed" : ""}`} />
                ))}
              </div>
              <div className="tutorial-tooltip-actions">
                <button className="tutorial-btn-back" type="button" onClick={goBack}>Back</button>
                <button className="tutorial-btn-next" type="button" onClick={goNext}>{isLast ? "Get started" : "Next"}</button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  /* ==================================================================
     SPOTLIGHT STEPS (real DOM elements)
     ================================================================== */
  if (!targetRect) {
    return (
      <div className="tutorial-overlay">
        <svg className="tutorial-overlay-svg" width="100%" height="100%">
          <rect width="100%" height="100%" fill="rgba(0, 0, 0, 0.55)" />
        </svg>
      </div>
    );
  }

  const padding = 8;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const rawX = targetRect.left - padding;
  const rawY = targetRect.top - padding;
  const rawR = targetRect.left + targetRect.width + padding;
  const rawB = targetRect.top + targetRect.height + padding;
  const cutout = {
    x: Math.max(0, rawX),
    y: Math.max(0, rawY),
    w: Math.min(vw, rawR) - Math.max(0, rawX),
    h: Math.min(vh, rawB) - Math.max(0, rawY),
    rx: 8,
  };

  const tooltipWidth = 320;
  const tooltipGap = 16;
  const margin = 12;
  let tooltipStyle = {};

  const spaceLeft = cutout.x - tooltipGap;
  const spaceRight = vw - (cutout.x + cutout.w) - tooltipGap;
  const spaceTop = cutout.y - tooltipGap;
  const spaceBottom = vh - (cutout.y + cutout.h) - tooltipGap;

  let left, top;
  const pos = guideStep.position;
  const fitsLeft = spaceLeft >= tooltipWidth + margin;
  const fitsRight = spaceRight >= tooltipWidth + margin;

  if (pos === "left" || pos === "right") {
    const preferLeft = pos === "left";
    const useLeft = preferLeft ? (fitsLeft || !fitsRight) : (!fitsRight && fitsLeft);

    if (useLeft) {
      left = cutout.x - tooltipGap - tooltipWidth;
    } else {
      left = cutout.x + cutout.w + tooltipGap;
    }
    top = cutout.y + cutout.h / 2 - tooltipHeight / 2;
  } else if (pos === "top" || pos === "bottom") {
    const preferTop = pos === "top";
    const useTop = preferTop ? (spaceTop >= tooltipHeight + margin || spaceBottom < tooltipHeight + margin) : (spaceTop < tooltipHeight + margin);

    if (useTop) {
      top = cutout.y - tooltipGap - tooltipHeight;
    } else {
      top = cutout.y + cutout.h + tooltipGap;
    }
    left = cutout.x + cutout.w / 2 - tooltipWidth / 2;
  }

  left = Math.max(margin, Math.min(vw - tooltipWidth - margin, left));
  top = Math.max(margin, Math.min(vh - tooltipHeight - margin, top));
  tooltipStyle = { top, left };

  const isLast = step === GUIDE_STEPS.length - 1;

  return (
    <div className="tutorial-overlay">
      <svg className="tutorial-overlay-svg" width="100%" height="100%">
        <defs>
          <mask id="tutorial-mask">
            <rect width="100%" height="100%" fill="white" />
            <rect x={cutout.x} y={cutout.y} width={cutout.w} height={cutout.h} rx={cutout.rx} fill="black" />
          </mask>
        </defs>
        <rect width="100%" height="100%" fill="rgba(0, 0, 0, 0.55)" mask="url(#tutorial-mask)" />
      </svg>

      <div
        className="tutorial-spotlight-ring"
        style={{ top: cutout.y, left: cutout.x, width: cutout.w, height: cutout.h, borderRadius: cutout.rx }}
      />

      <div className="tutorial-tooltip" style={tooltipStyle} ref={tooltipRef}>
        <button className="tutorial-close-btn" type="button" onClick={onComplete} aria-label="Close tour">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
        <div className="tutorial-tooltip-header">
          <span className="tutorial-tooltip-step">Step {step + 1} of {TOTAL_GUIDE_STEPS}</span>
        </div>
        <div className="tutorial-tooltip-title">{guideStep.title}</div>
        <div className="tutorial-tooltip-desc">{guideStep.description}</div>
        <div className="tutorial-tooltip-footer">
          <div className="tutorial-dots">
            {GUIDE_STEPS.map((_, i) => (
              <span key={i} className={`tutorial-dot${i === step ? " active" : ""}${i < step ? " completed" : ""}`} />
            ))}
          </div>
          <div className="tutorial-tooltip-actions">
            <button className="tutorial-btn-back" type="button" onClick={goBack}>Back</button>
            <button className="tutorial-btn-next" type="button" onClick={goNext}>{isLast ? "Get started" : "Next"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
