import type Database from 'better-sqlite3';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDb } from '../src/db/index.js';
import { findDueChecks, recordCheck } from '../src/verification/schedule.js';
import { useTempPeblHome } from './helpers/tmp-home.js';

useTempPeblHome();

let db: Database.Database;

beforeEach(() => {
  db = openDb(join(process.env.PEBL_HOME!, 'index.db'));
});

afterEach(() => {
  db.close();
});

function insertCommit(sha: string, projectId: string, matchedAtIso: string): void {
  db.prepare(
    `INSERT INTO commits (sha, project_id, interaction_id, matched_at, files) VALUES (?, ?, NULL, ?, '[]')`,
  ).run(sha, projectId, matchedAtIso);
}

describe('findDueChecks', () => {
  it('finds a 24h checkpoint once 24 hours have passed and not before', () => {
    insertCommit('sha1', 'proj-1', '2026-08-01T10:00:00.000Z');

    const before = findDueChecks(db, '2026-08-02T09:59:00.000Z');
    expect(before).toEqual([]);

    const after = findDueChecks(db, '2026-08-02T10:00:01.000Z');
    expect(after).toEqual([{ commitSha: 'sha1', projectId: 'proj-1', checkpoint: '24h' }]);
  });

  it('surfaces both 24h and 5d checkpoints once both are due', () => {
    insertCommit('sha1', 'proj-1', '2026-08-01T10:00:00.000Z');

    const due = findDueChecks(db, '2026-08-10T00:00:00.000Z');
    expect(due.sort((a, b) => a.checkpoint.localeCompare(b.checkpoint))).toEqual([
      { commitSha: 'sha1', projectId: 'proj-1', checkpoint: '24h' },
      { commitSha: 'sha1', projectId: 'proj-1', checkpoint: '5d' },
    ]);
  });

  it('never returns a checkpoint that has already been recorded', () => {
    insertCommit('sha1', 'proj-1', '2026-08-01T10:00:00.000Z');
    recordCheck(db, {
      commitSha: 'sha1',
      checkpoint: '24h',
      status: 'verified',
      ranAtIso: '2026-08-02T10:00:00.000Z',
    });

    const due = findDueChecks(db, '2026-08-10T00:00:00.000Z');
    expect(due).toEqual([{ commitSha: 'sha1', projectId: 'proj-1', checkpoint: '5d' }]);
  });

  it('returns nothing for a project with no commits yet', () => {
    expect(findDueChecks(db, '2026-08-10T00:00:00.000Z')).toEqual([]);
  });
});
