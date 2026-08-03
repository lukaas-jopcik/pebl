import { execFileSync } from 'node:child_process';

/** FR-8 resolved windows (PRD §11/§12 OQ-2). */
const IDLE_WINDOW_MS = 30 * 60 * 1000;
const HARD_CAP_MS = 2 * 60 * 60 * 1000;

/**
 * The matching window closes at whichever comes first: 30 minutes after
 * `referenceIso` (the session-end timestamp, or last-known-activity
 * timestamp if SessionEnd never fired), the next session's start for the
 * same project, or a hard 2-hour cap from the same reference point — the
 * cap exists specifically so a missing SessionEnd / missing next session
 * can't leave the window open indefinitely.
 */
export function computeMatchWindowEnd(referenceIso: string, nextSessionStartIso?: string): string {
  const reference = new Date(referenceIso).getTime();
  const candidates = [reference + IDLE_WINDOW_MS, reference + HARD_CAP_MS];
  if (nextSessionStartIso) candidates.push(new Date(nextSessionStartIso).getTime());
  return new Date(Math.min(...candidates)).toISOString();
}

export interface MatchedCommit {
  sha: string;
  timestamp: string;
  files: string[];
}

/**
 * Runs `git log` over [sinceIso, untilIso] in chronological order and
 * parses each commit's hash, author date, and changed files. Uses NUL/unit-
 * separator control characters as field delimiters so commit messages
 * containing arbitrary text can never corrupt parsing.
 */
function runGitLog(projectRoot: string, sinceIso: string, untilIso: string): MatchedCommit[] {
  let output: string;
  try {
    output = execFileSync(
      'git',
      [
        '-C',
        projectRoot,
        'log',
        `--since=${sinceIso}`,
        `--until=${untilIso}`,
        '--reverse',
        '--name-only',
        '--pretty=format:%x00%H%x1f%aI',
      ],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
    );
  } catch {
    // Not a git repo, git not installed, or an empty/invalid range — all
    // treated the same way: no commits found, never an error surfaced up
    // to the receipt (which will correctly report "not yet verified").
    return [];
  }

  const commits: MatchedCommit[] = [];
  for (const chunk of output.split('\x00')) {
    if (chunk.trim().length === 0) continue;
    const lines = chunk.split('\n');
    const header = lines[0] ?? '';
    const [sha, timestamp] = header.split('\x1f');
    if (!sha || !timestamp) continue;
    const files = lines
      .slice(1)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    commits.push({ sha, timestamp, files });
  }
  return commits;
}

/**
 * Finds the earliest commit in the window whose changed files overlap the
 * touched-files set (FR-8). Returns undefined — never a guess — when
 * there's nothing to match against or nothing found.
 */
export function findMatchingCommit(
  projectRoot: string,
  sinceIso: string,
  untilIso: string,
  touchedFiles: ReadonlySet<string>,
): MatchedCommit | undefined {
  if (touchedFiles.size === 0) return undefined;
  for (const commit of runGitLog(projectRoot, sinceIso, untilIso)) {
    if (commit.files.some((file) => touchedFiles.has(file))) return commit;
  }
  return undefined;
}

/** Re-exported for callers that want the raw commit list without file-set matching (e.g. revert checks later). */
export { runGitLog as listCommitsInRange };
