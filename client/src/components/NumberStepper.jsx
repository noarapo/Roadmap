import React, { useCallback } from "react";
import { Minus, Plus } from "lucide-react";

export default function NumberStepper({
  value,
  onChange,
  min = 0,
  max = Infinity,
  step = 1,
}) {
  const numericValue = typeof value === "number" ? value : Number(value) || 0;

  const clamp = useCallback(
    (v) => Math.min(max, Math.max(min, v)),
    [min, max]
  );

  /* Round to avoid floating-point drift (e.g. 0.1 + 0.2 !== 0.3) */
  const precision = Math.max(0, -Math.floor(Math.log10(step)));
  const round = (v) => Number(v.toFixed(precision));

  const handleDecrement = () => {
    onChange(clamp(round(numericValue - step)));
  };

  const handleIncrement = () => {
    onChange(clamp(round(numericValue + step)));
  };

  const handleInputChange = (e) => {
    const raw = e.target.value;
    /* Allow empty field while typing */
    if (raw === "") {
      onChange(min);
      return;
    }
    const parsed = parseFloat(raw);
    if (!Number.isNaN(parsed)) {
      onChange(clamp(parsed));
    }
  };

  const handleBlur = () => {
    onChange(clamp(numericValue));
  };

  return (
    <div className="number-stepper">
      <button
        type="button"
        onClick={handleDecrement}
        disabled={numericValue <= min}
        aria-label="Decrease"
      >
        <Minus size={14} />
      </button>
      <input
        type="text"
        inputMode="decimal"
        value={numericValue}
        onChange={handleInputChange}
        onBlur={handleBlur}
        aria-label="Value"
      />
      <button
        type="button"
        onClick={handleIncrement}
        disabled={numericValue >= max}
        aria-label="Increase"
      >
        <Plus size={14} />
      </button>
    </div>
  );
}
