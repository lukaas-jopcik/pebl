import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runInitialVerification, runRecheck } from '../src/verification/join.js';
import { createTempGitRepo, type TempGitRepo } from './helpers/git-repo.js';

let repo: TempGitRepo;

beforeEach(() => {
  repo = createTempGitRepo();
});

afterEach(() => {
  repo.cleanup();
});

function writePackageJsonTestScript(dir: string, script: string): void {
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ scripts: { test: script } }), 'utf8');
}

describe('runInitialVerification (Verification Join, end to end)', () => {
  it('happy path: matching commit + passing test -> verified', async () => {
    writePackageJsonTestScript(repo.dir, 'node -e "process.exit(0)"');
    const sha = repo.commit(
      { 'src/a.ts': 'export const x = 1;' },
      { dateIso: '2026-08-03T10:05:00Z' },
    );

    const result = await runInitialVerification(
      repo.dir,
      new Set(['src/a.ts']),
      '2026-08-03T10:00:00Z',
      '2026-08-03T10:30:00Z',
    );

    expect(result).toEqual({ status: 'verified', commitSha: sha });
  });

  it('no commit found in window -> not_yet_verified / no_commit_detected', async () => {
    repo.commit({ 'src/unrelated.ts': 'v1' }, { dateIso: '2026-08-03T09:00:00Z' }); // outside window

    const result = await runInitialVerification(
      repo.dir,
      new Set(['src/a.ts']),
      '2026-08-03T10:00:00Z',
      '2026-08-03T10:30:00Z',
    );

    expect(result).toEqual({ status: 'not_yet_verified', reason: 'no_commit_detected' });
  });

  it('commit found but no test signal -> not_yet_verified / no_test_signal', async () => {
    const sha = repo.commit({ 'src/a.ts': 'v1' }, { dateIso: '2026-08-03T10:05:00Z' });

    const result = await runInitialVerification(
      repo.dir,
      new Set(['src/a.ts']),
      '2026-08-03T10:00:00Z',
      '2026-08-03T10:30:00Z',
    );

    expect(result).toEqual({ status: 'not_yet_verified', reason: 'no_test_signal', commitSha: sha });
  });

  it('commit found, test command exists but fails -> not_yet_verified / checks_failed', async () => {
    writePackageJsonTestScript(repo.dir, 'node -e "process.exit(1)"');
    const sha = repo.commit(
      { 'src/a.ts': 'export const x = 1;' },
      { dateIso: '2026-08-03T10:05:00Z' },
    );

    const result = await runInitialVerification(
      repo.dir,
      new Set(['src/a.ts']),
      '2026-08-03T10:00:00Z',
      '2026-08-03T10:30:00Z',
    );

    expect(result).toEqual({ status: 'not_yet_verified', reason: 'checks_failed', commitSha: sha });
  });

  it('empty touched-files set never matches anything -> no_commit_detected, not a false positive', async () => {
    repo.commit({ 'src/a.ts': 'v1' }, { dateIso: '2026-08-03T10:05:00Z' });

    const result = await runInitialVerification(
      repo.dir,
      new Set(),
      '2026-08-03T10:00:00Z',
      '2026-08-03T10:30:00Z',
    );

    expect(result).toEqual({ status: 'not_yet_verified', reason: 'no_commit_detected' });
  });
});

describe('runRecheck (revert detection after an initial verified result)', () => {
  it('stays verified when the commit is untouched since', async () => {
    writePackageJsonTestScript(repo.dir, 'node -e "process.exit(0)"');
    const sha = repo.commit(
      { 'src/a.ts': 'export const x = 1;' },
      { dateIso: '2026-08-03T10:05:00Z' },
    );

    const initial = await runInitialVerification(
      repo.dir,
      new Set(['src/a.ts']),
      '2026-08-03T10:00:00Z',
      '2026-08-03T10:30:00Z',
    );
    expect(initial.status).toBe('verified');

    const recheck = runRecheck(repo.dir, sha);
    expect(recheck).toEqual({ status: 'verified', commitSha: sha });
  });

  it('downgrades to verification_reversed when the commit was later git-reverted', async () => {
    writePackageJsonTestScript(repo.dir, 'node -e "process.exit(0)"');
    const sha = repo.commit(
      { 'src/a.ts': 'export const x = 1;' },
      { dateIso: '2026-08-03T10:05:00Z' },
    );

    const initial = await runInitialVerification(
      repo.dir,
      new Set(['src/a.ts']),
      '2026-08-03T10:00:00Z',
      '2026-08-03T10:30:00Z',
    );
    expect(initial.status).toBe('verified');

    execFileSync('git', ['-C', repo.dir, 'revert', '--no-edit', sha], { stdio: 'ignore' });

    const recheck = runRecheck(repo.dir, sha);
    expect(recheck).toEqual({
      status: 'verification_reversed',
      reason: 'commit_reverted_or_rewritten',
      commitSha: sha,
    });
  });
});
