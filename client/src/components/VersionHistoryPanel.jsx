import React, { useState, useCallback } from "react";
import { X, Plus, Eye, RotateCcw } from "lucide-react";

const MOCK_SNAPSHOTS = [
  {
    id: "snap-1",
    name: "Pre-launch freeze",
    date: "2026-02-14T10:30:00Z",
    savedBy: "Sarah Chen",
  },
  {
    id: "snap-2",
    name: "After Q1 re-plan",
    date: "2026-02-10T16:45:00Z",
    savedBy: "Marcus Liu",
  },
  {
    id: "snap-3",
    name: "Board review draft",
    date: "2026-02-03T09:15:00Z",
    savedBy: "Sarah Chen",
  },
  {
    id: "snap-4",
    name: "Initial roadmap",
    date: "2026-01-15T14:00:00Z",
    savedBy: "Alex Rivera",
  },
];

function formatDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatTime(iso) {
  const d = new Date(iso);
  return d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function VersionHistoryPanel({ onClose }) {
  const [snapshots, setSnapshots] = useState(MOCK_SNAPSHOTS);
  const [savingNew, setSavingNew] = useState(false);
  const [newName, setNewName] = useState("");

  const handleSaveSnapshot = useCallback(() => {
    if (savingNew) {
      const trimmed = newName.trim();
      if (!trimmed) {
        setSavingNew(false);
        setNewName("");
        return;
      }
      const snap = {
        id: `snap-${Date.now()}`,
        name: trimmed,
        date: new Date().toISOString(),
        savedBy: "You",
      };
      setSnapshots((prev) => [snap, ...prev]);
      setSavingNew(false);
      setNewName("");
    } else {
      setSavingNew(true);
    }
  }, [savingNew, newName]);

  const handleKeyDown = useCallback(
    (e) => {
      if (e.key === "Enter") {
        handleSaveSnapshot();
      } else if (e.key === "Escape") {
        setSavingNew(false);
        setNewName("");
      }
    },
    [handleSaveSnapshot]
  );

  return (
    <div className="version-panel">
      <div className="version-panel-header">
        <h2>Version History</h2>
        <button className="btn-icon" onClick={onClose} type="button">
          <X size={16} />
        </button>
      </div>

      <div style={{ padding: "var(--space-4)", borderBottom: "1px solid var(--border-default)" }}>
        {savingNew ? (
          <div style={{ display: "flex", gap: "var(--space-2)" }}>
            <input
              className="input"
              placeholder="Snapshot name..."
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={handleKeyDown}
              autoFocus
            />
            <button
              className="btn btn-primary"
              type="button"
              onClick={handleSaveSnapshot}
            >
              Save
            </button>
          </div>
        ) : (
          <button
            className="btn btn-secondary btn-full"
            type="button"
            onClick={handleSaveSnapshot}
          >
            <Plus size={14} />
            Save snapshot
          </button>
        )}
      </div>

      <div className="version-list">
        {snapshots.map((snap) => (
          <div key={snap.id} className="version-item">
            <span className="version-item-name">{snap.name}</span>
            <span className="version-item-meta">
              {formatDate(snap.date)} at {formatTime(snap.date)}
            </span>
            <span className="version-item-meta">Saved by {snap.savedBy}</span>
            <div className="version-item-actions">
              <button className="btn btn-ghost" type="button" style={{ fontSize: 12, padding: "4px 10px" }}>
                <Eye size={12} />
                View
              </button>
              <button className="btn btn-ghost" type="button" style={{ fontSize: 12, padding: "4px 10px" }}>
                <RotateCcw size={12} />
                Restore
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
