const RoadmapModel = require("../models/roadmap");

/**
 * Fullstack Developer Agent
 *
 * An autonomous planning agent that can:
 * - Generate roadmaps from high-level project descriptions
 * - Break milestones into actionable development tasks
 * - Suggest technical architecture and stack decisions
 * - Estimate effort and prioritize work
 * - Provide status analysis and recommendations
 */

const TASK_CATEGORIES = ["frontend", "backend", "database", "devops", "testing", "design", "general"];
const EFFORT_LEVELS = ["trivial", "small", "medium", "large", "epic"];
const PRIORITY_LEVELS = { critical: 0, high: 1, medium: 2, low: 3 };

const TECH_TEMPLATES = {
  webapp: {
    milestones: [
      { title: "Project Setup & Architecture", tasks: [
        { title: "Initialize project repository and tooling", category: "devops", effort: "small" },
        { title: "Define database schema and models", category: "database", effort: "medium" },
        { title: "Set up CI/CD pipeline", category: "devops", effort: "medium" },
        { title: "Configure linting, formatting, and testing frameworks", category: "devops", effort: "small" },
      ]},
      { title: "Backend API Development", tasks: [
        { title: "Implement authentication and authorization", category: "backend", effort: "large" },
        { title: "Build core CRUD API endpoints", category: "backend", effort: "large" },
        { title: "Add input validation and error handling", category: "backend", effort: "medium" },
        { title: "Write API integration tests", category: "testing", effort: "medium" },
      ]},
      { title: "Frontend Development", tasks: [
        { title: "Create component library and design system", category: "frontend", effort: "large" },
        { title: "Build page layouts and routing", category: "frontend", effort: "medium" },
        { title: "Integrate API services and state management", category: "frontend", effort: "large" },
        { title: "Add form validation and error states", category: "frontend", effort: "medium" },
      ]},
      { title: "Testing & Deployment", tasks: [
        { title: "Write end-to-end tests for critical flows", category: "testing", effort: "large" },
        { title: "Performance profiling and optimization", category: "devops", effort: "medium" },
        { title: "Set up staging environment and deploy", category: "devops", effort: "medium" },
        { title: "Documentation and handoff", category: "general", effort: "small" },
      ]},
    ],
  },
  api: {
    milestones: [
      { title: "API Design & Setup", tasks: [
        { title: "Define OpenAPI / REST specification", category: "backend", effort: "medium" },
        { title: "Set up project scaffolding and database", category: "devops", effort: "small" },
        { title: "Implement authentication middleware", category: "backend", effort: "medium" },
      ]},
      { title: "Core Endpoints", tasks: [
        { title: "Build resource CRUD endpoints", category: "backend", effort: "large" },
        { title: "Add pagination, filtering, and sorting", category: "backend", effort: "medium" },
        { title: "Implement rate limiting and caching", category: "backend", effort: "medium" },
      ]},
      { title: "Quality & Release", tasks: [
        { title: "Write comprehensive integration tests", category: "testing", effort: "large" },
        { title: "Generate API documentation", category: "general", effort: "small" },
        { title: "Deploy and monitor", category: "devops", effort: "medium" },
      ]},
    ],
  },
  mobile: {
    milestones: [
      { title: "Foundation & Design", tasks: [
        { title: "Set up React Native / Flutter project", category: "devops", effort: "small" },
        { title: "Create UI design mockups and component specs", category: "design", effort: "large" },
        { title: "Implement navigation and screen structure", category: "frontend", effort: "medium" },
      ]},
      { title: "Core Features", tasks: [
        { title: "Build authentication flow (login, signup, password reset)", category: "frontend", effort: "large" },
        { title: "Implement main feature screens", category: "frontend", effort: "epic" },
        { title: "Integrate backend API services", category: "frontend", effort: "large" },
        { title: "Add offline support and local caching", category: "frontend", effort: "medium" },
      ]},
      { title: "Polish & Launch", tasks: [
        { title: "Add push notifications", category: "backend", effort: "medium" },
        { title: "Write unit and integration tests", category: "testing", effort: "large" },
        { title: "App store submission and release", category: "devops", effort: "medium" },
      ]},
    ],
  },
};

const DeveloperAgent = {
  /**
   * Process a command from the user and return a structured response.
   */
  execute(action, params = {}) {
    switch (action) {
      case "generate_roadmap":
        return this.generateRoadmap(params);
      case "break_down_milestone":
        return this.breakDownMilestone(params);
      case "suggest_tasks":
        return this.suggestTasks(params);
      case "analyze_roadmap":
        return this.analyzeRoadmap(params);
      case "prioritize":
        return this.prioritizeTasks(params);
      case "estimate":
        return this.estimateEffort(params);
      default:
        return { error: `Unknown action: ${action}`, availableActions: [
          "generate_roadmap", "break_down_milestone", "suggest_tasks",
          "analyze_roadmap", "prioritize", "estimate",
        ]};
    }
  },

  /**
   * Generate a full roadmap from a project description.
   */
  generateRoadmap({ title, description, type = "webapp" }) {
    const template = TECH_TEMPLATES[type] || TECH_TEMPLATES.webapp;
    const roadmap = RoadmapModel.createRoadmap({ title, description });

    const milestones = [];
    for (const tmpl of template.milestones) {
      const milestone = RoadmapModel.createMilestone({
        roadmap_id: roadmap.id,
        title: tmpl.title,
        description: `Auto-generated milestone for: ${tmpl.title}`,
        priority: PRIORITY_LEVELS.medium,
      });

      const tasks = [];
      for (const taskTmpl of tmpl.tasks) {
        const task = RoadmapModel.createTask({
          milestone_id: milestone.id,
          title: taskTmpl.title,
          category: taskTmpl.category,
          effort: taskTmpl.effort,
        });
        tasks.push(task);
      }

      milestones.push({ ...milestone, tasks });
    }

    const result = { ...roadmap, milestones };

    RoadmapModel.createAgentLog({
      roadmap_id: roadmap.id,
      action: "generate_roadmap",
      input: JSON.stringify({ title, description, type }),
      output: result,
    });

    return result;
  },

  /**
   * Break a milestone down into more granular tasks based on its title/description.
   */
  breakDownMilestone({ milestone_id, focus_areas = [] }) {
    const milestone = RoadmapModel.getMilestoneById(milestone_id);
    if (!milestone) return { error: "Milestone not found" };

    const titleLower = milestone.title.toLowerCase();
    const suggestedTasks = [];

    // Context-aware task suggestions based on milestone content
    if (titleLower.includes("auth")) {
      suggestedTasks.push(
        { title: "Design auth database schema (users, sessions, roles)", category: "database", effort: "medium" },
        { title: "Implement JWT token generation and validation", category: "backend", effort: "medium" },
        { title: "Build login and registration API endpoints", category: "backend", effort: "medium" },
        { title: "Create login/signup UI forms with validation", category: "frontend", effort: "medium" },
        { title: "Add password reset flow", category: "backend", effort: "small" },
        { title: "Write auth integration tests", category: "testing", effort: "medium" },
      );
    } else if (titleLower.includes("api") || titleLower.includes("backend")) {
      suggestedTasks.push(
        { title: "Define API route structure and middleware", category: "backend", effort: "medium" },
        { title: "Implement data models and database migrations", category: "database", effort: "medium" },
        { title: "Build CRUD operations for core resources", category: "backend", effort: "large" },
        { title: "Add request validation and error handling", category: "backend", effort: "small" },
        { title: "Implement pagination and query filtering", category: "backend", effort: "small" },
        { title: "Write unit and integration tests", category: "testing", effort: "medium" },
      );
    } else if (titleLower.includes("frontend") || titleLower.includes("ui")) {
      suggestedTasks.push(
        { title: "Set up component library with base styles", category: "frontend", effort: "medium" },
        { title: "Build reusable form components", category: "frontend", effort: "medium" },
        { title: "Implement page layouts and responsive design", category: "frontend", effort: "medium" },
        { title: "Connect API services with state management", category: "frontend", effort: "large" },
        { title: "Add loading states and error boundaries", category: "frontend", effort: "small" },
        { title: "Write component tests", category: "testing", effort: "medium" },
      );
    } else if (titleLower.includes("deploy") || titleLower.includes("devops") || titleLower.includes("ci")) {
      suggestedTasks.push(
        { title: "Set up Docker containerization", category: "devops", effort: "medium" },
        { title: "Configure CI pipeline (lint, test, build)", category: "devops", effort: "medium" },
        { title: "Set up staging and production environments", category: "devops", effort: "large" },
        { title: "Add monitoring and alerting", category: "devops", effort: "medium" },
        { title: "Create deployment runbook documentation", category: "general", effort: "small" },
      );
    } else if (titleLower.includes("test")) {
      suggestedTasks.push(
        { title: "Set up testing framework and utilities", category: "testing", effort: "small" },
        { title: "Write unit tests for business logic", category: "testing", effort: "large" },
        { title: "Write API integration tests", category: "testing", effort: "large" },
        { title: "Write E2E tests for critical user flows", category: "testing", effort: "large" },
        { title: "Set up code coverage reporting", category: "devops", effort: "small" },
      );
    } else {
      suggestedTasks.push(
        { title: `Research and define requirements for "${milestone.title}"`, category: "general", effort: "medium" },
        { title: `Design technical approach for "${milestone.title}"`, category: "general", effort: "medium" },
        { title: `Implement core functionality`, category: "backend", effort: "large" },
        { title: `Build UI components`, category: "frontend", effort: "medium" },
        { title: `Write tests`, category: "testing", effort: "medium" },
      );
    }

    // Filter by focus areas if provided
    const filtered = focus_areas.length > 0
      ? suggestedTasks.filter((t) => focus_areas.includes(t.category))
      : suggestedTasks;

    // Create the tasks
    const created = filtered.map((t) =>
      RoadmapModel.createTask({ milestone_id, ...t })
    );

    RoadmapModel.createAgentLog({
      roadmap_id: milestone.roadmap_id,
      action: "break_down_milestone",
      input: JSON.stringify({ milestone_id, focus_areas }),
      output: created,
    });

    return { milestone, tasks_created: created };
  },

  /**
   * Suggest additional tasks for an existing milestone.
   */
  suggestTasks({ milestone_id, count = 3 }) {
    const milestone = RoadmapModel.getMilestoneById(milestone_id);
    if (!milestone) return { error: "Milestone not found" };

    const existingTasks = RoadmapModel.getTasks(milestone_id);
    const existingTitles = new Set(existingTasks.map((t) => t.title.toLowerCase()));
    const existingCategories = existingTasks.map((t) => t.category);

    // Find underrepresented categories
    const categoryCounts = {};
    for (const cat of TASK_CATEGORIES) categoryCounts[cat] = 0;
    for (const cat of existingCategories) categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;

    const suggestions = [];

    // Suggest testing tasks if none exist
    if (categoryCounts.testing === 0) {
      suggestions.push({
        title: "Add test coverage for this milestone's features",
        category: "testing",
        effort: "medium",
        reason: "No testing tasks found - critical for quality",
      });
    }

    // Suggest documentation if none exists
    if (!existingTitles.has("documentation") && !existingTitles.has("docs")) {
      suggestions.push({
        title: "Write technical documentation for implemented features",
        category: "general",
        effort: "small",
        reason: "Documentation helps with maintainability",
      });
    }

    // Suggest code review task
    if (!existingTasks.some((t) => t.title.toLowerCase().includes("review"))) {
      suggestions.push({
        title: "Code review and refactoring pass",
        category: "general",
        effort: "medium",
        reason: "Code quality check before milestone completion",
      });
    }

    // Suggest DevOps if not covered
    if (categoryCounts.devops === 0) {
      suggestions.push({
        title: "Set up deployment configuration for this milestone",
        category: "devops",
        effort: "medium",
        reason: "DevOps tasks ensure smooth deployment",
      });
    }

    const result = suggestions.slice(0, count);

    RoadmapModel.createAgentLog({
      roadmap_id: milestone.roadmap_id,
      action: "suggest_tasks",
      input: JSON.stringify({ milestone_id, count }),
      output: result,
    });

    return { milestone, suggestions: result };
  },

  /**
   * Analyze a roadmap and provide status report with recommendations.
   */
  analyzeRoadmap({ roadmap_id }) {
    const roadmap = RoadmapModel.getFullRoadmap(roadmap_id);
    if (!roadmap) return { error: "Roadmap not found" };

    const totalMilestones = roadmap.milestones.length;
    const allTasks = roadmap.milestones.flatMap((m) => m.tasks);
    const totalTasks = allTasks.length;

    const tasksByStatus = {};
    for (const task of allTasks) {
      tasksByStatus[task.status] = (tasksByStatus[task.status] || 0) + 1;
    }

    const tasksByCategory = {};
    for (const task of allTasks) {
      tasksByCategory[task.category] = (tasksByCategory[task.category] || 0) + 1;
    }

    const tasksByEffort = {};
    for (const task of allTasks) {
      tasksByEffort[task.effort] = (tasksByEffort[task.effort] || 0) + 1;
    }

    const completedTasks = tasksByStatus["done"] || 0;
    const progressPercent = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

    // Generate recommendations
    const recommendations = [];

    if (totalTasks === 0) {
      recommendations.push({
        type: "warning",
        message: "Roadmap has no tasks. Use the agent to break down milestones into tasks.",
      });
    }

    if (!tasksByCategory.testing) {
      recommendations.push({
        type: "warning",
        message: "No testing tasks found. Consider adding test coverage tasks.",
      });
    }

    if (!tasksByCategory.devops) {
      recommendations.push({
        type: "info",
        message: "No DevOps tasks found. Consider adding CI/CD and deployment tasks.",
      });
    }

    const milestonesWithNoTasks = roadmap.milestones.filter((m) => m.tasks.length === 0);
    if (milestonesWithNoTasks.length > 0) {
      recommendations.push({
        type: "warning",
        message: `${milestonesWithNoTasks.length} milestone(s) have no tasks: ${milestonesWithNoTasks.map((m) => m.title).join(", ")}`,
      });
    }

    const epicTasks = allTasks.filter((t) => t.effort === "epic");
    if (epicTasks.length > 0) {
      recommendations.push({
        type: "info",
        message: `${epicTasks.length} epic-sized task(s) found. Consider breaking them into smaller tasks.`,
      });
    }

    const analysis = {
      roadmap: { id: roadmap.id, title: roadmap.title, status: roadmap.status },
      stats: {
        total_milestones: totalMilestones,
        total_tasks: totalTasks,
        progress_percent: progressPercent,
        tasks_by_status: tasksByStatus,
        tasks_by_category: tasksByCategory,
        tasks_by_effort: tasksByEffort,
      },
      recommendations,
    };

    RoadmapModel.createAgentLog({
      roadmap_id,
      action: "analyze_roadmap",
      input: JSON.stringify({ roadmap_id }),
      output: analysis,
    });

    return analysis;
  },

  /**
   * Re-prioritize tasks within a milestone based on dependencies and effort.
   */
  prioritizeTasks({ milestone_id }) {
    const milestone = RoadmapModel.getMilestoneById(milestone_id);
    if (!milestone) return { error: "Milestone not found" };

    const tasks = RoadmapModel.getTasks(milestone_id);
    if (tasks.length === 0) return { milestone, tasks: [], message: "No tasks to prioritize" };

    // Priority order: devops/setup first, then database, backend, frontend, testing, general last
    const categoryOrder = { devops: 0, database: 1, backend: 2, frontend: 3, design: 4, testing: 5, general: 6 };
    const effortOrder = { trivial: 0, small: 1, medium: 2, large: 3, epic: 4 };

    const sorted = [...tasks].sort((a, b) => {
      const catDiff = (categoryOrder[a.category] || 6) - (categoryOrder[b.category] || 6);
      if (catDiff !== 0) return catDiff;
      return (effortOrder[a.effort] || 2) - (effortOrder[b.effort] || 2);
    });

    // Update positions
    const updated = sorted.map((task, i) => {
      return RoadmapModel.updateTask(task.id, { position: i });
    });

    RoadmapModel.createAgentLog({
      roadmap_id: milestone.roadmap_id,
      action: "prioritize",
      input: JSON.stringify({ milestone_id }),
      output: updated,
    });

    return { milestone, tasks: updated };
  },

  /**
   * Provide effort estimates and a summary for a milestone.
   */
  estimateEffort({ milestone_id }) {
    const milestone = RoadmapModel.getMilestoneById(milestone_id);
    if (!milestone) return { error: "Milestone not found" };

    const tasks = RoadmapModel.getTasks(milestone_id);

    const effortPoints = { trivial: 1, small: 2, medium: 5, large: 8, epic: 13 };
    let totalPoints = 0;
    const breakdown = [];

    for (const task of tasks) {
      const points = effortPoints[task.effort] || 5;
      totalPoints += points;
      breakdown.push({
        task: task.title,
        effort: task.effort,
        points,
        category: task.category,
      });
    }

    const estimation = {
      milestone: { id: milestone.id, title: milestone.title },
      total_story_points: totalPoints,
      task_count: tasks.length,
      breakdown,
      summary: `Milestone "${milestone.title}" contains ${tasks.length} tasks totaling ${totalPoints} story points.`,
    };

    RoadmapModel.createAgentLog({
      roadmap_id: milestone.roadmap_id,
      action: "estimate",
      input: JSON.stringify({ milestone_id }),
      output: estimation,
    });

    return estimation;
  },
};

module.exports = DeveloperAgent;
