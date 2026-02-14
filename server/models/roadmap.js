const db = require("./db");
const { v4: uuidv4 } = require("uuid");

const RoadmapModel = {
  // --- Roadmaps ---
  getAllRoadmaps() {
    return db.prepare("SELECT * FROM roadmaps ORDER BY created_at DESC").all();
  },

  getRoadmapById(id) {
    return db.prepare("SELECT * FROM roadmaps WHERE id = ?").get(id);
  },

  createRoadmap({ title, description }) {
    const id = uuidv4();
    db.prepare(
      "INSERT INTO roadmaps (id, title, description) VALUES (?, ?, ?)"
    ).run(id, title, description || "");
    return this.getRoadmapById(id);
  },

  updateRoadmap(id, { title, description, status }) {
    const fields = [];
    const values = [];
    if (title !== undefined) { fields.push("title = ?"); values.push(title); }
    if (description !== undefined) { fields.push("description = ?"); values.push(description); }
    if (status !== undefined) { fields.push("status = ?"); values.push(status); }
    fields.push("updated_at = datetime('now')");
    values.push(id);
    db.prepare(`UPDATE roadmaps SET ${fields.join(", ")} WHERE id = ?`).run(...values);
    return this.getRoadmapById(id);
  },

  deleteRoadmap(id) {
    db.prepare("DELETE FROM roadmaps WHERE id = ?").run(id);
  },

  // --- Milestones ---
  getMilestones(roadmapId) {
    return db
      .prepare("SELECT * FROM milestones WHERE roadmap_id = ? ORDER BY position, created_at")
      .all(roadmapId);
  },

  getMilestoneById(id) {
    return db.prepare("SELECT * FROM milestones WHERE id = ?").get(id);
  },

  createMilestone({ roadmap_id, title, description, priority, target_date }) {
    const id = uuidv4();
    const maxPos = db.prepare(
      "SELECT COALESCE(MAX(position), -1) + 1 as pos FROM milestones WHERE roadmap_id = ?"
    ).get(roadmap_id);
    db.prepare(
      "INSERT INTO milestones (id, roadmap_id, title, description, priority, target_date, position) VALUES (?, ?, ?, ?, ?, ?, ?)"
    ).run(id, roadmap_id, title, description || "", priority || 0, target_date || null, maxPos.pos);
    return this.getMilestoneById(id);
  },

  updateMilestone(id, fields) {
    const sets = [];
    const values = [];
    for (const [key, val] of Object.entries(fields)) {
      if (val !== undefined && key !== "id") {
        sets.push(`${key} = ?`);
        values.push(val);
      }
    }
    if (sets.length === 0) return this.getMilestoneById(id);
    values.push(id);
    db.prepare(`UPDATE milestones SET ${sets.join(", ")} WHERE id = ?`).run(...values);
    return this.getMilestoneById(id);
  },

  deleteMilestone(id) {
    db.prepare("DELETE FROM milestones WHERE id = ?").run(id);
  },

  // --- Tasks ---
  getTasks(milestoneId) {
    return db
      .prepare("SELECT * FROM tasks WHERE milestone_id = ? ORDER BY position, created_at")
      .all(milestoneId);
  },

  getTaskById(id) {
    return db.prepare("SELECT * FROM tasks WHERE id = ?").get(id);
  },

  createTask({ milestone_id, title, description, category, effort, assignee }) {
    const id = uuidv4();
    const maxPos = db.prepare(
      "SELECT COALESCE(MAX(position), -1) + 1 as pos FROM tasks WHERE milestone_id = ?"
    ).get(milestone_id);
    db.prepare(
      "INSERT INTO tasks (id, milestone_id, title, description, category, effort, assignee, position) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    ).run(id, milestone_id, title, description || "", category || "general", effort || "medium", assignee || null, maxPos.pos);
    return this.getTaskById(id);
  },

  updateTask(id, fields) {
    const sets = [];
    const values = [];
    for (const [key, val] of Object.entries(fields)) {
      if (val !== undefined && key !== "id") {
        sets.push(`${key} = ?`);
        values.push(val);
      }
    }
    if (sets.length === 0) return this.getTaskById(id);
    values.push(id);
    db.prepare(`UPDATE tasks SET ${sets.join(", ")} WHERE id = ?`).run(...values);
    return this.getTaskById(id);
  },

  deleteTask(id) {
    db.prepare("DELETE FROM tasks WHERE id = ?").run(id);
  },

  // --- Full roadmap with nested data ---
  getFullRoadmap(id) {
    const roadmap = this.getRoadmapById(id);
    if (!roadmap) return null;
    const milestones = this.getMilestones(id).map((m) => ({
      ...m,
      tasks: this.getTasks(m.id),
    }));
    return { ...roadmap, milestones };
  },

  // --- Agent Logs ---
  createAgentLog({ roadmap_id, action, input, output }) {
    const id = uuidv4();
    db.prepare(
      "INSERT INTO agent_logs (id, roadmap_id, action, input, output) VALUES (?, ?, ?, ?, ?)"
    ).run(id, roadmap_id || null, action, input || null, typeof output === "string" ? output : JSON.stringify(output));
    return db.prepare("SELECT * FROM agent_logs WHERE id = ?").get(id);
  },

  getAgentLogs(roadmapId) {
    if (roadmapId) {
      return db.prepare("SELECT * FROM agent_logs WHERE roadmap_id = ? ORDER BY created_at DESC LIMIT 50").all(roadmapId);
    }
    return db.prepare("SELECT * FROM agent_logs ORDER BY created_at DESC LIMIT 50").all();
  },
};

module.exports = RoadmapModel;
