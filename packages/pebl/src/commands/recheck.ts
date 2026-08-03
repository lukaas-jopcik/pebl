import type { CliContext } from '../context.js';
import { runDueRechecks } from '../verification/opportunistic.js';

/** `pebl recheck [--due]` — manually runs due rechecks; also what the OS-scheduler entry invokes daily. */
export function runRecheckCommand(context: CliContext, stdout: NodeJS.WritableStream = process.stdout): void {
  const summary = runDueRechecks(context.db);
  stdout.write(
    `pebl: checked ${summary.checked} due verification checkpoint(s), ` +
      `${summary.reversed} reversed, ${summary.skippedNoRootPath} skipped (unknown project path).\n`,
  );
}
