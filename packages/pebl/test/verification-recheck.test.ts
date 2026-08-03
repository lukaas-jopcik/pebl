import { execFileSync } from 'node:child_process';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { checkForRevert } from '../src/verification/recheck.js';
import { createTempGitRepo, type TempGitRepo } from './helpers/git-repo.js';

let repo: TempGitRepo;

beforeEach(() => {
  repo = createTempGitRepo();
});

afterEach(() => {
  repo.cleanup();
});

describe('checkForRevert', () => {
  it('reports "still_present" for a commit still reachable from HEAD with no revert commit', () => {
    const sha = repo.commit({ 'a.txt': 'v1' });
    repo.commit({ 'b.txt': 'unrelated' });

    expect(checkForRevert(repo.dir, sha)).toBe('still_present');
  });

  it('reports "reverted" when a later commit was made with `git revert`', () => {
    const sha = repo.commit({ 'a.txt': 'v1' });
    execFileSync('git', ['-C', repo.dir, 'revert', '--no-edit', sha], { stdio: 'ignore' });

    expect(checkForRevert(repo.dir, sha)).toBe('reverted');
  });

  it('reports "reverted" when the commit is no longer reachable from HEAD (history rewritten)', () => {
    const firstSha = repo.commit({ 'a.txt': 'v1' });
    repo.commit({ 'a.txt': 'v2' });

    // Simulate a rebase/force-push that dropped firstSha: check out a fresh
    // orphan branch (no shared history) and make it the new HEAD.
    execFileSync('git', ['-C', repo.dir, 'checkout', '--orphan', 'rewritten-history'], {
      stdio: 'ignore',
    });
    repo.commit({ 'a.txt': 'rewritten from scratch' });

    expect(checkForRevert(repo.dir, firstSha)).toBe('reverted');
  });
});
