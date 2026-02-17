import React from "react";
import { X, Clock } from "lucide-react";

export default function VersionHistoryPanel({ onClose }) {
  return (
    <div className="version-panel">
      <div className="version-panel-header">
        <h2>Version History</h2>
        <button className="btn-icon" onClick={onClose} type="button">
          <X size={16} />
        </button>
      </div>

      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 12,
          padding: 32,
          textAlign: "center",
        }}
      >
        <Clock size={32} style={{ color: "var(--text-muted)", opacity: 0.4 }} />
        <span
          style={{
            fontSize: 14,
            fontWeight: 600,
            color: "var(--text-primary)",
          }}
        >
          Coming soon
        </span>
        <span
          style={{
            fontSize: 12,
            color: "var(--text-muted)",
            lineHeight: "18px",
          }}
        >
          Snapshots and version history will be available in a future update.
        </span>
      </div>
    </div>
  );
}
