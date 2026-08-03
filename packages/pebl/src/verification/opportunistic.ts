import type Database from 'better-sqlite3';
import { getProjectRootPath } from '../db/index.js';
import { runRecheck } from './join.js';
import { findDueChecks, recordCheck } from './schedule.js';

export interface RecheckRunSummary {
  checked: number;
  reversed: number;
  skippedNoRootPath: number;
}

/**
 * Runs every due (commit, checkpoint) pair in the index. Called two ways
 * (IMPL §2.6): opportunistically from every `pebl hook` invocation (this
 * module), and from the optional daily OS-scheduler entry via
 * `pebl recheck --due` (src/commands/recheck.ts) — same function either
 * way, no daemon.
 */
export function runDueRechecks(
  db: Database.Database,
  nowIso: string = new Date().toISOString(),
): RecheckRunSummary {
  const due = findDueChecks(db, nowIso);
  let reversed = 0;
  let skippedNoRootPath = 0;

  for (const item of due) {
    const rootPath = getProjectRootPath(db, item.projectId);
    if (!rootPath) {
      // No known filesystem path for this project yet — skip rather than
      // guess. It will be picked up once we see another event with a cwd.
      skippedNoRootPath += 1;
      continue;
    }

    const result = runRecheck(rootPath, item.commitSha);
    if (result.status === 'verification_reversed') reversed += 1;

    recordCheck(db, {
      commitSha: item.commitSha,
      checkpoint: item.checkpoint,
      status: result.status,
      ranAtIso: nowIso,
      ...(result.reason ? { reason: result.reason } : {}),
    });
  }

  return { checked: due.length, reversed, skippedNoRootPath };
}
