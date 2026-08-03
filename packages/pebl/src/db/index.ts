import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { listProjectIds } from '../paths.js';
import { readEvents } from '../events/store.js';
import type { PeblEvent } from '../events/schema.js';

/**
 * Bump this whenever the derived schema or the replay logic changes shape.
 * ensureIndexUpToDate() rebuilds automatically on mismatch — the index is
 * always disposable and rebuildable from the JSONL event log, per
 * docs/02-engineering/event-model.md ("derived analytics can be rebuilt
 * from the event stream") and PRD OQ-1.
 */
export const SCHEMA_VERSION = 2;

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS schema_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS projects (
  project_id TEXT PRIMARY KEY,
  root_path TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  session_id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  project_id TEXT NOT NULL,
  started_at TEXT,
  ended_at TEXT
);

CREATE TABLE IF NOT EXISTS interactions (
  interaction_id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  correlation_id TEXT,
  prompt_text TEXT,
  meaningful INTEGER,
  classified_signals TEXT,
  started_at TEXT,
  ended_at TEXT
);

CREATE TABLE IF NOT EXISTS tool_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  interaction_id TEXT,
  session_id TEXT,
  tool_name TEXT,
  event_type TEXT NOT NULL,
  success INTEGER,
  duration_ms INTEGER,
  timestamp TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS files_touched (
  interaction_id TEXT NOT NULL,
  file_path TEXT NOT NULL,
  PRIMARY KEY (interaction_id, file_path)
);

CREATE TABLE IF NOT EXISTS commits (
  sha TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  interaction_id TEXT,
  matched_at TEXT,
  files TEXT
);

CREATE TABLE IF NOT EXISTS verification_checks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  commit_sha TEXT NOT NULL,
  checkpoint TEXT NOT NULL,
  status TEXT NOT NULL,
  ran_at TEXT NOT NULL,
  exit_code INTEGER,
  reason TEXT
);

CREATE INDEX IF NOT EXISTS idx_interactions_session ON interactions(session_id);
CREATE INDEX IF NOT EXISTS idx_tool_events_interaction ON tool_events(interaction_id);
CREATE INDEX IF NOT EXISTS idx_tool_events_session ON tool_events(session_id);
CREATE INDEX IF NOT EXISTS idx_commits_project ON commits(project_id);
CREATE INDEX IF NOT EXISTS idx_verification_checks_commit ON verification_checks(commit_sha);
`;

const TRUNCATE_SQL = `
DELETE FROM projects;
DELETE FROM sessions;
DELETE FROM interactions;
DELETE FROM tool_events;
DELETE FROM files_touched;
DELETE FROM commits;
DELETE FROM verification_checks;
`;

/** Opens (creating if needed) the local index database and ensures tables exist. */
export function openDb(path: string): Database.Database {
  mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.exec(SCHEMA_SQL);
  return db;
}

function getStoredSchemaVersion(db: Database.Database): number {
  const row = db.prepare('SELECT value FROM schema_meta WHERE key = ?').get('schema_version') as
    | { value: string }
    | undefined;
  return row ? Number(row.value) : 0;
}

function setStoredSchemaVersion(db: Database.Database, version: number): void {
  db.prepare(
    `INSERT INTO schema_meta (key, value) VALUES ('schema_version', ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  ).run(String(version));
}

/**
 * Checks the on-disk schema version against SCHEMA_VERSION and rebuilds
 * (truncate + full replay of every project's event log) if they differ.
 * Safe to call on every CLI invocation — a no-op when already current.
 */
export async function ensureIndexUpToDate(db: Database.Database): Promise<void> {
  if (getStoredSchemaVersion(db) === SCHEMA_VERSION) return;
  await rebuildIndex(db);
  setStoredSchemaVersion(db, SCHEMA_VERSION);
}

/** Explicit full rebuild, used by `pebl rebuild-index` and by version-mismatch recovery. */
export async function rebuildIndex(db: Database.Database): Promise<void> {
  db.exec(TRUNCATE_SQL);
  for (const projectId of listProjectIds()) {
    await replayProject(db, projectId);
  }
}

export interface ReplayStatements {
  insertProject: Database.Statement;
  insertSession: Database.Statement;
  touchSessionEnd: Database.Statement;
  insertToolEvent: Database.Statement;
}

export function prepareReplayStatements(db: Database.Database): ReplayStatements {
  return {
    insertProject: db.prepare(
      `INSERT INTO projects (project_id, root_path, updated_at) VALUES (@project_id, @root_path, @updated_at)
       ON CONFLICT(project_id) DO UPDATE SET root_path = excluded.root_path, updated_at = excluded.updated_at`,
    ),
    insertSession: db.prepare(
      `INSERT INTO sessions (session_id, source, project_id, started_at, ended_at)
       VALUES (@session_id, @source, @project_id, @started_at, @ended_at)
       ON CONFLICT(session_id) DO UPDATE SET ended_at = excluded.ended_at`,
    ),
    touchSessionEnd: db.prepare(`UPDATE sessions SET ended_at = ? WHERE session_id = ?`),
    insertToolEvent: db.prepare(
      `INSERT INTO tool_events (interaction_id, session_id, tool_name, event_type, success, duration_ms, timestamp)
       VALUES (@interaction_id, @session_id, @tool_name, @event_type, @success, @duration_ms, @timestamp)`,
    ),
  };
}

async function replayProject(db: Database.Database, projectId: string): Promise<void> {
  const stmts = prepareReplayStatements(db);

  // better-sqlite3 is synchronous; readEvents() is an async generator over
  // file I/O. We await each event and then perform a synchronous insert —
  // there is no concurrent writer to this project during a rebuild, so this
  // is safe without an explicit transaction per event. The whole replay
  // could be wrapped in db.transaction() for speed once real volumes matter;
  // deferred until Phase 5/9 profiling shows it's needed.
  for await (const event of readEvents(projectId)) {
    applyEvent(event, stmts);
  }
}

const TOOL_EVENT_TYPES = new Set(['PreToolUse', 'PostToolUse', 'PostToolUseFailure']);

export function applyEvent(event: PeblEvent, stmts: ReplayStatements): void {
  const cwd = event.payload.cwd;
  if (typeof cwd === 'string' && cwd.length > 0) {
    stmts.insertProject.run({
      project_id: event.project_id,
      root_path: cwd,
      updated_at: event.timestamp,
    });
  }

  if (event.event_type === 'SessionStart') {
    stmts.insertSession.run({
      session_id: event.session_id,
      source: event.source,
      project_id: event.project_id,
      started_at: event.timestamp,
      ended_at: null,
    });
    return;
  }

  if (event.event_type === 'SessionEnd' || event.event_type === 'Stop') {
    stmts.touchSessionEnd.run(event.timestamp, event.session_id);
  }

  if (TOOL_EVENT_TYPES.has(event.event_type)) {
    const toolName = event.payload.tool_name;
    const durationMs = event.payload.duration_ms;
    stmts.insertToolEvent.run({
      interaction_id: event.prompt_id ?? event.turn_id ?? null,
      session_id: event.session_id,
      tool_name: typeof toolName === 'string' ? toolName : null,
      event_type: event.event_type,
      success: event.event_type === 'PostToolUseFailure' ? 0 : 1,
      duration_ms: typeof durationMs === 'number' ? durationMs : null,
      timestamp: event.timestamp,
    });
  }

  // Interaction rows (prompt text, meaningful classification), files_touched,
  // and commits/verification_checks are populated by Phase 4's classifier and
  // Phase 5's Verification Join respectively, invoked from the hook
  // entrypoints (src/hooks/*-entrypoint.ts) rather than from this replay
  // loop — they depend on live filesystem/git state (test detection, commit
  // matching) that only makes sense to (re)compute at the moment a hook
  // actually fires, not when replaying historical events out of order.
}

/**
 * Incrementally indexes a single freshly-appended event without a full
 * rebuild — used by the hook entrypoints so every `pebl hook` invocation
 * stays cheap (one event, not a full log replay).
 */
export function indexSingleEvent(db: Database.Database, event: PeblEvent): void {
  applyEvent(event, prepareReplayStatements(db));
}

export function getProjectRootPath(db: Database.Database, projectId: string): string | undefined {
  const row = db.prepare('SELECT root_path FROM projects WHERE project_id = ?').get(projectId) as
    | { root_path: string }
    | undefined;
  return row?.root_path;
}
