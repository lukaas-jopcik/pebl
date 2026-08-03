import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type Database from 'better-sqlite3';
import {
  ensureIndexUpToDate,
  getProjectRootPath,
  indexSingleEvent,
  openDb,
  rebuildIndex,
  SCHEMA_VERSION,
} from '../src/db/index.js';
import { appendEvent } from '../src/events/store.js';
import { makeEvent } from './helpers/fixtures.js';
import { useTempPeblHome } from './helpers/tmp-home.js';

useTempPeblHome();

let db: Database.Database;

beforeEach(() => {
  db = openDb(join(process.env.PEBL_HOME!, 'index.db'));
});

afterEach(() => {
  db.close();
});

describe('index rebuild', () => {
  it('derives a session row from SessionStart and SessionEnd', async () => {
    const projectId = 'proj-sessions';
    appendEvent(
      makeEvent({
        project_id: projectId,
        session_id: 'sess-1',
        event_type: 'SessionStart',
        timestamp: '2026-08-03T10:00:00.000Z',
      }),
    );
    appendEvent(
      makeEvent({
        project_id: projectId,
        session_id: 'sess-1',
        event_type: 'SessionEnd',
        timestamp: '2026-08-03T10:10:00.000Z',
      }),
    );

    await rebuildIndex(db);

    const row = db.prepare('SELECT * FROM sessions WHERE session_id = ?').get('sess-1') as
      | { started_at: string; ended_at: string }
      | undefined;
    expect(row?.started_at).toBe('2026-08-03T10:00:00.000Z');
    expect(row?.ended_at).toBe('2026-08-03T10:10:00.000Z');
  });

  it('records tool events keyed by correlation id', async () => {
    const projectId = 'proj-tools';
    appendEvent(
      makeEvent({
        project_id: projectId,
        session_id: 'sess-2',
        prompt_id: 'prompt-1',
        event_type: 'PostToolUse',
        payload: { tool_name: 'Edit', duration_ms: 120 },
      }),
    );
    appendEvent(
      makeEvent({
        project_id: projectId,
        session_id: 'sess-2',
        prompt_id: 'prompt-1',
        event_type: 'PostToolUseFailure',
        payload: { tool_name: 'Bash', duration_ms: 40 },
      }),
    );

    await rebuildIndex(db);

    const rows = db
      .prepare('SELECT tool_name, event_type, success, duration_ms FROM tool_events ORDER BY id')
      .all();
    expect(rows).toEqual([
      { tool_name: 'Edit', event_type: 'PostToolUse', success: 1, duration_ms: 120 },
      { tool_name: 'Bash', event_type: 'PostToolUseFailure', success: 0, duration_ms: 40 },
    ]);
  });

  it('is idempotent: rebuilding twice produces the same rows', async () => {
    const projectId = 'proj-idempotent';
    appendEvent(
      makeEvent({ project_id: projectId, session_id: 'sess-3', event_type: 'SessionStart' }),
    );

    await rebuildIndex(db);
    const firstCount = db.prepare('SELECT COUNT(*) AS n FROM sessions').get() as { n: number };

    await rebuildIndex(db);
    const secondCount = db.prepare('SELECT COUNT(*) AS n FROM sessions').get() as { n: number };

    expect(firstCount.n).toBe(1);
    expect(secondCount.n).toBe(1);
  });

  it('ensureIndexUpToDate rebuilds once on a fresh database and is a no-op after', async () => {
    const projectId = 'proj-version';
    appendEvent(
      makeEvent({ project_id: projectId, session_id: 'sess-4', event_type: 'SessionStart' }),
    );

    await ensureIndexUpToDate(db);
    const afterFirst = db.prepare('SELECT COUNT(*) AS n FROM sessions').get() as { n: number };
    expect(afterFirst.n).toBe(1);

    const version = db
      .prepare('SELECT value FROM schema_meta WHERE key = ?')
      .get('schema_version') as { value: string };
    expect(Number(version.value)).toBe(SCHEMA_VERSION);

    // Add a new event directly to the log without going through the index;
    // a no-op ensureIndexUpToDate call must NOT pick it up, proving it
    // didn't silently rebuild again.
    appendEvent(
      makeEvent({ project_id: projectId, session_id: 'sess-5', event_type: 'SessionStart' }),
    );
    await ensureIndexUpToDate(db);
    const afterSecond = db.prepare('SELECT COUNT(*) AS n FROM sessions').get() as { n: number };
    expect(afterSecond.n).toBe(1);
  });

  it('records the project root path from any event carrying a cwd field', async () => {
    appendEvent(
      makeEvent({
        project_id: 'proj-cwd',
        session_id: 'sess-6',
        event_type: 'SessionStart',
        payload: { cwd: '/tmp/some-project' },
      }),
    );

    await rebuildIndex(db);
    expect(getProjectRootPath(db, 'proj-cwd')).toBe('/tmp/some-project');
  });

  it('updates the recorded root path when a later event reports a different cwd', async () => {
    appendEvent(
      makeEvent({ project_id: 'proj-moved', session_id: 'sess-7', payload: { cwd: '/old/path' } }),
    );
    appendEvent(
      makeEvent({ project_id: 'proj-moved', session_id: 'sess-7', payload: { cwd: '/new/path' } }),
    );

    await rebuildIndex(db);
    expect(getProjectRootPath(db, 'proj-moved')).toBe('/new/path');
  });
});

describe('indexSingleEvent', () => {
  it('incrementally indexes one event without requiring a full rebuild', () => {
    indexSingleEvent(
      db,
      makeEvent({
        project_id: 'proj-incremental',
        session_id: 'sess-8',
        event_type: 'SessionStart',
        payload: { cwd: '/tmp/incremental-project' },
      }),
    );

    const session = db.prepare('SELECT * FROM sessions WHERE session_id = ?').get('sess-8');
    expect(session).toBeDefined();
    expect(getProjectRootPath(db, 'proj-incremental')).toBe('/tmp/incremental-project');
  });
});
