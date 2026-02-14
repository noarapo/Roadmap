import React, { useState } from "react";
import TaskItem from "./TaskItem";

const statusColors = { pending: "#f59e0b", in_progress: "#2563eb", completed: "#16a34a" };

export default function MilestoneCard({
  milestone, onUpdate, onDelete, onAddTask, onUpdateTask, onDeleteTask, onAgentAction,
}) {
  const [expanded, setExpanded] = useState(true);
  const [newTask, setNewTask] = useState("");
  const [showAgentMenu, setShowAgentMenu] = useState(false);

  const doneCount = milestone.tasks.filter((t) => t.status === "done").length;
  const total = milestone.tasks.length;

  function handleAddTask(e) {
    e.preventDefault();
    if (!newTask.trim()) return;
    onAddTask(milestone.id, { title: newTask });
    setNewTask("");
  }

  const statusOptions = ["pending", "in_progress", "completed"];

  return (
    <div className="milestone-card card">
      <div className="milestone-header" onClick={() => setExpanded(!expanded)}>
        <div className="milestone-title-row">
          <span className="expand-icon">{expanded ? "▼" : "▶"}</span>
          <h3>{milestone.title}</h3>
          <span className="task-count">{doneCount}/{total} tasks</span>
        </div>
        <div className="milestone-actions" onClick={(e) => e.stopPropagation()}>
          <select
            value={milestone.status}
            onChange={(e) => onUpdate(milestone.id, { status: e.target.value })}
            className="status-select"
            style={{ borderColor: statusColors[milestone.status] }}
          >
            {statusOptions.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <div className="dropdown-container">
            <button className="btn btn-sm btn-secondary" onClick={() => setShowAgentMenu(!showAgentMenu)}>
              Agent
            </button>
            {showAgentMenu && (
              <div className="dropdown-menu">
                <button onClick={() => { onAgentAction("break_down_milestone", { milestone_id: milestone.id }); setShowAgentMenu(false); }}>
                  Break Down Tasks
                </button>
                <button onClick={() => { onAgentAction("suggest_tasks", { milestone_id: milestone.id }); setShowAgentMenu(false); }}>
                  Suggest Tasks
                </button>
                <button onClick={() => { onAgentAction("prioritize", { milestone_id: milestone.id }); setShowAgentMenu(false); }}>
                  Prioritize
                </button>
                <button onClick={() => { onAgentAction("estimate", { milestone_id: milestone.id }); setShowAgentMenu(false); }}>
                  Estimate Effort
                </button>
              </div>
            )}
          </div>
          <button className="btn btn-sm btn-danger" onClick={() => onDelete(milestone.id)}>Delete</button>
        </div>
      </div>

      {expanded && (
        <div className="milestone-body">
          {milestone.tasks.length === 0 ? (
            <p className="meta">No tasks yet. Add one or use the Agent to break down this milestone.</p>
          ) : (
            <div className="task-list">
              {milestone.tasks.map((task) => (
                <TaskItem
                  key={task.id}
                  task={task}
                  onUpdate={onUpdateTask}
                  onDelete={onDeleteTask}
                />
              ))}
            </div>
          )}
          <form className="add-form inline-form" onSubmit={handleAddTask}>
            <input
              type="text"
              placeholder="Add a task..."
              value={newTask}
              onChange={(e) => setNewTask(e.target.value)}
            />
            <button className="btn btn-primary btn-sm" type="submit">Add</button>
          </form>
        </div>
      )}
    </div>
  );
}
