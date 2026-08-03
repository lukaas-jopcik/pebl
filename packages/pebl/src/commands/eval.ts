import type { CliContext } from '../context.js';
import { assembleReceiptInput } from '../receipt/assemble.js';

export interface EvalOptions {
  sessionLimit: number;
}

function getRecentSessionIds(context: CliContext, limit: number): string[] {
  const rows = context.db
    .prepare(`SELECT session_id FROM sessions WHERE project_id = ? ORDER BY started_at DESC LIMIT ?`)
    .all(context.projectId, limit) as Array<{ session_id: string }>;
  return rows.map((r) => r.session_id);
}

/**
 * `pebl eval --sessions <n>` — internal, not a user-facing feature.
 * Supports SM-1 (PRD §9): replays the last N real sessions for this
 * project through the same Verification Join a receipt uses, and prints
 * a CSV for manual spot-check. Deliberately does NOT compute or claim a
 * precision number itself — "was this call actually right" requires a
 * human comparing it to what they know really happened; this command
 * only produces the raw material for that judgment (G2: never fabricate).
 */
export async function runEvalCommand(
  context: CliContext,
  options: EvalOptions,
  stdout: NodeJS.WritableStream = process.stdout,
): Promise<void> {
  const sessionIds = getRecentSessionIds(context, options.sessionLimit);
  if (sessionIds.length === 0) {
    stdout.write('pebl: no sessions recorded yet for this project — nothing to evaluate.\n');
    return;
  }

  stdout.write('session_id,status,reason,commit_sha\n');
  for (const sessionId of sessionIds) {
    const input = await assembleReceiptInput(context.db, context.projectId, context.cwd, sessionId);
    const { status, reason, commitSha } = input.verification;
    stdout.write(`${sessionId},${status},${reason ?? ''},${commitSha ?? ''}\n`);
  }

  stdout.write(
    `\npebl: wrote ${sessionIds.length} row(s). Spot-check each row against what you actually remember ` +
      `happening, then compute precision yourself: correct calls / ${sessionIds.length}. ` +
      `SM-1's target is >=80% — this command only produces the data, never the verdict.\n`,
  );
}
