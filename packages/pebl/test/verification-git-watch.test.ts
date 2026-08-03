import { execSync } from 'node:child_process';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { computeMatchWindowEnd, findMatchingCommit } from '../src/verification/git-watch.js';
import { createTempGitRepo, type TempGitRepo } from './helpers/git-repo.js';

describe('computeMatchWindowEnd', () => {
  it('defaults to 30 minutes after the reference timestamp when there is no next session', () => {
    const end = computeMatchWindowEnd('2026-08-03T10:00:00.000Z');
    expect(end).toBe('2026-08-03T10:30:00.000Z');
  });

  it('closes early when the next session starts before the 30-minute idle deadline', () => {
    const end = computeMatchWindowEnd('2026-08-03T10:00:00.000Z', '2026-08-03T10:10:00.000Z');
    expect(end).toBe('2026-08-03T10:10:00.000Z');
  });

  it('ignores a next-session timestamp that is later than the idle deadline', () => {
    const end = computeMatchWindowEnd('2026-08-03T10:00:00.000Z', '2026-08-03T14:00:00.000Z');
    expect(end).toBe('2026-08-03T10:30:00.000Z');
  });
});

describe('findMatchingCommit', () => {
  let repo: TempGitRepo;

  beforeEach(() => {
    repo = createTempGitRepo();
  });

  afterEach(() => {
    repo.cleanup();
  });

  it('finds a commit within the window that touches an overlapping file', () => {
    repo.commit({ 'src/a.ts': 'v1' }, { dateIso: '2026-08-03T10:05:00Z' });

    const match = findMatchingCommit(
      repo.dir,
      '2026-08-03T10:00:00Z',
      '2026-08-03T10:30:00Z',
      new Set(['src/a.ts']),
    );

    expect(match?.files).toEqual(['src/a.ts']);
  });

  it('returns undefined when the only commit in range touches unrelated files', () => {
    repo.commit({ 'src/unrelated.ts': 'v1' }, { dateIso: '2026-08-03T10:05:00Z' });

    const match = findMatchingCommit(
      repo.dir,
      '2026-08-03T10:00:00Z',
      '2026-08-03T10:30:00Z',
      new Set(['src/a.ts']),
    );

    expect(match).toBeUndefined();
  });

  it('ignores a matching commit that falls outside the time window', () => {
    repo.commit({ 'src/a.ts': 'v1' }, { dateIso: '2026-08-03T09:00:00Z' }); // before the window

    const match = findMatchingCommit(
      repo.dir,
      '2026-08-03T10:00:00Z',
      '2026-08-03T10:30:00Z',
      new Set(['src/a.ts']),
    );

    expect(match).toBeUndefined();
  });

  it('picks the earliest matching commit when several are in range', () => {
    repo.commit({ 'src/a.ts': 'v1' }, { dateIso: '2026-08-03T10:05:00Z', message: 'first' });
    repo.commit({ 'src/a.ts': 'v2' }, { dateIso: '2026-08-03T10:15:00Z', message: 'second' });

    const match = findMatchingCommit(
      repo.dir,
      '2026-08-03T10:00:00Z',
      '2026-08-03T10:30:00Z',
      new Set(['src/a.ts']),
    );

    // Verify it's genuinely the earlier commit, not just any match.
    const log = execSync(`git -C ${repo.dir} log --pretty=format:%H`, { encoding: 'utf8' })
      .trim()
      .split('\n');
    expect(match?.sha).toBe(log[log.length - 1]);
  });

  it('returns undefined immediately for an empty touched-files set, without matching everything', () => {
    repo.commit({ 'src/a.ts': 'v1' }, { dateIso: '2026-08-03T10:05:00Z' });

    const match = findMatchingCommit(repo.dir, '2026-08-03T10:00:00Z', '2026-08-03T10:30:00Z', new Set());
    expect(match).toBeUndefined();
  });

  it('returns undefined (never throws) for a directory that is not a git repo', () => {
    const match = findMatchingCommit('/tmp', '2026-08-03T10:00:00Z', '2026-08-03T10:30:00Z', new Set(['a.ts']));
    expect(match).toBeUndefined();
  });
});
