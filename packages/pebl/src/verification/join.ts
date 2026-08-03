import { findMatchingCommit } from './git-watch.js';
import { resolveTestCommand } from './test-detect.js';
import { runCheck } from './run-check.js';
import { checkForRevert } from './recheck.js';

export type VerificationStatus = 'not_yet_verified' | 'verified' | 'verification_reversed';

/**
 * Every non-'verified' status always carries a specific reason (FR-11) —
 * this union is exhaustive on purpose so a caller can never end up with
 * an unexplained not-verified result.
 */
export type VerificationReason =
  | 'no_commit_detected'
  | 'no_test_signal'
  | 'checks_failed'
  | 'commit_reverted_or_rewritten';

export interface VerificationResult {
  status: VerificationStatus;
  reason?: VerificationReason;
  commitSha?: string;
}

/**
 * The Verification Join's initial pass (FR-7–FR-9): find the matching
 * commit, resolve a test command, run it, and derive a status. This is
 * the one component in the whole wedge that doesn't exist anywhere else
 * (PRD §11) — everything it calls (git-watch, test-detect, run-check) is
 * plumbing; this function is the actual claim.
 */
export async function runInitialVerification(
  projectRoot: string,
  touchedFiles: ReadonlySet<string>,
  sinceIso: string,
  untilIso: string,
): Promise<VerificationResult> {
  const commit = findMatchingCommit(projectRoot, sinceIso, untilIso, touchedFiles);
  if (!commit) {
    return { status: 'not_yet_verified', reason: 'no_commit_detected' };
  }

  const testResolution = resolveTestCommand(projectRoot);
  if (!testResolution.command) {
    return { status: 'not_yet_verified', reason: 'no_test_signal', commitSha: commit.sha };
  }

  const checkResult = await runCheck(testResolution.command, projectRoot);
  if (checkResult.exitCode !== 0) {
    return { status: 'not_yet_verified', reason: 'checks_failed', commitSha: commit.sha };
  }

  return { status: 'verified', commitSha: commit.sha };
}

/**
 * FR-10's 24h/5d recheck: re-derives status for a previously verified
 * commit. A verified receipt can only move to 'verification_reversed',
 * never silently back to 'not_yet_verified' — once real evidence existed,
 * losing that evidence later is itself evidence (of a revert), not an
 * absence of information.
 */
export function runRecheck(projectRoot: string, commitSha: string): VerificationResult {
  const revertStatus = checkForRevert(projectRoot, commitSha);
  if (revertStatus === 'reverted') {
    return { status: 'verification_reversed', reason: 'commit_reverted_or_rewritten', commitSha };
  }
  return { status: 'verified', commitSha };
}
