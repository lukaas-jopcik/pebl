import type Database from 'better-sqlite3';

export type Checkpoint = '24h' | '5d';

export interface DueCheck {
  commitSha: string;
  projectId: string;
  checkpoint: Checkpoint;
}

/** FR-10's two checkpoints, resolved in PRD §11/§12 OQ-2. */
const CHECKPOINT_OFFSETS_MS: Record<Checkpoint, number> = {
  '24h': 24 * 60 * 60 * 1000,
  '5d': 5 * 24 * 60 * 60 * 1000,
};

interface CommitRow {
  sha: string;
  project_id: string;
  matched_at: string;
}

/**
 * Finds every (commit, checkpoint) pair whose due time has passed and
 * which hasn't already been checked. No daemon runs this on a timer —
 * per IMPL §2.6 this is called opportunistically on every `pebl hook`
 * invocation for a project, and optionally once a day by an OS-native
 * scheduler entry (`pebl setup`'s opt-in cron/schtasks install, Phase 7).
 * A commit whose project is never touched again and that opts out of the
 * scheduler simply stays pending indefinitely — explicitly acceptable
 * (honest "pending" beats a fabricated or silently expired result).
 */
export function findDueChecks(db: Database.Database, nowIso: string): DueCheck[] {
  const now = new Date(nowIso).getTime();
  const commits = db.prepare('SELECT sha, project_id, matched_at FROM commits').all() as CommitRow[];

  const due: DueCheck[] = [];
  for (const commit of commits) {
    if (!commit.matched_at) continue;
    const matchedAt = new Date(commit.matched_at).getTime();

    for (const checkpoint of Object.keys(CHECKPOINT_OFFSETS_MS) as Checkpoint[]) {
      if (now < matchedAt + CHECKPOINT_OFFSETS_MS[checkpoint]) continue;

      const alreadyChecked = db
        .prepare('SELECT 1 FROM verification_checks WHERE commit_sha = ? AND checkpoint = ?')
        .get(commit.sha, checkpoint);
      if (!alreadyChecked) {
        due.push({ commitSha: commit.sha, projectId: commit.project_id, checkpoint });
      }
    }
  }
  return due;
}

export interface RecordCheckInput {
  commitSha: string;
  checkpoint: Checkpoint;
  status: string;
  ranAtIso: string;
  exitCode?: number;
  reason?: string;
}

/** Records that a checkpoint ran, so findDueChecks() never re-runs the same (commit, checkpoint) pair. */
export function recordCheck(db: Database.Database, input: RecordCheckInput): void {
  db.prepare(
    `INSERT INTO verification_checks (commit_sha, checkpoint, status, ran_at, exit_code, reason)
     VALUES (@commit_sha, @checkpoint, @status, @ran_at, @exit_code, @reason)`,
  ).run({
    commit_sha: input.commitSha,
    checkpoint: input.checkpoint,
    status: input.status,
    ran_at: input.ranAtIso,
    exit_code: input.exitCode ?? null,
    reason: input.reason ?? null,
  });
}
