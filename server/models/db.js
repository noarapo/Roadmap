const Database = require("better-sqlite3");
const path = require("path");

const db = new Database(path.join(__dirname, "../data.db"));

db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS roadmaps (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    status TEXT DEFAULT 'draft',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS milestones (
    id TEXT PRIMARY KEY,
    roadmap_id TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    status TEXT DEFAULT 'pending',
    priority INTEGER DEFAULT 0,
    target_date TEXT,
    position INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (roadmap_id) REFERENCES roadmaps(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    milestone_id TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    status TEXT DEFAULT 'todo',
    category TEXT DEFAULT 'general',
    effort TEXT DEFAULT 'medium',
    assignee TEXT,
    position INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (milestone_id) REFERENCES milestones(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS agent_logs (
    id TEXT PRIMARY KEY,
    roadmap_id TEXT,
    action TEXT NOT NULL,
    input TEXT,
    output TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  );
`);

module.exports = db;
