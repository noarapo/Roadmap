const Database = require("better-sqlite3");
const path = require("path");

const db = new Database(path.join(__dirname, "../data.db"));

db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS workspaces (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    owner_user_id TEXT
  );

  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT,
    avatar_url TEXT,
    workspace_id TEXT,
    role TEXT DEFAULT 'member',
    last_roadmap_id TEXT,
    FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS teams (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL,
    name TEXT NOT NULL,
    color TEXT,
    dev_count INTEGER DEFAULT 5,
    capacity_method TEXT DEFAULT 'points',
    avg_output_per_dev REAL DEFAULT 8,
    sprint_length_weeks INTEGER DEFAULT 2,
    FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS team_members (
    id TEXT PRIMARY KEY,
    team_id TEXT NOT NULL,
    name TEXT NOT NULL,
    FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS time_off (
    id TEXT PRIMARY KEY,
    team_member_id TEXT NOT NULL,
    start_date TEXT NOT NULL,
    end_date TEXT NOT NULL,
    type TEXT DEFAULT 'vacation',
    FOREIGN KEY (team_member_id) REFERENCES team_members(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS roadmaps (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL,
    name TEXT NOT NULL,
    status TEXT DEFAULT 'draft',
    time_start TEXT,
    time_end TEXT,
    subdivision_type TEXT,
    created_by TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS roadmap_rows (
    id TEXT PRIMARY KEY,
    roadmap_id TEXT NOT NULL,
    name TEXT NOT NULL,
    color TEXT,
    sort_order INTEGER DEFAULT 0,
    FOREIGN KEY (roadmap_id) REFERENCES roadmaps(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS cards (
    id TEXT PRIMARY KEY,
    roadmap_id TEXT NOT NULL,
    row_id TEXT,
    name TEXT NOT NULL,
    description TEXT,
    status TEXT DEFAULT 'placeholder',
    team_id TEXT,
    effort REAL,
    headcount INTEGER DEFAULT 1,
    start_sprint INTEGER,
    duration_sprints INTEGER DEFAULT 1,
    sort_order INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    created_by TEXT,
    FOREIGN KEY (roadmap_id) REFERENCES roadmaps(id) ON DELETE CASCADE,
    FOREIGN KEY (row_id) REFERENCES roadmap_rows(id) ON DELETE SET NULL,
    FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE SET NULL,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS tags (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL,
    name TEXT NOT NULL,
    color TEXT,
    FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS card_tags (
    id TEXT PRIMARY KEY,
    card_id TEXT NOT NULL,
    tag_id TEXT NOT NULL,
    FOREIGN KEY (card_id) REFERENCES cards(id) ON DELETE CASCADE,
    FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS card_dependencies (
    id TEXT PRIMARY KEY,
    from_card_id TEXT NOT NULL,
    to_card_id TEXT NOT NULL,
    type TEXT DEFAULT 'blocks',
    FOREIGN KEY (from_card_id) REFERENCES cards(id) ON DELETE CASCADE,
    FOREIGN KEY (to_card_id) REFERENCES cards(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS custom_fields (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL,
    name TEXT NOT NULL,
    field_type TEXT NOT NULL,
    options TEXT,
    FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS custom_field_values (
    id TEXT PRIMARY KEY,
    card_id TEXT NOT NULL,
    custom_field_id TEXT NOT NULL,
    value TEXT,
    FOREIGN KEY (card_id) REFERENCES cards(id) ON DELETE CASCADE,
    FOREIGN KEY (custom_field_id) REFERENCES custom_fields(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS lenses (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL,
    name TEXT NOT NULL,
    icon TEXT,
    description TEXT,
    is_active INTEGER DEFAULT 1,
    strategy_context TEXT,
    data_source TEXT DEFAULT 'manual',
    priority_fields TEXT,
    FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS lens_perspectives (
    id TEXT PRIMARY KEY,
    lens_id TEXT NOT NULL,
    card_id TEXT NOT NULL,
    score TEXT,
    narrative TEXT,
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (lens_id) REFERENCES lenses(id) ON DELETE CASCADE,
    FOREIGN KEY (card_id) REFERENCES cards(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS snapshots (
    id TEXT PRIMARY KEY,
    roadmap_id TEXT NOT NULL,
    name TEXT NOT NULL,
    data TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    created_by TEXT,
    FOREIGN KEY (roadmap_id) REFERENCES roadmaps(id) ON DELETE CASCADE,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS comments (
    id TEXT PRIMARY KEY,
    roadmap_id TEXT NOT NULL,
    card_id TEXT,
    user_id TEXT,
    text TEXT NOT NULL,
    parent_comment_id TEXT,
    resolved INTEGER DEFAULT 0,
    resolved_by TEXT,
    resolved_at TEXT,
    anchor_type TEXT DEFAULT 'cell' CHECK (anchor_type IN ('card', 'cell')),
    anchor_row_id TEXT,
    anchor_sprint_id TEXT,
    anchor_x_pct REAL DEFAULT 50,
    anchor_y_pct REAL DEFAULT 50,
    pin_number INTEGER,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (roadmap_id) REFERENCES roadmaps(id) ON DELETE CASCADE,
    FOREIGN KEY (card_id) REFERENCES cards(id) ON DELETE SET NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (parent_comment_id) REFERENCES comments(id) ON DELETE CASCADE,
    FOREIGN KEY (resolved_by) REFERENCES users(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS comment_reactions (
    id TEXT PRIMARY KEY,
    comment_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    emoji TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (comment_id) REFERENCES comments(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(comment_id, user_id, emoji)
  );

  CREATE TABLE IF NOT EXISTS activity_logs (
    id TEXT PRIMARY KEY,
    card_id TEXT,
    user_id TEXT,
    action_type TEXT NOT NULL,
    action_detail TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (card_id) REFERENCES cards(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS integrations (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL,
    type TEXT NOT NULL,
    auth_token_encrypted TEXT,
    last_synced TEXT,
    field_mapping TEXT,
    FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS collaborators (
    id TEXT PRIMARY KEY,
    roadmap_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    role TEXT DEFAULT 'edit',
    FOREIGN KEY (roadmap_id) REFERENCES roadmaps(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS workspace_settings (
    workspace_id TEXT PRIMARY KEY,
    effort_unit TEXT DEFAULT 'Story Points',
    custom_statuses TEXT DEFAULT '["Placeholder","Planned","In Progress","Done"]',
    status_colors TEXT DEFAULT '{"Placeholder":"#9CA3AF","Planned":"#3B82F6","In Progress":"#F59E0B","Done":"#22C55E"}',
    drawer_field_order TEXT,
    drawer_hidden_fields TEXT DEFAULT '[]',
    FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS card_teams (
    id TEXT PRIMARY KEY,
    card_id TEXT NOT NULL,
    team_id TEXT NOT NULL,
    effort REAL DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (card_id) REFERENCES cards(id) ON DELETE CASCADE,
    FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
    UNIQUE(card_id, team_id)
  );

  CREATE TABLE IF NOT EXISTS sprints (
    id TEXT PRIMARY KEY,
    roadmap_id TEXT NOT NULL,
    name TEXT NOT NULL,
    start_date TEXT NOT NULL,
    end_date TEXT NOT NULL,
    sort_order INTEGER DEFAULT 0,
    goal TEXT,
    status TEXT DEFAULT 'planned',
    FOREIGN KEY (roadmap_id) REFERENCES roadmaps(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    title TEXT DEFAULT 'New conversation',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
    content TEXT NOT NULL,
    provider TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS message_actions (
    id TEXT PRIMARY KEY,
    message_id TEXT NOT NULL,
    action_type TEXT NOT NULL,
    action_payload TEXT NOT NULL,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'rejected')),
    executed_at TEXT,
    FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS ai_usage (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    conversation_id TEXT NOT NULL,
    message_id TEXT NOT NULL,
    provider TEXT NOT NULL,
    input_tokens INTEGER DEFAULT 0,
    output_tokens INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
    FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE
  );
`);

/* Add last_roadmap_id column to existing users table if it doesn't exist */
try {
  db.prepare("SELECT last_roadmap_id FROM users LIMIT 1").get();
} catch {
  db.exec("ALTER TABLE users ADD COLUMN last_roadmap_id TEXT");
}

/* Add canvas comment columns to existing comments table if they don't exist */
try {
  db.prepare("SELECT roadmap_id FROM comments LIMIT 1").get();
} catch {
  db.exec("ALTER TABLE comments ADD COLUMN roadmap_id TEXT");
  db.exec("ALTER TABLE comments ADD COLUMN resolved INTEGER DEFAULT 0");
  db.exec("ALTER TABLE comments ADD COLUMN resolved_by TEXT");
  db.exec("ALTER TABLE comments ADD COLUMN resolved_at TEXT");
  db.exec("ALTER TABLE comments ADD COLUMN anchor_type TEXT DEFAULT 'card'");
  db.exec("ALTER TABLE comments ADD COLUMN anchor_row_id TEXT");
  db.exec("ALTER TABLE comments ADD COLUMN anchor_sprint_id TEXT");
  db.exec("ALTER TABLE comments ADD COLUMN anchor_x_pct REAL DEFAULT 50");
  db.exec("ALTER TABLE comments ADD COLUMN anchor_y_pct REAL DEFAULT 50");
  db.exec("ALTER TABLE comments ADD COLUMN pin_number INTEGER");
}

/* Make card_id nullable in comments (for cell-anchored comments) */
/* SQLite doesn't support ALTER COLUMN, so we recreate the table */
try {
  const info = db.prepare("PRAGMA table_info(comments)").all();
  const cardIdCol = info.find((c) => c.name === "card_id");
  if (cardIdCol && cardIdCol.notnull === 1) {
    db.exec(`
      CREATE TABLE comments_new (
        id TEXT PRIMARY KEY,
        roadmap_id TEXT,
        card_id TEXT,
        user_id TEXT,
        text TEXT NOT NULL,
        parent_comment_id TEXT,
        resolved INTEGER DEFAULT 0,
        resolved_by TEXT,
        resolved_at TEXT,
        anchor_type TEXT DEFAULT 'cell',
        anchor_row_id TEXT,
        anchor_sprint_id TEXT,
        anchor_x_pct REAL DEFAULT 50,
        anchor_y_pct REAL DEFAULT 50,
        pin_number INTEGER,
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (roadmap_id) REFERENCES roadmaps(id) ON DELETE CASCADE,
        FOREIGN KEY (card_id) REFERENCES cards(id) ON DELETE SET NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
        FOREIGN KEY (parent_comment_id) REFERENCES comments_new(id) ON DELETE CASCADE,
        FOREIGN KEY (resolved_by) REFERENCES users(id) ON DELETE SET NULL
      );
      INSERT INTO comments_new SELECT id, roadmap_id, card_id, user_id, text, parent_comment_id,
        resolved, resolved_by, resolved_at, anchor_type, anchor_row_id, anchor_sprint_id,
        anchor_x_pct, anchor_y_pct, pin_number, created_at FROM comments;
      DROP TABLE comments;
      ALTER TABLE comments_new RENAME TO comments;
    `);
  }
} catch (e) {
  // Migration already applied or table is fresh
}

/* Add start_sprint_id and end_sprint_id columns to cards if they don't exist */
try {
  db.prepare("SELECT start_sprint_id FROM cards LIMIT 1").get();
} catch {
  db.exec("ALTER TABLE cards ADD COLUMN start_sprint_id TEXT");
  db.exec("ALTER TABLE cards ADD COLUMN end_sprint_id TEXT");
}

/* Migrate existing cards with integer sprint indices to real sprint entities */
(function migrateCardsToSprints() {
  const roadmaps = db.prepare(
    "SELECT DISTINCT roadmap_id FROM cards WHERE start_sprint IS NOT NULL AND start_sprint_id IS NULL"
  ).all();

  if (roadmaps.length === 0) return;

  const { v4: uuidv4 } = require("uuid");

  for (const { roadmap_id } of roadmaps) {
    // Check if sprints already exist for this roadmap
    const existing = db.prepare("SELECT COUNT(*) as cnt FROM sprints WHERE roadmap_id = ?").get(roadmap_id);
    if (existing.cnt > 0) continue;

    // Create 12 sprints (Jan-Jun 2026, ~2 per month) matching the old hardcoded defaults
    const sprintDefs = [];
    const monthStarts = [
      ["2026-01-01", "2026-01-15"], ["2026-01-16", "2026-01-31"],
      ["2026-02-01", "2026-02-14"], ["2026-02-15", "2026-02-28"],
      ["2026-03-01", "2026-03-15"], ["2026-03-16", "2026-03-31"],
      ["2026-04-01", "2026-04-15"], ["2026-04-16", "2026-04-30"],
      ["2026-05-01", "2026-05-15"], ["2026-05-16", "2026-05-31"],
      ["2026-06-01", "2026-06-15"], ["2026-06-16", "2026-06-30"],
    ];

    for (let i = 0; i < monthStarts.length; i++) {
      const sid = uuidv4();
      sprintDefs.push({ id: sid, index: i, start: monthStarts[i][0], end: monthStarts[i][1] });
      db.prepare(
        "INSERT INTO sprints (id, roadmap_id, name, start_date, end_date, sort_order) VALUES (?, ?, ?, ?, ?, ?)"
      ).run(sid, roadmap_id, `Sprint ${i + 1}`, monthStarts[i][0], monthStarts[i][1], i);
    }

    // Map card integer indices to sprint IDs
    const cards = db.prepare(
      "SELECT id, start_sprint, duration_sprints FROM cards WHERE roadmap_id = ? AND start_sprint IS NOT NULL AND start_sprint_id IS NULL"
    ).all(roadmap_id);

    const updateStmt = db.prepare("UPDATE cards SET start_sprint_id = ?, end_sprint_id = ? WHERE id = ?");
    for (const card of cards) {
      const startIdx = card.start_sprint;
      const endIdx = Math.min(startIdx + (card.duration_sprints || 1) - 1, sprintDefs.length - 1);
      const startSprint = sprintDefs[Math.min(startIdx, sprintDefs.length - 1)];
      const endSprint = sprintDefs[endIdx];
      if (startSprint && endSprint) {
        updateStmt.run(startSprint.id, endSprint.id, card.id);
      }
    }
  }
})();

/* Add options column to custom_fields if it doesn't exist */
try {
  db.prepare("SELECT options FROM custom_fields LIMIT 1").get();
} catch {
  db.exec("ALTER TABLE custom_fields ADD COLUMN options TEXT");
}

/* Seed default workspace_settings for existing workspaces that don't have them */
(function seedWorkspaceSettings() {
  const workspaces = db.prepare(
    `SELECT w.id FROM workspaces w
     LEFT JOIN workspace_settings ws ON ws.workspace_id = w.id
     WHERE ws.workspace_id IS NULL`
  ).all();

  const insertStmt = db.prepare(
    "INSERT INTO workspace_settings (workspace_id) VALUES (?)"
  );

  for (const { id } of workspaces) {
    insertStmt.run(id);
  }
})();

module.exports = db;
