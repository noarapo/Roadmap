import React, { useState } from "react";

const statusOptions = ["todo", "in_progress", "done"];
const categoryColors = {
  frontend: "#8b5cf6",
  backend: "#2563eb",
  database: "#059669",
  devops: "#d97706",
  testing: "#dc2626",
  design: "#ec4899",
  general: "#6b7280",
};

export default function TaskItem({ task, onUpdate, onDelete }) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(task.title);

  function handleSave() {
    if (title.trim() && title !== task.title) {
      onUpdate(task.id, { title });
    }
    setEditing(false);
  }

  function handleStatusToggle() {
    const nextStatus = statusOptions[(statusOptions.indexOf(task.status) + 1) % statusOptions.length];
    onUpdate(task.id, { status: nextStatus });
  }

  return (
    <div className={`task-item ${task.status === "done" ? "task-done" : ""}`}>
      <button
        className={`status-dot ${task.status}`}
        onClick={handleStatusToggle}
        title={`Status: ${task.status} (click to change)`}
      />
      <div className="task-content">
        {editing ? (
          <input
            className="task-edit-input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={handleSave}
            onKeyDown={(e) => e.key === "Enter" && handleSave()}
            autoFocus
          />
        ) : (
          <span className="task-title" onDoubleClick={() => setEditing(true)}>
            {task.title}
          </span>
        )}
        <div className="task-meta">
          <span className="category-tag" style={{ background: categoryColors[task.category] || "#6b7280" }}>
            {task.category}
          </span>
          <span className="effort-tag">{task.effort}</span>
          {task.assignee && <span className="assignee-tag">{task.assignee}</span>}
        </div>
      </div>
      <button className="btn-icon" onClick={() => onDelete(task.id)} title="Delete task">
        &times;
      </button>
    </div>
  );
}
