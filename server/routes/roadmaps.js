const express = require("express");
const router = express.Router();
const RoadmapModel = require("../models/roadmap");

// --- Roadmaps ---
router.get("/", (req, res) => {
  res.json(RoadmapModel.getAllRoadmaps());
});

router.get("/:id", (req, res) => {
  const roadmap = RoadmapModel.getFullRoadmap(req.params.id);
  if (!roadmap) return res.status(404).json({ error: "Roadmap not found" });
  res.json(roadmap);
});

router.post("/", (req, res) => {
  const { title, description } = req.body;
  if (!title) return res.status(400).json({ error: "Title is required" });
  res.status(201).json(RoadmapModel.createRoadmap({ title, description }));
});

router.put("/:id", (req, res) => {
  const roadmap = RoadmapModel.updateRoadmap(req.params.id, req.body);
  if (!roadmap) return res.status(404).json({ error: "Roadmap not found" });
  res.json(roadmap);
});

router.delete("/:id", (req, res) => {
  RoadmapModel.deleteRoadmap(req.params.id);
  res.status(204).end();
});

// --- Milestones ---
router.get("/:roadmapId/milestones", (req, res) => {
  res.json(RoadmapModel.getMilestones(req.params.roadmapId));
});

router.post("/:roadmapId/milestones", (req, res) => {
  const { title, description, priority, target_date } = req.body;
  if (!title) return res.status(400).json({ error: "Title is required" });
  res.status(201).json(
    RoadmapModel.createMilestone({
      roadmap_id: req.params.roadmapId,
      title,
      description,
      priority,
      target_date,
    })
  );
});

router.put("/milestones/:id", (req, res) => {
  const milestone = RoadmapModel.updateMilestone(req.params.id, req.body);
  if (!milestone) return res.status(404).json({ error: "Milestone not found" });
  res.json(milestone);
});

router.delete("/milestones/:id", (req, res) => {
  RoadmapModel.deleteMilestone(req.params.id);
  res.status(204).end();
});

// --- Tasks ---
router.get("/milestones/:milestoneId/tasks", (req, res) => {
  res.json(RoadmapModel.getTasks(req.params.milestoneId));
});

router.post("/milestones/:milestoneId/tasks", (req, res) => {
  const { title, description, category, effort, assignee } = req.body;
  if (!title) return res.status(400).json({ error: "Title is required" });
  res.status(201).json(
    RoadmapModel.createTask({
      milestone_id: req.params.milestoneId,
      title,
      description,
      category,
      effort,
      assignee,
    })
  );
});

router.put("/tasks/:id", (req, res) => {
  const task = RoadmapModel.updateTask(req.params.id, req.body);
  if (!task) return res.status(404).json({ error: "Task not found" });
  res.json(task);
});

router.delete("/tasks/:id", (req, res) => {
  RoadmapModel.deleteTask(req.params.id);
  res.status(204).end();
});

module.exports = router;
