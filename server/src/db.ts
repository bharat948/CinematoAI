import Database from "better-sqlite3";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_PATH = path.join(__dirname, "..", "neurohood.db");

export function openDb(dbPath: string = DEFAULT_PATH): Database.Database {
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  migrate(db);
  return db;
}

function migrate(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id            TEXT PRIMARY KEY,
      idea          TEXT NOT NULL,
      options       TEXT NOT NULL DEFAULT '{}',
      stage         TEXT NOT NULL DEFAULT 'story_interview',
      budget_usd    REAL NOT NULL DEFAULT 25,
      spend_usd     REAL NOT NULL DEFAULT 0,
      gates         TEXT NOT NULL DEFAULT '{"story":"pending","treatment":"pending","lookbook":"pending"}',
      created_at    TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS interview_messages (
      id            TEXT PRIMARY KEY,
      project_id    TEXT NOT NULL REFERENCES projects(id),
      role          TEXT NOT NULL CHECK(role IN ('agent','user')),
      content       TEXT NOT NULL,
      round         INTEGER NOT NULL,
      created_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_messages_project
      ON interview_messages(project_id, created_at);

    CREATE TABLE IF NOT EXISTS story_bibles (
      id            TEXT PRIMARY KEY,
      project_id    TEXT NOT NULL REFERENCES projects(id),
      version       INTEGER NOT NULL DEFAULT 1,
      author        TEXT NOT NULL DEFAULT 'story_agent',
      logline       TEXT NOT NULL DEFAULT '',
      synopsis      TEXT NOT NULL DEFAULT '',
      themes        TEXT NOT NULL DEFAULT '[]',
      world_rules   TEXT NOT NULL DEFAULT '',
      characters    TEXT NOT NULL DEFAULT '[]',
      beat_sheet    TEXT NOT NULL DEFAULT '[]',
      scenes        TEXT NOT NULL DEFAULT '[]',
      created_at    TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(project_id, version)
    );

    CREATE TABLE IF NOT EXISTS treatments (
      id              TEXT PRIMARY KEY,
      project_id      TEXT NOT NULL REFERENCES projects(id),
      version         INTEGER NOT NULL DEFAULT 1,
      tone_words      TEXT NOT NULL DEFAULT '[]',
      themes          TEXT NOT NULL DEFAULT '[]',
      visual_grammar  TEXT NOT NULL DEFAULT '{}',
      sonic_palette   TEXT NOT NULL DEFAULT '',
      do_list         TEXT NOT NULL DEFAULT '[]',
      dont_list       TEXT NOT NULL DEFAULT '[]',
      look_tests      TEXT NOT NULL DEFAULT '[]',
      sound_sketch    TEXT NOT NULL DEFAULT '{}',
      readings        TEXT NOT NULL DEFAULT '[]',
      created_at      TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(project_id, version)
    );

    CREATE TABLE IF NOT EXISTS reading_selections (
      id              TEXT PRIMARY KEY,
      project_id      TEXT NOT NULL REFERENCES projects(id),
      treatment_id    TEXT NOT NULL REFERENCES treatments(id),
      reading_key     TEXT NOT NULL,
      decided_by      TEXT NOT NULL DEFAULT 'filmmaker',
      created_at      TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(project_id, treatment_id)
    );

    CREATE TABLE IF NOT EXISTS shots (
      id              TEXT PRIMARY KEY,
      project_id      TEXT NOT NULL REFERENCES projects(id),
      panel_number    INTEGER NOT NULL,
      version         INTEGER NOT NULL DEFAULT 1,
      description     TEXT NOT NULL DEFAULT '',
      camera          TEXT NOT NULL DEFAULT '',
      mood            TEXT NOT NULL DEFAULT '',
      caption         TEXT NOT NULL DEFAULT '',
      duration_frames INTEGER NOT NULL DEFAULT 72,
      created_at      TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS cuts (
      id              TEXT PRIMARY KEY,
      project_id      TEXT NOT NULL REFERENCES projects(id),
      reading_key     TEXT NOT NULL,
      version         INTEGER NOT NULL DEFAULT 1,
      fps             INTEGER NOT NULL DEFAULT 24,
      edl             TEXT NOT NULL DEFAULT '[]',
      cues            TEXT NOT NULL DEFAULT '[]',
      is_current      INTEGER NOT NULL DEFAULT 1,
      created_at      TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(project_id, reading_key, version)
    );

    CREATE TABLE IF NOT EXISTS timed_notes (
      id              TEXT PRIMARY KEY,
      project_id      TEXT NOT NULL REFERENCES projects(id),
      cut_id          TEXT NOT NULL REFERENCES cuts(id),
      shot_id         TEXT NOT NULL REFERENCES shots(id),
      tc_in           TEXT NOT NULL,
      tc_out          TEXT NOT NULL,
      observation     TEXT NOT NULL DEFAULT '',
      intended        TEXT NOT NULL DEFAULT '',
      gap             TEXT NOT NULL DEFAULT '',
      owner_agent     TEXT NOT NULL DEFAULT '',
      experiment      TEXT NOT NULL DEFAULT '',
      priority        TEXT NOT NULL DEFAULT 'medium',
      status          TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','closed')),
      created_at      TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS shot_flags (
      id              TEXT PRIMARY KEY,
      project_id      TEXT NOT NULL REFERENCES projects(id),
      cut_id          TEXT NOT NULL REFERENCES cuts(id),
      shot_id         TEXT NOT NULL REFERENCES shots(id),
      reason          TEXT NOT NULL DEFAULT 'neighbour_changed',
      source_shot_id  TEXT NOT NULL,
      resolved        INTEGER NOT NULL DEFAULT 0,
      created_at      TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS jobs (
      id              TEXT PRIMARY KEY,
      project_id      TEXT NOT NULL REFERENCES projects(id),
      agent           TEXT NOT NULL,
      medium          TEXT NOT NULL DEFAULT 'image',
      prompt          TEXT NOT NULL DEFAULT '',
      status          TEXT NOT NULL DEFAULT 'pending'
                      CHECK(status IN ('pending','reserved','running','completed','failed','paused_budget','escalated')),
      steps           TEXT NOT NULL DEFAULT '[]',
      current_step    INTEGER NOT NULL DEFAULT 0,
      cost_estimate   REAL NOT NULL DEFAULT 0,
      actual_cost     REAL NOT NULL DEFAULT 0,
      provider_used   TEXT NOT NULL DEFAULT '',
      retries         INTEGER NOT NULL DEFAULT 0,
      max_retries     INTEGER NOT NULL DEFAULT 3,
      error           TEXT NOT NULL DEFAULT '',
      created_at      TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_jobs_project
      ON jobs(project_id, status);

    CREATE TABLE IF NOT EXISTS budget_reservations (
      id              TEXT PRIMARY KEY,
      project_id      TEXT NOT NULL REFERENCES projects(id),
      job_id          TEXT NOT NULL REFERENCES jobs(id),
      amount_usd      REAL NOT NULL,
      status          TEXT NOT NULL DEFAULT 'held'
                      CHECK(status IN ('held','spent','released')),
      created_at      TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_reservations_project
      ON budget_reservations(project_id, status);

    CREATE TABLE IF NOT EXISTS gate_decisions (
      id            TEXT PRIMARY KEY,
      project_id    TEXT NOT NULL REFERENCES projects(id),
      gate          TEXT NOT NULL,
      decision      TEXT NOT NULL CHECK(decision IN ('approved','sent_back')),
      notes         TEXT NOT NULL DEFAULT '',
      bible_version INTEGER,
      decided_by    TEXT NOT NULL DEFAULT 'filmmaker',
      created_at    TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(project_id, gate, decision, bible_version)
    );
  `);
}
