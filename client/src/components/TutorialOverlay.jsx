import React, { useState, useEffect, useCallback, useRef } from "react";

/* ------------------------------------------------------------------
 *  Tutorial Steps
 *
 *  step === 0 is the welcome screen (no spotlight).
 *  Steps 1-5 are spotlighted guide steps.
 * ------------------------------------------------------------------ */

const GUIDE_STEPS = [
  {
    selector: ".feature-card",
    title: "Feature cards",
    description:
      "These are your feature cards \u2014 the building blocks of your roadmap. Each one represents a feature, task, or initiative your team is planning. Click the + button in any cell to add more, and drag cards across sprints to plan your timeline.",
    position: "right",
    requiresSetup: "closeChat",
  },
  {
    selector: ".import-dropzone",
    title: "Import your data",
    description:
      "Already have a roadmap somewhere else? Drop any file here \u2014 .csv, .xlsx, .json, or even a plain text list \u2014 and Roadway AI will automatically turn it into cards on your board.",
    position: "left",
    requiresSetup: "openImport",
  },
  {
    selector: ".side-panel-overlay",
    title: "Your feature drawer",
    description:
      "Click any card to open its detail drawer. Here you can add descriptions, set status, assign teams, track effort estimates, manage tags, and configure custom fields \u2014 everything you need to plan a feature.",
    position: "left",
    requiresSetup: "openSidePanel",
  },
  {
    selector: ".side-panel-config",
    title: "Customize your drawer",
    description:
      "This is your drawer setup. Toggle which fields are visible, customize your statuses and colors, and add custom fields \u2014 so every card shows exactly what your team needs.",
    position: "left",
    requiresSetup: "openSetup",
  },
  {
    selector: ".comment-toggle-btn",
    title: "Collaborate with comments",
    description:
      "Leave comments anywhere on your roadmap to discuss priorities, flag concerns, or give feedback. Press C on your keyboard to quickly toggle comment mode, or click this button.",
    position: "bottom",
    requiresSetup: "closeSidePanel",
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
}) {
  // step -1 = welcome, 0..4 = guide steps
  const [step, setStep] = useState(-1);
  const [targetRect, setTargetRect] = useState(null);
  const [ready, setReady] = useState(false);
  const tooltipRef = useRef(null);
  const [tooltipHeight, setTooltipHeight] = useState(200);

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

  const measureAndSet = useCallback(
    (stepIdx) => {
      const rect = findAndMeasureTarget(stepIdx);
      if (rect) {
        setTargetRect(rect);
        setReady(true);
      } else {
        // Target not found — skip forward
        for (let i = stepIdx + 1; i < GUIDE_STEPS.length; i++) {
          setStep(i);
          return;
        }
        onComplete();
      }
    },
    [findAndMeasureTarget, onComplete]
  );

  /* ---- Run setup actions and measure when step changes ---- */
  useEffect(() => {
    if (isWelcome) {
      setReady(true);
      return;
    }

    setReady(false);
    setTargetRect(null);

    const s = GUIDE_STEPS[step];
    if (!s) {
      onComplete();
      return;
    }

    if (s.requiresSetup === "closeChat") {
      onCloseChat();
      onCloseCard();
      onCloseImport();
      const timer = setTimeout(() => measureAndSet(step), 300);
      return () => clearTimeout(timer);
    } else if (s.requiresSetup === "openSidePanel") {
      onCloseChat();
      onCloseImport();
      onOpenCard();
      const timer = setTimeout(() => measureAndSet(step), 500);
      return () => clearTimeout(timer);
    } else if (s.requiresSetup === "openSetup") {
      onCloseImport();
      onOpenSetup();
      const timer = setTimeout(() => measureAndSet(step), 600);
      return () => clearTimeout(timer);
    } else if (s.requiresSetup === "closeSidePanel") {
      onCloseCard();
      onCloseImport();
      const timer = setTimeout(() => measureAndSet(step), 300);
      return () => clearTimeout(timer);
    } else if (s.requiresSetup === "openImport") {
      onCloseChat();
      onCloseCard();
      onOpenImport();
      const timer = setTimeout(() => measureAndSet(step), 400);
      return () => clearTimeout(timer);
    } else {
      onCloseImport();
      // Small delay
      const timer = setTimeout(() => measureAndSet(step), 100);
      return () => clearTimeout(timer);
    }
  }, [step, isWelcome, measureAndSet, onOpenCard, onCloseCard, onOpenImport, onCloseImport, onCloseChat, onOpenSetup, onComplete]);

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

  if (!ready) return null;

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
     SPOTLIGHT STEPS (step 0-4)
     ================================================================== */
  if (!targetRect) return null;

  const padding = 8;
  const cutout = {
    x: targetRect.left - padding,
    y: targetRect.top - padding,
    w: targetRect.width + padding * 2,
    h: targetRect.height + padding * 2,
    rx: 8,
  };

  /* ---- Tooltip positioning with viewport clamping ---- */
  const tooltipWidth = 320;
  const tooltipGap = 16;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const margin = 12; // minimum margin from viewport edge
  let tooltipStyle = {};
  const pos = guideStep.position;

  if (pos === "right") {
    let left = cutout.x + cutout.w + tooltipGap;
    let top = cutout.y + cutout.h / 2 - tooltipHeight / 2;
    // Flip to left if overflows right
    if (left + tooltipWidth > vw - margin) {
      left = cutout.x - tooltipGap - tooltipWidth;
    }
    // Clamp vertical
    top = Math.max(margin, Math.min(vh - tooltipHeight - margin, top));
    tooltipStyle = { top, left };
  } else if (pos === "bottom") {
    let top = cutout.y + cutout.h + tooltipGap;
    let left = cutout.x + cutout.w / 2 - tooltipWidth / 2;
    // Flip to top if overflows bottom
    if (top + tooltipHeight > vh - margin) {
      top = cutout.y - tooltipGap - tooltipHeight;
    }
    // Clamp horizontal
    left = Math.max(margin, Math.min(vw - tooltipWidth - margin, left));
    tooltipStyle = { top, left };
  } else if (pos === "left") {
    let left = cutout.x - tooltipGap - tooltipWidth;
    let top = cutout.y + cutout.h / 2 - tooltipHeight / 2;
    // Flip to right if overflows left
    if (left < margin) {
      left = cutout.x + cutout.w + tooltipGap;
    }
    // Clamp vertical
    top = Math.max(margin, Math.min(vh - tooltipHeight - margin, top));
    tooltipStyle = { top, left };
  }

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
