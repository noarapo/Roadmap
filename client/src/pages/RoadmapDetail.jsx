import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  getRoadmap, updateRoadmap, createMilestone, updateMilestone,
  deleteMilestone, createTask, updateTask, deleteTask, executeAgent,
} from "../services/api";
import MilestoneCard from "../components/MilestoneCard";

export default function RoadmapDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [roadmap, setRoadmap] = useState(null);
  const [loading, setLoading] = useState(true);
  const [agentMessage, setAgentMessage] = useState(null);
  const [newMilestone, setNewMilestone] = useState("");

  useEffect(() => { load(); }, [id]);

  async function load() {
    setLoading(true);
    try {
      setRoadmap(await getRoadmap(id));
    } catch {
      navigate("/");
    }
    setLoading(false);
  }

  async function handleStatusChange(status) {
    await updateRoadmap(id, { status });
    load();
  }

  async function handleAddMilestone(e) {
    e.preventDefault();
    if (!newMilestone.trim()) return;
    await createMilestone(id, { title: newMilestone });
    setNewMilestone("");
    load();
  }

  async function handleAgentAction(action, params) {
    setAgentMessage("Agent is working...");
    try {
      const result = await executeAgent(action, params);
      setAgentMessage(`Agent completed: ${action}`);
      load();
      return result;
    } catch (err) {
      setAgentMessage(`Agent error: ${err.message}`);
    }
  }

  async function handleUpdateMilestone(msId, fields) {
    await updateMilestone(msId, fields);
    load();
  }

  async function handleDeleteMilestone(msId) {
    if (!confirm("Delete this milestone and all its tasks?")) return;
    await deleteMilestone(msId);
    load();
  }

  async function handleAddTask(milestoneId, taskData) {
    await createTask(milestoneId, taskData);
    load();
  }

  async function handleUpdateTask(taskId, fields) {
    await updateTask(taskId, fields);
    load();
  }

  async function handleDeleteTask(taskId) {
    await deleteTask(taskId);
    load();
  }

  if (loading) return <div className="loading">Loading roadmap...</div>;
  if (!roadmap) return null;

  const statusOptions = ["draft", "active", "completed", "archived"];
  const totalTasks = roadmap.milestones.reduce((sum, m) => sum + m.tasks.length, 0);
  const doneTasks = roadmap.milestones.reduce(
    (sum, m) => sum + m.tasks.filter((t) => t.status === "done").length, 0
  );
  const progress = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>{roadmap.title}</h1>
          {roadmap.description && <p className="subtitle">{roadmap.description}</p>}
        </div>
        <div className="header-actions">
          <select value={roadmap.status} onChange={(e) => handleStatusChange(e.target.value)}>
            {statusOptions.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <button className="btn btn-secondary" onClick={() => handleAgentAction("analyze_roadmap", { roadmap_id: id })}>
            Analyze
          </button>
        </div>
      </div>

      {agentMessage && (
        <div className="agent-banner" onClick={() => setAgentMessage(null)}>
          {agentMessage}
        </div>
      )}

      <div className="progress-bar-container">
        <div className="progress-bar" style={{ width: `${progress}%` }} />
        <span className="progress-label">{progress}% complete ({doneTasks}/{totalTasks} tasks)</span>
      </div>

      <div className="milestones-section">
        <div className="section-header">
          <h2>Milestones</h2>
        </div>

        {roadmap.milestones.map((milestone) => (
          <MilestoneCard
            key={milestone.id}
            milestone={milestone}
            onUpdate={handleUpdateMilestone}
            onDelete={handleDeleteMilestone}
            onAddTask={handleAddTask}
            onUpdateTask={handleUpdateTask}
            onDeleteTask={handleDeleteTask}
            onAgentAction={handleAgentAction}
          />
        ))}

        <form className="add-form" onSubmit={handleAddMilestone}>
          <input
            type="text"
            placeholder="Add a milestone..."
            value={newMilestone}
            onChange={(e) => setNewMilestone(e.target.value)}
          />
          <button className="btn btn-primary" type="submit">Add</button>
        </form>
      </div>
    </div>
  );
}
