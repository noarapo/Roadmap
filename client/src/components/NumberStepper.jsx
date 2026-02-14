import React, { useCallback } from "react";
import { Minus, Plus } from "lucide-react";

export default function NumberStepper({
  value,
  onChange,
  min = 0,
  max = Infinity,
}) {
  const numericValue = typeof value === "number" ? value : Number(value) || 0;

  const clamp = useCallback(
    (v) => Math.min(max, Math.max(min, v)),
    [min, max]
  );

  const handleDecrement = () => {
    onChange(clamp(numericValue - 1));
  };

  const handleIncrement = () => {
    onChange(clamp(numericValue + 1));
  };

  const handleInputChange = (e) => {
    const raw = e.target.value;
    /* Allow empty field while typing */
    if (raw === "") {
      onChange(min);
      return;
    }
    const parsed = parseInt(raw, 10);
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
        inputMode="numeric"
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
