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
    <div className="tutorial-mockup tutorial-mockup-drawer">
      <div className="tutorial-mockup-header">
        <span style={{ fontSize: 15, fontWeight: 600 }}>Mobile App Optimization</span>
        <span style={{ color: "var(--text-muted)", fontSize: 12 }}>x</span>
      </div>
      <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
        <span className="tutorial-mockup-tab active">Details</span>
        <span className="tutorial-mockup-tab">HubSpot</span>
        <span className="tutorial-mockup-tab">Linear</span>
      </div>
      <div className="tutorial-mockup-row"><span>Teams</span><span style={{ display: "flex", gap: 4 }}><span className="tutorial-mockup-tag blue">App</span><span className="tutorial-mockup-tag orange">Data</span></span></div>
      <div className="tutorial-mockup-row"><span>Ends on</span><span>Apr 25</span></div>
      <div className="tutorial-mockup-row"><span>Duration</span><span>1 sprint</span></div>
      <div className="tutorial-mockup-row"><span>Tags</span><span style={{ color: "var(--text-muted)" }}>+</span></div>
      <div className="tutorial-mockup-row"><span>Effort</span><span>5 days</span></div>
      <div className="tutorial-mockup-row"><span>Priority</span><span className="tutorial-mockup-tag green">High</span></div>
    </div>
  );
}

function WorkspaceMockup() {
  return (
    <div className="tutorial-mockup tutorial-mockup-workspace">
      <div className="tutorial-mockup-header">
        <span style={{ fontSize: 15, fontWeight: 600 }}>Customize Drawer</span>
        <span style={{ color: "var(--text-muted)", fontSize: 12 }}>x</span>
      </div>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ fontSize: 11 }}>v</span> Integrations
      </div>
      <div className="tutorial-mockup-connect">+ Connect an integration</div>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, marginTop: 16, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span><span style={{ fontSize: 11, marginRight: 6 }}>v</span>Fields</span>
        <span style={{ color: "var(--teal)", fontSize: 12 }}>6</span>
      </div>
      <div className="tutorial-mockup-row"><span>Teams</span><span className="tutorial-mockup-toggle on" /></div>
      <div className="tutorial-mockup-row"><span>Effort</span><span className="tutorial-mockup-toggle on" /></div>
      <div className="tutorial-mockup-row"><span>Tags</span><span className="tutorial-mockup-toggle on" /></div>
      <div className="tutorial-mockup-connect" style={{ marginTop: 12 }}>+ Add field</div>
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
