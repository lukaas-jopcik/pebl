import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { assembleReceiptInput, findLatestSessionId } from '../src/receipt/assemble.js';
import { openDb, rebuildIndex } from '../src/db/index.js';
import { appendEvent } from '../src/events/store.js';
import { makeEvent } from './helpers/fixtures.js';
import { createTempGitRepo, type TempGitRepo } from './helpers/git-repo.js';
import { useTempPeblHome } from './helpers/tmp-home.js';

useTempPeblHome();

let db: Database.Database;
let repo: TempGitRepo;

beforeEach(() => {
  db = openDb(join(process.env.PEBL_HOME!, 'index.db'));
  repo = createTempGitRepo();
});

afterEach(() => {
  db.close();
  repo.cleanup();
});

describe('assembleReceiptInput', () => {
  it('assembles a full verified receipt input from a real session + real commit', async () => {
    const projectId = 'proj-assemble';
    const sessionId = 'sess-assemble-1';

    appendEvent(
      makeEvent({
        project_id: projectId,
        session_id: sessionId,
        event_type: 'SessionStart',
        timestamp: '2026-08-03T10:00:00.000Z',
        payload: { cwd: repo.dir },
      }),
    );
    appendEvent(
      makeEvent({
        project_id: projectId,
        session_id: sessionId,
        event_type: 'UserPromptSubmit',
        prompt_id: 'p1',
        timestamp: '2026-08-03T10:00:05.000Z',
        payload: { user_prompt: 'Add a constant to the module, verify with a test.' },
      }),
    );
    appendEvent(
      makeEvent({
        project_id: projectId,
        session_id: sessionId,
        event_type: 'PostToolUse',
        prompt_id: 'p1',
        timestamp: '2026-08-03T10:04:00.000Z',
        payload: { tool_input: { file_path: 'src/a.ts' }, duration_ms: 200 },
      }),
    );
    appendEvent(
      makeEvent({
        project_id: projectId,
        session_id: sessionId,
        event_type: 'SessionEnd',
        timestamp: '2026-08-03T10:05:00.000Z',
        payload: {},
      }),
    );

    writeFileSync(join(repo.dir, 'package.json'), JSON.stringify({ scripts: { test: 'node -e "process.exit(0)"' } }));
    const sha = repo.commit({ 'src/a.ts': 'export const x = 1;' }, { dateIso: '2026-08-03T10:04:30Z' });

    await rebuildIndex(db);
    const input = await assembleReceiptInput(db, projectId, repo.dir, sessionId);

    expect(input.intentText).toBe('Add a constant to the module, verify with a test.');
    expect(input.toolCallCount).toBe(1);
    expect(input.durationMs).toBe(5 * 60 * 1000);
    expect(input.frictionEvents).toEqual({ permissionDenials: 0, failedToolCalls: 0, retries: 0 });
    expect(input.verification).toEqual({ status: 'verified', commitSha: sha });
    expect(input.inSessionSignals).toContain('explicit_deliverable');

    // The verified commit must have been written through to the SQL index
    // so the opportunistic recheck scheduler can find it later.
    const row = db.prepare('SELECT sha FROM commits WHERE sha = ?').get(sha);
    expect(row).toBeDefined();
  });

  it('reports not_yet_verified with no fabricated commit when nothing matches', async () => {
    const projectId = 'proj-assemble-2';
    const sessionId = 'sess-assemble-2';

    appendEvent(
      makeEvent({
        project_id: projectId,
        session_id: sessionId,
        event_type: 'SessionStart',
        timestamp: '2026-08-03T10:00:00.000Z',
        payload: { cwd: repo.dir },
      }),
    );
    appendEvent(
      makeEvent({
        project_id: projectId,
        session_id: sessionId,
        event_type: 'SessionEnd',
        timestamp: '2026-08-03T10:05:00.000Z',
        payload: {},
      }),
    );

    await rebuildIndex(db);
    const input = await assembleReceiptInput(db, projectId, repo.dir, sessionId);

    expect(input.verification).toEqual({ status: 'not_yet_verified', reason: 'no_commit_detected' });
  });

  it('counts permission denials and failed tool calls as friction', async () => {
    const projectId = 'proj-friction';
    const sessionId = 'sess-friction';

    appendEvent(makeEvent({ project_id: projectId, session_id: sessionId, event_type: 'SessionStart' }));
    appendEvent(makeEvent({ project_id: projectId, session_id: sessionId, event_type: 'PermissionDenied' }));
    appendEvent(makeEvent({ project_id: projectId, session_id: sessionId, event_type: 'PostToolUseFailure' }));
    appendEvent(makeEvent({ project_id: projectId, session_id: sessionId, event_type: 'SessionEnd' }));

    await rebuildIndex(db);
    const input = await assembleReceiptInput(db, projectId, repo.dir, sessionId);

    expect(input.frictionEvents).toEqual({ permissionDenials: 1, failedToolCalls: 1, retries: 0 });
  });
});

describe('findLatestSessionId', () => {
  it('picks the most recently started session for the project', async () => {
    const projectId = 'proj-latest';
    appendEvent(
      makeEvent({
        project_id: projectId,
        session_id: 'older',
        event_type: 'SessionStart',
        timestamp: '2026-08-01T10:00:00.000Z',
      }),
    );
    appendEvent(
      makeEvent({
        project_id: projectId,
        session_id: 'newer',
        event_type: 'SessionStart',
        timestamp: '2026-08-02T10:00:00.000Z',
      }),
    );

    await rebuildIndex(db);
    expect(findLatestSessionId(db, projectId)).toBe('newer');
  });

  it('returns undefined for a project with no sessions', () => {
    expect(findLatestSessionId(db, 'never-seen')).toBeUndefined();
  });
});
