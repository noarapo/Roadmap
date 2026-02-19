const { Pool } = require("pg");

// Use DATABASE_URL for production (Render), fall back to local connection params for dev
const pool = process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
    })
  : new Pool({
      host: process.env.PGHOST || "localhost",
      port: parseInt(process.env.PGPORT || "5432", 10),
      database: process.env.PGDATABASE || "roadway",
      user: process.env.PGUSER || "postgres",
      password: process.env.PGPASSWORD || "postgres",
    });

async function query(text, params) {
  return pool.query(text, params);
}

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS workspaces (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT NOW(),
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
      is_admin BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT NOW(),
      last_login_at TIMESTAMP,
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
      sprint_capacity REAL,
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
      created_at TIMESTAMP DEFAULT NOW(),
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
      created_at TIMESTAMP DEFAULT NOW(),
      created_by TEXT,
      start_sprint_id TEXT,
      end_sprint_id TEXT,
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
      updated_at TIMESTAMP DEFAULT NOW(),
      FOREIGN KEY (lens_id) REFERENCES lenses(id) ON DELETE CASCADE,
      FOREIGN KEY (card_id) REFERENCES cards(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS snapshots (
      id TEXT PRIMARY KEY,
      roadmap_id TEXT NOT NULL,
      name TEXT NOT NULL,
      data TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      created_by TEXT,
      FOREIGN KEY (roadmap_id) REFERENCES roadmaps(id) ON DELETE CASCADE,
      FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS comments (
      id TEXT PRIMARY KEY,
      roadmap_id TEXT,
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
      created_at TIMESTAMP DEFAULT NOW(),
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
      created_at TIMESTAMP DEFAULT NOW(),
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
      created_at TIMESTAMP DEFAULT NOW(),
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
      overall_sprint_capacity REAL,
      FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS card_teams (
      id TEXT PRIMARY KEY,
      card_id TEXT NOT NULL,
      team_id TEXT NOT NULL,
      effort REAL DEFAULT 0,
      created_at TIMESTAMP DEFAULT NOW(),
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
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW(),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
      content TEXT NOT NULL,
      provider TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
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
      created_at TIMESTAMP DEFAULT NOW(),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
      FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS invites (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      workspace_id TEXT NOT NULL,
      token TEXT UNIQUE NOT NULL,
      invited_by TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      created_at TIMESTAMP DEFAULT NOW(),
      expires_at TIMESTAMP NOT NULL,
      FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
      FOREIGN KEY (invited_by) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS onboarding_responses (
      id TEXT PRIMARY KEY,
      user_id TEXT UNIQUE NOT NULL,
      company_size TEXT,
      company_nature TEXT,
      current_roadmap_tool TEXT,
      tracks_feature_requests TEXT,
      crm TEXT,
      dev_task_tool TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  // Migrations: add columns that may not exist on older databases
  const migrations = [
    "ALTER TABLE teams ADD COLUMN IF NOT EXISTS sprint_capacity REAL",
    "ALTER TABLE workspace_settings ADD COLUMN IF NOT EXISTS overall_sprint_capacity REAL",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN DEFAULT FALSE",
    // Mark all pre-existing users as onboarding-completed so they skip the survey
    "UPDATE users SET onboarding_completed = TRUE WHERE onboarding_completed = FALSE AND created_at < NOW() - INTERVAL '1 minute'",
  ];
  for (const sql of migrations) {
    try { await pool.query(sql); } catch { /* column may already exist */ }
  }

  // Auto-promote admin by email if configured
  const adminEmail = process.env.ADMIN_EMAIL;
  if (adminEmail) {
    await pool.query("UPDATE users SET is_admin = true WHERE email = $1 AND is_admin = false", [adminEmail]);
  }
}

module.exports = { query, initDb, pool };
