const db = require("./models/db");
const { v4: uuidv4 } = require("uuid");
const bcrypt = require("bcryptjs");

console.log("Seeding Roadway database with demo data...\n");

// Clear existing data (in reverse dependency order)
db.exec(`
  DELETE FROM lens_perspectives;
  DELETE FROM lenses;
  DELETE FROM snapshots;
  DELETE FROM activity_logs;
  DELETE FROM comments;
  DELETE FROM card_dependencies;
  DELETE FROM card_tags;
  DELETE FROM custom_field_values;
  DELETE FROM custom_fields;
  DELETE FROM cards;
  DELETE FROM roadmap_rows;
  DELETE FROM roadmaps;
  DELETE FROM collaborators;
  DELETE FROM integrations;
  DELETE FROM time_off;
  DELETE FROM team_members;
  DELETE FROM teams;
  DELETE FROM tags;
  DELETE FROM users;
  DELETE FROM workspaces;
`);

// =====================
// IDs (pre-generated for cross-referencing)
// =====================
const workspaceId = uuidv4();
const userId = uuidv4();
const teamFrontendId = uuidv4();
const teamBackendId = uuidv4();
const roadmapId = uuidv4();

const row1Id = uuidv4();
const row2Id = uuidv4();
const row3Id = uuidv4();

const card1Id = uuidv4();
const card2Id = uuidv4();
const card3Id = uuidv4();
const card4Id = uuidv4();
const card5Id = uuidv4();
const card6Id = uuidv4();
const card7Id = uuidv4();
const card8Id = uuidv4();

const tag1Id = uuidv4();
const tag2Id = uuidv4();
const tag3Id = uuidv4();

const lens1Id = uuidv4();
const lens2Id = uuidv4();
const lens3Id = uuidv4();

// =====================
// Workspace
// =====================
db.prepare(
  "INSERT INTO workspaces (id, name, owner_user_id) VALUES (?, ?, ?)"
).run(workspaceId, "Acme Corp", userId);
console.log("Created workspace: Acme Corp");

// =====================
// User
// =====================
const passwordHash = bcrypt.hashSync("demo1234", 10);
db.prepare(
  "INSERT INTO users (id, name, email, password_hash, workspace_id, role) VALUES (?, ?, ?, ?, ?, ?)"
).run(userId, "Demo User", "demo@roadway.app", passwordHash, workspaceId, "admin");
console.log("Created user: demo@roadway.app (password: demo1234)");

// =====================
// Teams
// =====================
db.prepare(
  "INSERT INTO teams (id, workspace_id, name, color, dev_count, capacity_method, avg_output_per_dev, sprint_length_weeks) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
).run(teamFrontendId, workspaceId, "Frontend", "#14b8a6", 4, "points", 8, 2);

db.prepare(
  "INSERT INTO teams (id, workspace_id, name, color, dev_count, capacity_method, avg_output_per_dev, sprint_length_weeks) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
).run(teamBackendId, workspaceId, "Backend", "#3b82f6", 5, "points", 10, 2);

console.log("Created teams: Frontend (teal), Backend (blue)");

// Team members
const feMembers = ["Alice Chen", "Bob Martinez", "Cara Williams", "David Kim"];
const beMembers = ["Eve Johnson", "Frank Lee", "Grace Patel", "Henry Zhou", "Isla Moore"];

const feMemberIds = [];
const beMemberIds = [];

for (const name of feMembers) {
  const id = uuidv4();
  feMemberIds.push(id);
  db.prepare("INSERT INTO team_members (id, team_id, name) VALUES (?, ?, ?)").run(id, teamFrontendId, name);
}
for (const name of beMembers) {
  const id = uuidv4();
  beMemberIds.push(id);
  db.prepare("INSERT INTO team_members (id, team_id, name) VALUES (?, ?, ?)").run(id, teamBackendId, name);
}

// Time off
db.prepare(
  "INSERT INTO time_off (id, team_member_id, start_date, end_date, type) VALUES (?, ?, ?, ?, ?)"
).run(uuidv4(), feMemberIds[0], "2026-03-16", "2026-03-20", "vacation");
db.prepare(
  "INSERT INTO time_off (id, team_member_id, start_date, end_date, type) VALUES (?, ?, ?, ?, ?)"
).run(uuidv4(), beMemberIds[2], "2026-04-06", "2026-04-10", "conference");

// =====================
// Tags
// =====================
db.prepare("INSERT INTO tags (id, workspace_id, name, color) VALUES (?, ?, ?, ?)").run(tag1Id, workspaceId, "P0 - Critical", "#ef4444");
db.prepare("INSERT INTO tags (id, workspace_id, name, color) VALUES (?, ?, ?, ?)").run(tag2Id, workspaceId, "P1 - Important", "#f59e0b");
db.prepare("INSERT INTO tags (id, workspace_id, name, color) VALUES (?, ?, ?, ?)").run(tag3Id, workspaceId, "Tech Debt", "#8b5cf6");
console.log("Created 3 tags: P0 - Critical, P1 - Important, Tech Debt");

// =====================
// Roadmap
// =====================
db.prepare(
  "INSERT INTO roadmaps (id, workspace_id, name, status, time_start, time_end, subdivision_type, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
).run(roadmapId, workspaceId, "2026 Product Roadmap", "active", "2026-01-01", "2026-12-31", "quarter", userId);
console.log("Created roadmap: 2026 Product Roadmap");

// =====================
// Roadmap Rows
// =====================
db.prepare(
  "INSERT INTO roadmap_rows (id, roadmap_id, name, color, sort_order) VALUES (?, ?, ?, ?, ?)"
).run(row1Id, roadmapId, "Core Platform", "#3b82f6", 0);
db.prepare(
  "INSERT INTO roadmap_rows (id, roadmap_id, name, color, sort_order) VALUES (?, ?, ?, ?, ?)"
).run(row2Id, roadmapId, "User Experience", "#14b8a6", 1);
db.prepare(
  "INSERT INTO roadmap_rows (id, roadmap_id, name, color, sort_order) VALUES (?, ?, ?, ?, ?)"
).run(row3Id, roadmapId, "Infrastructure", "#8b5cf6", 2);
console.log("Created 3 rows: Core Platform, User Experience, Infrastructure");

// =====================
// Cards
// =====================
const cards = [
  {
    id: card1Id, roadmap_id: roadmapId, row_id: row1Id,
    name: "User Authentication Overhaul", description: "Redesign auth system with OAuth2, MFA, and SSO support. Replace legacy session-based auth.",
    status: "committed", team_id: teamBackendId, effort: 13, headcount: 2,
    start_sprint: 1, duration_sprints: 3, sort_order: 0, created_by: userId
  },
  {
    id: card2Id, roadmap_id: roadmapId, row_id: row1Id,
    name: "API v3 Migration", description: "Migrate all endpoints to v3 API standard with GraphQL support and improved rate limiting.",
    status: "committed", team_id: teamBackendId, effort: 21, headcount: 3,
    start_sprint: 2, duration_sprints: 4, sort_order: 1, created_by: userId
  },
  {
    id: card3Id, roadmap_id: roadmapId, row_id: row2Id,
    name: "Design System 2.0", description: "Build comprehensive component library with accessibility-first approach. Tokens, primitives, and composites.",
    status: "committed", team_id: teamFrontendId, effort: 8, headcount: 2,
    start_sprint: 1, duration_sprints: 2, sort_order: 2, created_by: userId
  },
  {
    id: card4Id, roadmap_id: roadmapId, row_id: row2Id,
    name: "Dashboard Redesign", description: "Reimagine the main dashboard with customizable widgets, real-time data, and improved navigation.",
    status: "tentative", team_id: teamFrontendId, effort: 13, headcount: 2,
    start_sprint: 3, duration_sprints: 3, sort_order: 3, created_by: userId
  },
  {
    id: card5Id, roadmap_id: roadmapId, row_id: row3Id,
    name: "CI/CD Pipeline Upgrade", description: "Move to GitHub Actions with parallel test runs, automated deployments, and canary releases.",
    status: "committed", team_id: teamBackendId, effort: 5, headcount: 1,
    start_sprint: 1, duration_sprints: 2, sort_order: 4, created_by: userId
  },
  {
    id: card6Id, roadmap_id: roadmapId, row_id: row1Id,
    name: "Real-time Collaboration", description: "WebSocket-based real-time features: presence, live cursors, instant updates, and conflict resolution.",
    status: "placeholder", team_id: teamBackendId, effort: 21, headcount: 2,
    start_sprint: 5, duration_sprints: 4, sort_order: 5, created_by: userId
  },
  {
    id: card7Id, roadmap_id: roadmapId, row_id: row2Id,
    name: "Mobile Responsive Overhaul", description: "Full responsive redesign for tablet and mobile viewports with touch-optimized interactions.",
    status: "tentative", team_id: teamFrontendId, effort: 8, headcount: 1,
    start_sprint: 5, duration_sprints: 3, sort_order: 6, created_by: userId
  },
  {
    id: card8Id, roadmap_id: roadmapId, row_id: row3Id,
    name: "Database Sharding", description: "Implement horizontal sharding for the primary database to support 10x growth in data volume.",
    status: "placeholder", team_id: teamBackendId, effort: 34, headcount: 2,
    start_sprint: 7, duration_sprints: 5, sort_order: 7, created_by: userId
  }
];

const insertCard = db.prepare(
  `INSERT INTO cards (id, roadmap_id, row_id, name, description, status, team_id, effort, headcount, start_sprint, duration_sprints, sort_order, created_by)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
);

for (const c of cards) {
  insertCard.run(c.id, c.roadmap_id, c.row_id, c.name, c.description, c.status, c.team_id, c.effort, c.headcount, c.start_sprint, c.duration_sprints, c.sort_order, c.created_by);
}
console.log("Created 8 cards across 3 rows");

// =====================
// Card Tags
// =====================
db.prepare("INSERT INTO card_tags (id, card_id, tag_id) VALUES (?, ?, ?)").run(uuidv4(), card1Id, tag1Id);
db.prepare("INSERT INTO card_tags (id, card_id, tag_id) VALUES (?, ?, ?)").run(uuidv4(), card2Id, tag1Id);
db.prepare("INSERT INTO card_tags (id, card_id, tag_id) VALUES (?, ?, ?)").run(uuidv4(), card3Id, tag2Id);
db.prepare("INSERT INTO card_tags (id, card_id, tag_id) VALUES (?, ?, ?)").run(uuidv4(), card5Id, tag2Id);
db.prepare("INSERT INTO card_tags (id, card_id, tag_id) VALUES (?, ?, ?)").run(uuidv4(), card8Id, tag3Id);
db.prepare("INSERT INTO card_tags (id, card_id, tag_id) VALUES (?, ?, ?)").run(uuidv4(), card6Id, tag2Id);

// Card dependencies
db.prepare("INSERT INTO card_dependencies (id, from_card_id, to_card_id, type) VALUES (?, ?, ?, ?)").run(uuidv4(), card1Id, card6Id, "blocks");
db.prepare("INSERT INTO card_dependencies (id, from_card_id, to_card_id, type) VALUES (?, ?, ?, ?)").run(uuidv4(), card3Id, card4Id, "blocks");
db.prepare("INSERT INTO card_dependencies (id, from_card_id, to_card_id, type) VALUES (?, ?, ?, ?)").run(uuidv4(), card5Id, card2Id, "blocks");

// =====================
// Lenses
// =====================
db.prepare(
  `INSERT INTO lenses (id, workspace_id, name, icon, description, is_active, strategy_context, data_source, priority_fields)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
).run(
  lens1Id, workspaceId, "Customer Impact", "users", "Evaluates features based on their direct impact on customer satisfaction and retention",
  1, "Focus on features that drive NPS and reduce churn. Prioritize items affecting >1000 users.",
  "manual", JSON.stringify(["effort", "headcount", "status"])
);

db.prepare(
  `INSERT INTO lenses (id, workspace_id, name, icon, description, is_active, strategy_context, data_source, priority_fields)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
).run(
  lens2Id, workspaceId, "Engineering Efficiency", "zap", "Measures technical value including debt reduction, performance gains, and developer productivity",
  1, "Prioritize items that reduce toil, improve CI/CD times, or eliminate recurring incidents.",
  "manual", JSON.stringify(["effort", "team_id"])
);

db.prepare(
  `INSERT INTO lenses (id, workspace_id, name, icon, description, is_active, strategy_context, data_source, priority_fields)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
).run(
  lens3Id, workspaceId, "Revenue Potential", "trending-up", "Assesses features by their potential to drive new revenue or expand existing accounts",
  1, "Focus on features that unlock new market segments or increase ARPU by >10%.",
  "manual", JSON.stringify(["effort", "status", "headcount"])
);

console.log("Created 3 lenses: Customer Impact, Engineering Efficiency, Revenue Potential");

// =====================
// Lens Perspectives
// =====================
const perspectives = [
  // Customer Impact lens
  { lens_id: lens1Id, card_id: card1Id, score: "85", narrative: "Auth overhaul directly impacts login experience for all users. High customer visibility." },
  { lens_id: lens1Id, card_id: card3Id, score: "90", narrative: "Design system improvements ripple across all user-facing surfaces. Major UX uplift." },
  { lens_id: lens1Id, card_id: card4Id, score: "95", narrative: "Dashboard is the most visited page. Redesign has highest customer impact potential." },
  { lens_id: lens1Id, card_id: card7Id, score: "80", narrative: "Growing mobile user base (35%) makes responsive overhaul essential for retention." },

  // Engineering Efficiency lens
  { lens_id: lens2Id, card_id: card2Id, score: "70", narrative: "API v3 migration reduces endpoint complexity but requires significant coordination." },
  { lens_id: lens2Id, card_id: card5Id, score: "95", narrative: "CI/CD upgrade eliminates 40min build bottleneck. Highest efficiency ROI." },
  { lens_id: lens2Id, card_id: card8Id, score: "60", narrative: "Sharding needed long-term but complex implementation with high risk." },
  { lens_id: lens2Id, card_id: card6Id, score: "75", narrative: "Real-time infrastructure is reusable across many features. Good platform investment." },

  // Revenue Potential lens
  { lens_id: lens3Id, card_id: card1Id, score: "70", narrative: "SSO support unlocks enterprise deals requiring SAML/OIDC authentication." },
  { lens_id: lens3Id, card_id: card4Id, score: "85", narrative: "Customizable dashboard enables premium tier differentiation." },
  { lens_id: lens3Id, card_id: card6Id, score: "90", narrative: "Real-time collaboration is the #1 requested feature by enterprise prospects." },
  { lens_id: lens3Id, card_id: card7Id, score: "65", narrative: "Mobile access is table stakes but won't directly drive new revenue." },
];

const insertPersp = db.prepare(
  "INSERT INTO lens_perspectives (id, lens_id, card_id, score, narrative) VALUES (?, ?, ?, ?, ?)"
);
for (const p of perspectives) {
  insertPersp.run(uuidv4(), p.lens_id, p.card_id, p.score, p.narrative);
}
console.log("Created 12 lens perspectives across 3 lenses");

// =====================
// Snapshots
// =====================
const snapshotData1 = {
  roadmap: { id: roadmapId, name: "2026 Product Roadmap", status: "draft" },
  rows: [
    { id: row1Id, name: "Core Platform", color: "#3b82f6", sort_order: 0 },
    { id: row2Id, name: "User Experience", color: "#14b8a6", sort_order: 1 },
  ],
  cards: cards.slice(0, 5).map((c) => ({ ...c, tags: [] })),
  dependencies: [],
  captured_at: "2026-01-15T10:00:00.000Z",
};

const snapshotData2 = {
  roadmap: { id: roadmapId, name: "2026 Product Roadmap", status: "active" },
  rows: [
    { id: row1Id, name: "Core Platform", color: "#3b82f6", sort_order: 0 },
    { id: row2Id, name: "User Experience", color: "#14b8a6", sort_order: 1 },
    { id: row3Id, name: "Infrastructure", color: "#8b5cf6", sort_order: 2 },
  ],
  cards: cards.map((c) => ({ ...c, tags: [] })),
  dependencies: [
    { from_card_id: card1Id, to_card_id: card6Id, type: "blocks" },
    { from_card_id: card3Id, to_card_id: card4Id, type: "blocks" },
  ],
  captured_at: "2026-02-01T14:30:00.000Z",
};

db.prepare(
  "INSERT INTO snapshots (id, roadmap_id, name, data, created_at, created_by) VALUES (?, ?, ?, ?, ?, ?)"
).run(uuidv4(), roadmapId, "Initial Planning - Jan 15", JSON.stringify(snapshotData1), "2026-01-15T10:00:00.000Z", userId);

db.prepare(
  "INSERT INTO snapshots (id, roadmap_id, name, data, created_at, created_by) VALUES (?, ?, ?, ?, ?, ?)"
).run(uuidv4(), roadmapId, "Sprint Review - Feb 1", JSON.stringify(snapshotData2), "2026-02-01T14:30:00.000Z", userId);

console.log("Created 2 snapshots");

// =====================
// Comments & Activity
// =====================
const commentId1 = uuidv4();
db.prepare(
  "INSERT INTO comments (id, card_id, user_id, text, created_at) VALUES (?, ?, ?, ?, ?)"
).run(commentId1, card1Id, userId, "We should consider Auth0 vs building in-house. Let's discuss in the next sprint planning.", "2026-01-20T09:15:00.000Z");

db.prepare(
  "INSERT INTO comments (id, card_id, user_id, text, parent_comment_id, created_at) VALUES (?, ?, ?, ?, ?, ?)"
).run(uuidv4(), card1Id, userId, "Good point. I've set up a comparison doc. Building in-house gives us more control over the MFA flow.", commentId1, "2026-01-20T10:30:00.000Z");

db.prepare(
  "INSERT INTO comments (id, card_id, user_id, text, created_at) VALUES (?, ?, ?, ?, ?)"
).run(uuidv4(), card4Id, userId, "Wireframes are ready for review. Focusing on customizable widget grid as the core interaction.", "2026-01-25T14:00:00.000Z");

// Activity logs
const activities = [
  { card_id: card1Id, action_type: "card_created", action_detail: "Card created: User Authentication Overhaul", created_at: "2026-01-10T09:00:00.000Z" },
  { card_id: card1Id, action_type: "status_changed", action_detail: "Status changed from placeholder to committed", created_at: "2026-01-12T11:00:00.000Z" },
  { card_id: card3Id, action_type: "card_created", action_detail: "Card created: Design System 2.0", created_at: "2026-01-10T09:05:00.000Z" },
  { card_id: card5Id, action_type: "card_created", action_detail: "Card created: CI/CD Pipeline Upgrade", created_at: "2026-01-10T09:10:00.000Z" },
  { card_id: card4Id, action_type: "effort_updated", action_detail: "Effort updated to 13 points", created_at: "2026-01-18T15:00:00.000Z" },
  { card_id: card6Id, action_type: "card_created", action_detail: "Card created: Real-time Collaboration", created_at: "2026-01-22T10:00:00.000Z" },
];

const insertActivity = db.prepare(
  "INSERT INTO activity_logs (id, card_id, user_id, action_type, action_detail, created_at) VALUES (?, ?, ?, ?, ?, ?)"
);
for (const a of activities) {
  insertActivity.run(uuidv4(), a.card_id, userId, a.action_type, a.action_detail, a.created_at);
}

// =====================
// Custom Fields
// =====================
const cf1Id = uuidv4();
const cf2Id = uuidv4();
db.prepare("INSERT INTO custom_fields (id, workspace_id, name, field_type) VALUES (?, ?, ?, ?)").run(cf1Id, workspaceId, "Risk Level", "select");
db.prepare("INSERT INTO custom_fields (id, workspace_id, name, field_type) VALUES (?, ?, ?, ?)").run(cf2Id, workspaceId, "Business Sponsor", "text");

db.prepare("INSERT INTO custom_field_values (id, card_id, custom_field_id, value) VALUES (?, ?, ?, ?)").run(uuidv4(), card1Id, cf1Id, "Medium");
db.prepare("INSERT INTO custom_field_values (id, card_id, custom_field_id, value) VALUES (?, ?, ?, ?)").run(uuidv4(), card8Id, cf1Id, "High");
db.prepare("INSERT INTO custom_field_values (id, card_id, custom_field_id, value) VALUES (?, ?, ?, ?)").run(uuidv4(), card1Id, cf2Id, "VP Engineering");
db.prepare("INSERT INTO custom_field_values (id, card_id, custom_field_id, value) VALUES (?, ?, ?, ?)").run(uuidv4(), card4Id, cf2Id, "Head of Product");

console.log("\n--- Seed Summary ---");
console.log("Workspace: Acme Corp");
console.log("User:      demo@roadway.app / demo1234");
console.log("Teams:     Frontend (teal, 4 members), Backend (blue, 5 members)");
console.log("Roadmap:   2026 Product Roadmap (3 rows, 8 cards)");
console.log("Tags:      P0 - Critical, P1 - Important, Tech Debt");
console.log("Lenses:    Customer Impact, Engineering Efficiency, Revenue Potential (12 perspectives)");
console.log("Snapshots: 2 (Jan 15, Feb 1)");
console.log("Comments:  3 (with 1 threaded reply)");
console.log("Activity:  6 log entries");
console.log("Custom:    2 fields with 4 values");
console.log("\nSeed complete!");
