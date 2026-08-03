import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import type Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDb } from '../src/db/index.js';
import { runDueRechecks } from '../src/verification/opportunistic.js';
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

function insertProject(projectId: string, rootPath: string): void {
  db.prepare(
    `INSERT INTO projects (project_id, root_path, updated_at) VALUES (?, ?, ?)`,
  ).run(projectId, rootPath, new Date().toISOString());
}

function insertCommit(sha: string, projectId: string, matchedAtIso: string): void {
  db.prepare(
    `INSERT INTO commits (sha, project_id, interaction_id, matched_at, files) VALUES (?, ?, NULL, ?, '[]')`,
  ).run(sha, projectId, matchedAtIso);
}

describe('runDueRechecks', () => {
  it('records a "still present" recheck as verified for a commit that was never touched again', () => {
    const sha = repo.commit({ 'a.txt': 'v1' });
    insertProject('proj-1', repo.dir);
    insertCommit(sha, 'proj-1', '2026-08-01T10:00:00.000Z');

    const summary = runDueRechecks(db, '2026-08-02T10:00:01.000Z');
    expect(summary).toEqual({ checked: 1, reversed: 0, skippedNoRootPath: 0 });

    const row = db.prepare('SELECT status FROM verification_checks WHERE commit_sha = ?').get(sha) as
      | { status: string }
      | undefined;
    expect(row?.status).toBe('verified');
  });

  it('records a reversed recheck and counts it when the commit was git-reverted', () => {
    const sha = repo.commit({ 'a.txt': 'v1' });
    execFileSync('git', ['-C', repo.dir, 'revert', '--no-edit', sha], { stdio: 'ignore' });
    insertProject('proj-1', repo.dir);
    insertCommit(sha, 'proj-1', '2026-08-01T10:00:00.000Z');

    const summary = runDueRechecks(db, '2026-08-02T10:00:01.000Z');
    expect(summary).toEqual({ checked: 1, reversed: 1, skippedNoRootPath: 0 });
  });

  it('skips (never guesses) a due commit whose project root path is unknown', () => {
    insertCommit('unknownsha', 'proj-unknown', '2026-08-01T10:00:00.000Z');

    const summary = runDueRechecks(db, '2026-08-02T10:00:01.000Z');
    expect(summary).toEqual({ checked: 1, reversed: 0, skippedNoRootPath: 1 });

    const row = db.prepare('SELECT status FROM verification_checks WHERE commit_sha = ?').get('unknownsha');
    expect(row).toBeUndefined();
  });

  it('never re-runs the same checkpoint twice', () => {
    const sha = repo.commit({ 'a.txt': 'v1' });
    insertProject('proj-1', repo.dir);
    insertCommit(sha, 'proj-1', '2026-08-01T10:00:00.000Z');

    runDueRechecks(db, '2026-08-02T10:00:01.000Z');
    const second = runDueRechecks(db, '2026-08-02T10:00:02.000Z');
    expect(second.checked).toBe(0);
  });
});
