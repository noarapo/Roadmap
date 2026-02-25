import React, { useState, useEffect, useCallback, useRef } from "react";

/* ------------------------------------------------------------------
 *  Tutorial Steps
 *
 *  step === 0 is the welcome screen (no spotlight).
 *  Steps 1-4 are spotlighted guide steps.
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
    selector: ".side-panel-overlay",
    title: "Your feature drawer",
    description:
      "Click any card to open its detail drawer. Here you can add descriptions, assign teams, track effort estimates, manage tags, and configure custom fields — everything you need to plan a feature. Switch between the Details tab and integration tabs to see linked data.",
    position: "left",
    requiresSetup: "openSidePanel",
  },
  {
    selector: ".we-popup-container",
    title: "Customize your workspace",
    description:
      "This is your workspace editor. Toggle fields on or off, add custom fields, and manage your integrations — all from one place. Changes are saved automatically.",
    position: "bottom",
    requiresSetup: "openSetup",
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

export default function TutorialOverlay({
  onComplete,
  onOpenCard,
  onCloseCard,
  onOpenImport,
  onCloseImport,
  onCloseChat,
  onOpenSetup,
  onOpenTriage,
}) {
  // step -1 = welcome, 0..3 = guide steps
  const [step, setStep] = useState(-1);
  const [targetRect, setTargetRect] = useState(null);
  const [ready, setReady] = useState(false);
  const tooltipRef = useRef(null);
  const [tooltipHeight, setTooltipHeight] = useState(200);

  // Stable refs for callbacks so the setup effect only re-runs on step change
  const cbRef = useRef({});
  cbRef.current = { onComplete, onOpenCard, onCloseCard, onOpenImport, onCloseImport, onCloseChat, onOpenSetup, onOpenTriage };

  const isWelcome = step === -1;
  const guideStep = isWelcome ? null : GUIDE_STEPS[step];

  /* ---- Find and measure the target element ---- */
  const findAndMeasureTarget = useCallback((stepIdx) => {
    const s = GUIDE_STEPS[stepIdx];
    if (!s) return null;
    const el = document.querySelector(s.selector);
    if (!el) return null;
    el.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
    const rect = el.getBoundingClientRect();
    return { top: rect.top, left: rect.left, width: rect.width, height: rect.height };
  }, []);

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

    let cancelled = false;
    let timerId = null;
    let attempts = 0;
    const maxAttempts = 20; // ~5 seconds (20 * 250ms)

    // Poll for the target element — retries until found, cancelled, or max attempts
    function pollForTarget(stepIdx) {
      if (cancelled) return;
      const rect = findAndMeasureTarget(stepIdx);
      if (rect) {
        setTargetRect(rect);
        setReady(true);
      } else {
        attempts++;
        if (attempts >= maxAttempts) {
          // Element never appeared — skip to next step or complete the tour
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

    // Run setup action, then start polling
    const cb = cbRef.current;
    if (s.requiresSetup === "closeChat") {
      cb.onCloseChat();
      cb.onCloseCard();
      cb.onCloseImport();
    } else if (s.requiresSetup === "openSidePanel") {
      cb.onCloseChat();
      cb.onCloseImport();
      // Small delay to let import UI unmount before opening the card
      setTimeout(() => {
        if (!cancelled) cb.onOpenCard();
      }, 100);
    } else if (s.requiresSetup === "openSetup") {
      cb.onCloseImport();
      cb.onOpenSetup();
    } else if (s.requiresSetup === "openImport") {
      cb.onCloseChat();
      cb.onCloseCard();
      cb.onOpenImport();
    } else if (s.requiresSetup === "openTriage") {
      cb.onCloseChat();
      cb.onCloseCard();
      cb.onCloseImport();
      cb.onOpenTriage();
    } else {
      cb.onCloseImport();
    }

    // Start polling after a short delay for React to render
    timerId = setTimeout(() => pollForTarget(step), 300);

    return () => {
      cancelled = true;
      if (timerId) clearTimeout(timerId);
    };
  }, [step, findAndMeasureTarget]); // Only re-run when step changes

  /* ---- Recalculate position on resize/scroll ---- */
  useEffect(() => {
    if (!ready || isWelcome) return;
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
  }, [ready, isWelcome, step, findAndMeasureTarget]);

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
     LOADING STATE — keep overlay visible between steps to block clicks
     ================================================================== */
  if (!ready) {
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
     SPOTLIGHT STEPS (step 0-3)
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
  // Clamp the cutout rect to viewport bounds so the SVG mask hole isn't clipped
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

  /* ---- Tooltip positioning ---- */
  const tooltipWidth = 320;
  const tooltipGap = 16;
  const margin = 12;
  let tooltipStyle = {};

  // Available space on each side of the cutout
  const spaceLeft = cutout.x - tooltipGap;
  const spaceRight = vw - (cutout.x + cutout.w) - tooltipGap;
  const spaceTop = cutout.y - tooltipGap;
  const spaceBottom = vh - (cutout.y + cutout.h) - tooltipGap;

  // Pick the best horizontal side: prefer the requested position, fall back to whichever has more room
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

  // Always clamp to viewport
  left = Math.max(margin, Math.min(vw - tooltipWidth - margin, left));
  top = Math.max(margin, Math.min(vh - tooltipHeight - margin, top));
  tooltipStyle = { top, left };

  const isFirst = step === 0;
  const isLast = step === GUIDE_STEPS.length - 1;

  return (
    <div className="tutorial-overlay">
      {/* Dark overlay with cutout */}
      <svg className="tutorial-overlay-svg" width="100%" height="100%">
        <defs>
          <mask id="tutorial-mask">
            <rect width="100%" height="100%" fill="white" />
            <rect
              x={cutout.x}
              y={cutout.y}
              width={cutout.w}
              height={cutout.h}
              rx={cutout.rx}
              fill="black"
            />
          </mask>
        </defs>
        <rect
          width="100%"
          height="100%"
          fill="rgba(0, 0, 0, 0.55)"
          mask="url(#tutorial-mask)"
        />
      </svg>

      {/* Spotlight ring */}
      <div
        className="tutorial-spotlight-ring"
        style={{
          top: cutout.y,
          left: cutout.x,
          width: cutout.w,
          height: cutout.h,
          borderRadius: cutout.rx,
        }}
      />

      {/* Tooltip card */}
      <div className="tutorial-tooltip" style={tooltipStyle} ref={tooltipRef}>
        <button className="tutorial-close-btn" type="button" onClick={onComplete} aria-label="Close tour">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
        <div className="tutorial-tooltip-header">
          <span className="tutorial-tooltip-step">
            Step {step + 1} of {TOTAL_GUIDE_STEPS}
          </span>
          <button className="tutorial-btn-skip" type="button" onClick={onComplete}>
            Skip
          </button>
        </div>
        <div className="tutorial-tooltip-title">{guideStep.title}</div>
        <div className="tutorial-tooltip-desc">{guideStep.description}</div>
        <div className="tutorial-tooltip-footer">
          <div className="tutorial-dots">
            {GUIDE_STEPS.map((_, i) => (
              <span
                key={i}
                className={`tutorial-dot${i === step ? " active" : ""}${i < step ? " completed" : ""}`}
              />
            ))}
          </div>
          <div className="tutorial-tooltip-actions">
            <button className="tutorial-btn-back" type="button" onClick={goBack}>
              Back
            </button>
            <button className="tutorial-btn-next" type="button" onClick={goNext}>
              {isLast ? "Get started" : "Next"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
