import { useEffect, useRef } from "react";

/**
 * Detects visual overlap among .feature-card elements within each grid row.
 * Runs in all environments. In production, reports to Sentry if available.
 *
 * @param {React.RefObject} gridRef - ref to the .canvas-grid element
 * @param {Array} deps - dependency array to trigger re-check
 */
export default function useOverlapDetector(gridRef, deps = []) {
  const reportedOverlaps = useRef(new Set());

  useEffect(() => {
    const timer = setTimeout(() => {
      if (!gridRef.current) return;

      const rowIds = new Set();
      gridRef.current.querySelectorAll(".grid-cell[data-row-id]").forEach((cell) => {
        rowIds.add(cell.dataset.rowId);
      });

      const warnings = [];

      for (const rowId of rowIds) {
        const cells = gridRef.current.querySelectorAll(`.grid-cell[data-row-id="${rowId}"]`);
        const visibleCards = [];

        cells.forEach((cell) => {
          cell.querySelectorAll(".feature-card").forEach((cardEl) => {
            if (cardEl.style.visibility === "hidden") return;
            if (cardEl.classList.contains("drag-ghost")) return;
            const rect = cardEl.getBoundingClientRect();
            if (rect.width === 0 || rect.height === 0) return;
            visibleCards.push({ rect, cardId: cardEl.dataset.cardId || "unknown" });
          });
        });

        const TOLERANCE = 2;
        for (let i = 0; i < visibleCards.length; i++) {
          for (let j = i + 1; j < visibleCards.length; j++) {
            const a = visibleCards[i].rect;
            const b = visibleCards[j].rect;
            const overlapsX = a.left < b.right - TOLERANCE && a.right > b.left + TOLERANCE;
            const overlapsY = a.top < b.bottom - TOLERANCE && a.bottom > b.top + TOLERANCE;

            if (overlapsX && overlapsY) {
              const key = `${visibleCards[i].cardId}-${visibleCards[j].cardId}`;
              if (!reportedOverlaps.current.has(key)) {
                const overlapPx = Math.round(
                  Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) *
                  Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top))
                );
                warnings.push({ key, cardA: visibleCards[i].cardId, cardB: visibleCards[j].cardId, rowId, overlapPx });
              }
            }
          }
        }
      }

      if (warnings.length > 0) {
        const newKeys = new Set(warnings.map((w) => w.key));
        newKeys.forEach((k) => reportedOverlaps.current.add(k));

        console.error("[OVERLAP DETECTOR] Card overlap(s) detected:", warnings);

        // Report to Sentry if available
        try {
          const Sentry = window.__SENTRY__;
          if (Sentry && Sentry.captureException) {
            Sentry.captureException(
              new Error(`Card overlap detected: ${warnings.length} overlap(s)`),
              {
                tags: { component: "RoadmapGrid", type: "visual-overlap" },
                extra: { overlaps: warnings },
              }
            );
          }
        } catch (_) { /* Sentry not loaded */ }
      }
    }, 500);

    return () => clearTimeout(timer);
  }, deps);
}
