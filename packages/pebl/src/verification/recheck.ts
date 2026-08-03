import { execFileSync } from 'node:child_process';

export type RevertCheckResult = 'still_present' | 'reverted';

function isCommitReachableFromHead(projectRoot: string, sha: string): boolean {
  try {
    execFileSync('git', ['-C', projectRoot, 'merge-base', '--is-ancestor', sha, 'HEAD'], {
      stdio: 'ignore',
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Detects the common, well-defined case: a later commit created by
 * `git revert`, whose message contains git's own auto-generated
 * "This reverts commit <sha>." line. A manual revert (hand-editing the
 * file back) without using `git revert` will not be caught — that's a
 * known, documented limitation, not a silent gap: absence of detected
 * reversal correctly falls through to "still_present" rather than
 * fabricating certainty either way (G2).
 */
function hasExplicitRevertCommit(projectRoot: string, sha: string): boolean {
  try {
    const output = execFileSync(
      'git',
      ['-C', projectRoot, 'log', `--grep=This reverts commit ${sha}`, '--oneline'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
    );
    return output.trim().length > 0;
  } catch {
    return false;
  }
}

/**
 * FR-10's revert check: a commit counts as reverted if it's no longer
 * reachable from HEAD (reset, rebased away, or force-pushed over) or if a
 * later commit explicitly reverts it via `git revert`.
 */
export function checkForRevert(projectRoot: string, sha: string): RevertCheckResult {
  if (!isCommitReachableFromHead(projectRoot, sha)) return 'reverted';
  if (hasExplicitRevertCommit(projectRoot, sha)) return 'reverted';
  return 'still_present';
}
