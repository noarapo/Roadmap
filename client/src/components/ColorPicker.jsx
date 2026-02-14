import React from "react";
import { Check } from "lucide-react";

export const TAG_COLORS = [
  "#E53E3E",
  "#DD6B20",
  "#D69E2E",
  "#38A169",
  "#2D6A5E",
  "#4F87C5",
  "#805AD5",
  "#D53F8C",
  "#718096",
  "#1A202C",
  "#E2E8F0",
  "#F6AD55",
];

export default function ColorPicker({ value, onChange }) {
  return (
    <div className="color-picker">
      {TAG_COLORS.map((color) => {
        const isSelected = value === color;
        return (
          <button
            key={color}
            type="button"
            className={`color-swatch${isSelected ? " selected" : ""}`}
            style={{ backgroundColor: color }}
            onClick={() => onChange(color)}
            aria-label={`Select color ${color}`}
          >
            {isSelected && (
              <Check
                size={14}
                style={{
                  color: isLightColor(color) ? "#1A202C" : "#FFFFFF",
                }}
              />
            )}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Returns true if the hex color is perceptually light,
 * so we can pick a dark check-mark for contrast.
 */
function isLightColor(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  /* Relative luminance approximation */
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6;
}
